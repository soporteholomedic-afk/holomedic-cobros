import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';

import { SqlServerCalidadRepository } from '../sqlServerCalidadRepository';
import { SqlServerConocimientoRepository } from '../sqlServerConocimientoRepository';
import { SqlServerConversacionRepository } from '../sqlServerConversacionRepository';
import { SqlServerMensajeRepository } from '../sqlServerMensajeRepository';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `SqlServerCalidadRepository`
 * (agente-ia-crm E4·T6) against the real SHARED HOLOMEDIC SQL Server.
 * Same probe rules as the mensaje suite: per-run random suffix, own
 * probe rows (parent conversación + mensajes + solicitud + huecos),
 * tracked ids deleted in `finally` with an `afterAll` backstop, zero
 * assumptions about foreign rows.
 *
 * Determinism against the SHARED tables (the aggregate reads the whole
 * window, other suites' rows are in it): the probe stamps its rows
 * `creadoEn` 12 hours INTO THE FUTURE (DATEADD) and queries with
 * `desde` = now — foreign rows (all past-stamped) are excluded, so
 * every windowed metric is EXACTLY the probe's own rows regardless of
 * the SYSDATETIME/SYSUTCDATETIME clock mix. The zero-state (NULL nunca
 * es 0) is pinned with a FUTURE window (nothing qualifies); window
 * exclusion with rows moved 40 days back; huecosAbiertos (NOT
 * windowed) is asserted by baseline delta.
 *
 * Pinned here (E4·T6): respuestasIa counts ONLY emisor='IA' with
 * score; scorePromedio/fidelidadPromedio are NULL when no qualifying
 * row (never 0); % con fuentes excludes fuentes '[]' and counts only
 * generated answers; marcadasDeficiente counts IA deficiente=1;
 * solicitudesAyuda is the windowed CRM_SolicitudesAyuda count;
 * huecosAbiertos is the TOTAL ABIERTO count (no window);
 * intervencionesHumanas counts emisor='HUMANO' AND direccion='OUT'.
 */

const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const DIGITOS = Math.floor(Math.random() * 1_000_000)
  .toString()
  .padStart(6, '0');

let pool: mssql.ConnectionPool;
let repo: SqlServerCalidadRepository;
let repoConversaciones: SqlServerConversacionRepository;
let repoMensajes: SqlServerMensajeRepository;
let repoConocimiento: SqlServerConocimientoRepository;
let secuencia = 0;

const conversacionesCreadas = new Set<number>();
const huecosCreados = new Set<number>();

async function limpiarProbe(): Promise<void> {
  // Huecos PRIMERO (sobreviven a la conversación: FK SET NULL), luego
  // la conversación arrastra mensajes + solicitudes por CASCADE.
  for (const id of huecosCreados) {
    await pool
      .request()
      .input('id', mssql.BigInt, id)
      .query('DELETE FROM dbo.CRM_ConocimientoHuecos WHERE id = @id');
  }
  huecosCreados.clear();
  for (const id of conversacionesCreadas) {
    await pool
      .request()
      .input('id', mssql.Int, id)
      .query('DELETE FROM dbo.CRM_Conversaciones WHERE id = @id');
  }
  conversacionesCreadas.clear();
}

/** One probe parent conversación (unique canal keys, random run digits). */
async function crearConversacionProbe(): Promise<number> {
  secuencia += 1;
  const conversacion = await repoConversaciones.crear({
    canal: 'WHATSAPP',
    telefono: `+595984${DIGITOS}${String(secuencia).padStart(4, '0')}`,
    identificadorCanal: `probe-${SUFIJO}-c${secuencia}`,
  });
  conversacionesCreadas.add(conversacion.id);
  return conversacion.id;
}

/** Re-stamp a probe message's creadoEn (SYSDATETIME clock, local). */
async function estamparMensaje(id: number, sqlDelta: string): Promise<void> {
  await pool
    .request()
    .input('id', mssql.BigInt, id)
    .query(`UPDATE dbo.CRM_Mensajes SET creadoEn = DATEADD(${sqlDelta}) WHERE id = @id`);
}

/** Re-stamp a probe solicitud's creadoEn (SYSUTCDATETIME clock, UTC). */
async function estamparSolicitud(id: number, sqlDelta: string): Promise<void> {
  await pool
    .request()
    .input('id', mssql.BigInt, id)
    .query(`UPDATE dbo.CRM_SolicitudesAyuda SET creadoEn = DATEADD(${sqlDelta}) WHERE id = @id`);
}

const EN_VENTANA = 'HOUR, 12, SYSDATETIME()';
const FUERA_DE_VENTANA = 'DAY, -40, SYSDATETIME()';

beforeAll(async () => {
  const db = await getCrmDb();
  pool = db.pool;
  repo = new SqlServerCalidadRepository(pool);
  repoConversaciones = new SqlServerConversacionRepository(pool);
  repoMensajes = new SqlServerMensajeRepository(pool);
  repoConocimiento = new SqlServerConocimientoRepository(pool);
});

afterAll(async () => {
  if (pool) {
    await limpiarProbe(); // idempotente por si un finally no alcanzó a correr
    await pool.close();
  }
});

describe('SqlServerCalidadRepository (integración, filas probe propias)', () => {
  it('ventana sin filas ⇒ ceros y NULLs exactos (NULL nunca es 0)', async () => {
    // desde en el futuro: NINGUNA fila (probe ni ajena) califica.
    const desde = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const resumen = await repo.obtenerResumen(desde);

    expect(resumen.desde).toBe(desde.toISOString());
    expect(resumen.respuestasIa).toBe(0);
    expect(resumen.scorePromedio).toBeNull();
    expect(resumen.fidelidadPromedio).toBeNull();
    expect(resumen.porcentajeConFuentes).toBeNull();
    expect(resumen.marcadasDeficiente).toBe(0);
    expect(resumen.solicitudesAyuda).toBe(0);
    expect(resumen.intervencionesHumanas).toBe(0);
    // huecosAbiertos NO es ventanado: total vivo de la tabla.
    expect(typeof resumen.huecosAbiertos).toBe('number');
    expect(resumen.huecosAbiertos).toBeGreaterThanOrEqual(0);
  });

  it('métricas exactas de la ventana propia (score/fidelidad/%, NULLs, contadores)', async () => {
    const conversacionId = await crearConversacionProbe();

    // m1: respuesta generada CON score y fuentes, fidelidad, marcada deficiente.
    const m1 = await repoMensajes.crear({
      conversacionId,
      direccion: 'OUT',
      emisor: 'IA',
      cuerpo: 'El examen ocupacional incluye audiometría.',
      estadoEnvio: 'ENVIADO',
      fuentes: '[{"id":7,"tipo":"KB","titulo":"Examen ocupacional"}]',
      score: 0.8,
      fidelidad: 0.9,
      modelo: 'glm-test',
    });
    // m2: respuesta generada CON score pero SIN fuentes ('[]').
    const m2 = await repoMensajes.crear({
      conversacionId,
      direccion: 'OUT',
      emisor: 'IA',
      cuerpo: 'Respuesta sin fuentes citadas.',
      estadoEnvio: 'ENVIADO',
      fuentes: '[]',
      score: 0.9,
      modelo: 'glm-test',
    });
    // m3: mensaje IA SIN score (escalación sin generación) — NO cuenta
    // como respuesta ni en el % con fuentes.
    const m3 = await repoMensajes.crear({
      conversacionId,
      direccion: 'OUT',
      emisor: 'IA',
      cuerpo: 'Escalación al humano sin generación.',
      estadoEnvio: 'ENVIADO',
      fuentes: '[{"id":8,"tipo":"KB","titulo":"No generada"}]',
      score: null,
      modelo: null,
    });
    // m4: intervención humana (HUMANO/OUT) — cuenta solo esta.
    const m4 = await repoMensajes.crear({
      conversacionId,
      direccion: 'OUT',
      emisor: 'HUMANO',
      cuerpo: 'Le confirmo por este medio.',
      estadoEnvio: 'ENVIADO',
    });
    // m5: mensaje del cliente (IN) — ruido, no cuenta en ninguna métrica.
    const m5 = await repoMensajes.crear({
      conversacionId,
      direccion: 'IN',
      emisor: 'CLIENTE',
      cuerpo: 'Hola, necesito un presupuesto',
    });

    // Baseline de huecos ANTES de sembrar los de esta corrida.
    const pre = await repo.obtenerResumen(new Date(Date.now() + 24 * 60 * 60 * 1000));

    const marcada = await repoMensajes.marcarDeficiente(m1.id);
    expect(marcada?.deficiente).toBe(true);

    const solicitud = await repoConversaciones.crearSolicitudAyuda({
      conversacionId,
      consulta: `¿Hacen exámenes para minería ${SUFIJO}?`,
      terminosBuscados: ['exámenes', 'minería'],
      score: 0.15,
    });

    const huecoAbierto = await repoConocimiento.crearHueco({
      consulta: `Hueco ABIERTO ${SUFIJO}`,
      terminos: ['hueco'],
    });
    huecosCreados.add(huecoAbierto.id);
    const huecoCurado = await repoConocimiento.crearHueco({
      consulta: `Hueco CURADO ${SUFIJO}`,
      terminos: ['hueco'],
      estado: 'CURADO',
    });
    huecosCreados.add(huecoCurado.id);

    try {
      // Filas de la corrida 12 h en el futuro ⇒ ventana desde=ahora es EXACTA
      // (el reloj del SQL Server va ~4 h detrás del de Node: el margen lo
      // absorbe; filas ajenas, todas en pasado, quedan fuera).
      for (const id of [m1.id, m2.id, m3.id, m4.id, m5.id]) await estamparMensaje(id, EN_VENTANA);
      await estamparSolicitud(solicitud.id, 'HOUR, 12, SYSUTCDATETIME()');

      const resumen = await repo.obtenerResumen(new Date());

      expect(resumen.respuestasIa).toBe(2); // m1 + m2 (m3 sin score no cuenta)
      expect(resumen.scorePromedio).toBeCloseTo(0.85, 6); // (0.8 + 0.9) / 2
      expect(resumen.fidelidadPromedio).toBeCloseTo(0.9, 6); // solo m1 reporta
      expect(resumen.porcentajeConFuentes).toBeCloseTo(50, 6); // m1 sí, m2 '[]'
      expect(resumen.marcadasDeficiente).toBe(1);
      expect(resumen.solicitudesAyuda).toBe(1);
      expect(resumen.intervencionesHumanas).toBe(1); // m4 (m5 es CLIENTE/IN)
      expect(resumen.huecosAbiertos).toBe(pre.huecosAbiertos + 1); // solo el ABIERTO
    } finally {
      await limpiarProbe();
    }
  });

  it('filas fuera de la ventana no cuentan; huecosAbiertos ignora la ventana', async () => {
    const conversacionId = await crearConversacionProbe();

    const m1 = await repoMensajes.crear({
      conversacionId,
      direccion: 'OUT',
      emisor: 'IA',
      cuerpo: 'Respuesta vieja.',
      estadoEnvio: 'ENVIADO',
      fuentes: '[{"id":7,"tipo":"KB","titulo":"Examen ocupacional"}]',
      score: 0.8,
      modelo: 'glm-test',
    });
    const m2 = await repoMensajes.crear({
      conversacionId,
      direccion: 'OUT',
      emisor: 'IA',
      cuerpo: 'Respuesta reciente.',
      estadoEnvio: 'ENVIADO',
      fuentes: '[]',
      score: 0.9,
      modelo: 'glm-test',
    });
    const m4 = await repoMensajes.crear({
      conversacionId,
      direccion: 'OUT',
      emisor: 'HUMANO',
      cuerpo: 'Intervención reciente.',
      estadoEnvio: 'ENVIADO',
    });

    const solicitud = await repoConversaciones.crearSolicitudAyuda({
      conversacionId,
      consulta: `Solicitud vieja ${SUFIJO}`,
      terminosBuscados: ['vieja'],
      score: null,
    });
    const hueco = await repoConocimiento.crearHueco({
      consulta: `Hueco sin ventana ${SUFIJO}`,
      terminos: ['hueco'],
    });
    huecosCreados.add(hueco.id);

    try {
      // Toda la corrida 12 h adelante; LUEGO se veterana lo que debe
      // quedar FUERA (−40 días): el mensaje IA m1 (marcado deficiente) y
      // la solicitud. m2/m4 siguen en ventana.
      for (const id of [m1.id, m2.id, m4.id]) await estamparMensaje(id, EN_VENTANA);
      await estamparMensaje(m1.id, FUERA_DE_VENTANA);
      await repoMensajes.marcarDeficiente(m1.id);
      await estamparSolicitud(solicitud.id, 'HOUR, 12, SYSUTCDATETIME()');
      await estamparSolicitud(solicitud.id, 'DAY, -40, SYSUTCDATETIME()');

      const resumen = await repo.obtenerResumen(new Date());

      expect(resumen.respuestasIa).toBe(1); // solo la reciente (m1 quedó fuera)
      expect(resumen.scorePromedio).toBeCloseTo(0.9, 6);
      expect(resumen.porcentajeConFuentes).toBeCloseTo(0, 6); // la reciente es '[]'
      expect(resumen.marcadasDeficiente).toBe(0); // la marca vieja no cuenta
      expect(resumen.solicitudesAyuda).toBe(0); // solicitud vieja fuera
      expect(resumen.intervencionesHumanas).toBe(1);
      // El hueco NO se ventana: existe sea cual sea su creadoEn.
      expect(resumen.huecosAbiertos).toBeGreaterThanOrEqual(1);
    } finally {
      await limpiarProbe();
    }
  });
});
