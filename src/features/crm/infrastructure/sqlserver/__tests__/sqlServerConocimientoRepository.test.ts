import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';

import { SqlServerConocimientoRepository } from '../sqlServerConocimientoRepository';
import { SqlServerConversacionRepository } from '../sqlServerConversacionRepository';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `SqlServerConocimientoRepository`
 * (agente-ia-crm E2·T1) against the real dev HOLOMEDIC SQL Server —
 * the user authorized inserting and removing test data here. Every
 * probe row carries the `[E2T1-PROBE]` titulo marker plus a per-run
 * random suffix; ids are tracked and deleted in `finally`, with the
 * marker prefix as the afterAll backstop. NO assertion assumes
 * anything about rows owned by other runs/users.
 *
 * Pinned here:
 * - listarActivas / buscarPorTexto NEVER return activo = 0 rows.
 * - LIKE escaping (E1 lesson): a probe whose titulo contains LITERAL
 *   '%' and '_' is matched only by escaped-wildcard searches; the
 *   wildcards are never treated as multi-row patterns.
 * - etiquetas CSV → string[] (trimmed, empties dropped).
 * - vigenciaDesde/vigenciaHasta round-trip as Date (or null).
 */

const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const MARCA = `[E2T1-PROBE]-${SUFIJO}`;

let pool: mssql.ConnectionPool;
let repo: SqlServerConocimientoRepository;

const idsCreados = new Set<number>();

/** Deletes ONLY what this run created — tracked ids first. */
async function limpiarProbe(): Promise<void> {
  for (const id of idsCreados) {
    await pool.request().input('id', mssql.Int, id)
      .query('DELETE FROM dbo.CRM_Conocimiento WHERE id = @id');
  }
  idsCreados.clear();
}

/** Marker-prefix backstop (the adapter escapes the same way in prod). */
async function limpiarPorMarca(): Promise<void> {
  await pool
    .request()
    .input('patron', mssql.NVarChar(300), `${MARCA}%`)
    .query('DELETE FROM dbo.CRM_Conocimiento WHERE titulo LIKE @patron');
}

// ---- E3 (agente-ia-crm): huecos de conocimiento ----

const huecosCreados = new Set<number>();
const conversacionesCreadas = new Set<number>();
let secuenciaE3 = 0;

/** Unique E.164-ish probe phone for the E3 solicitud fixtures. */
function telefonoProbeE3(): string {
  secuenciaE3 += 1;
  return `+595985${Date.now().toString().slice(-8)}${secuenciaE3}`;
}

/** E3 cleanup: huecos primero (SET NULL no los borra), luego conversaciones. */
async function limpiarProbeE3(): Promise<void> {
  for (const id of huecosCreados) {
    await pool.request().input('id', mssql.BigInt, id).query(`
      IF OBJECT_ID('dbo.CRM_ConocimientoHuecos') IS NOT NULL
        DELETE FROM dbo.CRM_ConocimientoHuecos WHERE id = @id
    `);
  }
  huecosCreados.clear();
  for (const id of conversacionesCreadas) {
    await pool.request().input('id', mssql.Int, id)
      .query('DELETE FROM dbo.CRM_Conversaciones WHERE id = @id');
  }
  conversacionesCreadas.clear();
}

interface InsertarProbeOpciones {
  titulo: string;
  contenido?: string;
  etiquetas?: string;
  vigenciaDesde?: Date | null;
  vigenciaHasta?: Date | null;
  activo?: boolean;
}

async function insertarProbe(opciones: InsertarProbeOpciones): Promise<number> {
  const inserted = await pool
    .request()
    .input('titulo', mssql.NVarChar(200), opciones.titulo)
    .input('contenido', mssql.NVarChar(mssql.MAX), opciones.contenido ?? 'contenido probe')
    .input('etiquetas', mssql.NVarChar(300), opciones.etiquetas ?? 'semilla,probe')
    .input('vigenciaDesde', mssql.DateTime2, opciones.vigenciaDesde ?? null)
    .input('vigenciaHasta', mssql.DateTime2, opciones.vigenciaHasta ?? null)
    .input('activo', mssql.Bit, opciones.activo ?? true).query(`
      INSERT INTO dbo.CRM_Conocimiento
        (titulo, contenido, etiquetas, vigenciaDesde, vigenciaHasta, activo)
      OUTPUT INSERTED.id
      VALUES (@titulo, @contenido, @etiquetas, @vigenciaDesde, @vigenciaHasta, @activo)
    `);
  const id = (inserted.recordset as { id: number }[])[0]?.id;
  if (id === undefined) throw new Error('INSERT probe de CRM_Conocimiento no devolvió id');
  idsCreados.add(id);
  return id;
}

beforeAll(async () => {
  const db = await getCrmDb();
  pool = db.pool;
  repo = db.conocimiento instanceof SqlServerConocimientoRepository
    ? db.conocimiento
    : new SqlServerConocimientoRepository(pool);
});

afterAll(async () => {
  if (pool) {
    // Idempotente por si un finally de test no alcanzó a correr.
    await limpiarProbe();
    await limpiarPorMarca();
    await limpiarProbeE3();
    await pool.close();
  }
});

describe('SqlServerConocimientoRepository (integración, filas probe propias)', () => {
  it('listarActivas omite las filas activo = 0 y mapea etiquetas CSV', async () => {
    try {
      const idActiva = await insertarProbe({
        titulo: `${MARCA} activa`,
        contenido: 'contenido de la entrada activa',
        etiquetas: ' semilla , servicios ,, ',
      });
      const idInactiva = await insertarProbe({
        titulo: `${MARCA} inactiva`,
        activo: false,
      });

      const activas = await repo.listarActivas();
      const ids = new Set(activas.map((e) => e.id));
      expect(ids.has(idActiva)).toBe(true);
      expect(ids.has(idInactiva)).toBe(false);

      const fila = activas.find((e) => e.id === idActiva);
      expect(fila).toMatchObject({
        id: idActiva,
        titulo: `${MARCA} activa`,
        activo: true,
      });
      // CSV → string[] con trim y vacíos fuera.
      expect(fila?.etiquetas).toEqual(['semilla', 'servicios']);
    } finally {
      await limpiarProbe();
    }
  });

  it('buscarPorTexto: prefilter por TÉRMINOS sobre titulo y contenido', async () => {
    try {
      // Tokens únicos por probe: con OR por término, cualquier término
      // compartido une filas (incluida la KB sembrada real) — el
      // aislamiento se logra con tokens aleatorios, no con frases.
      const idTitulo = await insertarProbe({
        titulo: `${MARCA} certificados ${SUFIJO}a`,
        contenido: 'nada relevante aqui',
      });
      const idContenido = await insertarProbe({
        titulo: `${MARCA} otro`,
        contenido: `habla de examenes ocupacionales ${SUFIJO}b en el cuerpo`,
      });

      const porTitulo = await repo.buscarPorTexto(`${SUFIJO}a`);
      expect(porTitulo.map((e) => e.id)).toEqual([idTitulo]);

      const porContenido = await repo.buscarPorTexto(`${SUFIJO}b`);
      expect(porContenido.map((e) => e.id)).toEqual([idContenido]);

      // Texto vacío (o sin términos útiles) → [] sin tocar la base.
      expect(await repo.buscarPorTexto('   ')).toEqual([]);
      expect(await repo.buscarPorTexto('% _ !')).toEqual([]);
    } finally {
      await limpiarProbe();
    }
  });

  it('buscarPorTexto por TÉRMINOS: pregunta natural que NO contiene frases literales de la KB (regresión ensayo live E2·T5)', async () => {
    try {
      // La frase completa como LIKE devolvía SIEMPRE vacío: una pregunta
      // real jamás contiene la frase literal de la entrada. Un SOLO
      // término compartido («certificados») debe alcanzar para traer la
      // fila como candidata (el ranking fino vive en la aplicación).
      // NOTA: la KB sembrada real puede aparecer en el resultado (OR por
      // término) — se afirma PERTENENCIA, no igualdad exacta.
      const idPregunta = await insertarProbe({
        titulo: `${MARCA} certificados médicos ${SUFIJO}c`,
        contenido: 'entrega en 24 horas',
      });

      const pregunta = await repo.buscarPorTexto(
        'Hola, ¿cuánto tardan los certificados médicos?',
      );
      const ids = new Set(pregunta.map((e) => e.id));
      expect(ids.has(idPregunta)).toBe(true);
    } finally {
      await limpiarProbe();
    }
  });

  it('buscarPorTexto: comodines de la consulta son INERTES (el split por términos los elimina); los literales de la fila siguen siendo encontrables', async () => {
    try {
      // Con el prefilter por términos, '%', '_' y demás no-alfanuméricos
      // de la CONSULTA nunca llegan al LIKE (no hay pattern injection
      // posible); los '%' y '_' LITERALES de la fila se encuentran por
      // sus términos alfanuméricos.
      const idConComodines = await insertarProbe({
        titulo: `${MARCA} 50%${SUFIJO}w descuento_premium`,
        contenido: 'contenido con % y _ literales',
      });

      const encontrados = await repo.buscarPorTexto(`50%${SUFIJO}w`);
      const ids = new Set(encontrados.map((e) => e.id));
      expect(ids.has(idConComodines)).toBe(true);

      // Solo comodines → sin términos → [] sin tocar la base.
      expect(await repo.buscarPorTexto('%%%')).toEqual([]);
    } finally {
      await limpiarProbe();
    }
  });

  it('buscarPorTexto omite filas activo = 0', async () => {
    try {
      const idInactiva = await insertarProbe({
        titulo: `${MARCA} oculta`,
        contenido: `unico ${SUFIJO}`,
        activo: false,
      });
      const resultados = await repo.buscarPorTexto(`${MARCA} oculta`);
      expect(resultados.map((e) => e.id)).not.toContain(idInactiva);
    } finally {
      await limpiarProbe();
    }
  });

  it('vigenciaDesde/vigenciaHasta viajan como Date o null (round-trip)', async () => {
    try {
      const desde = new Date('2026-01-01T08:00:00.000Z');
      const hasta = new Date('2026-12-31T23:59:59.000Z');
      const idConVigencia = await insertarProbe({
        titulo: `${MARCA} vigente`,
        vigenciaDesde: desde,
        vigenciaHasta: hasta,
      });
      const idSinVigencia = await insertarProbe({
        titulo: `${MARCA} sin vigencia`,
      });

      const activas = await repo.listarActivas();
      const conVigencia = activas.find((e) => e.id === idConVigencia);
      const sinVigencia = activas.find((e) => e.id === idSinVigencia);

      expect(conVigencia?.vigenciaDesde).toBeInstanceOf(Date);
      expect(conVigencia?.vigenciaDesde?.toISOString()).toBe(desde.toISOString());
      expect(conVigencia?.vigenciaHasta).toBeInstanceOf(Date);
      expect(conVigencia?.vigenciaHasta?.toISOString()).toBe(hasta.toISOString());
      expect(sinVigencia?.vigenciaDesde).toBeNull();
      expect(sinVigencia?.vigenciaHasta).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });
});

describe('E3 (agente-ia-crm): huecos de conocimiento (crearHueco)', () => {
  it('crearHueco por defecto ABIERTO; terminos JSON round-trip; origenSolicitudId null', async () => {
    try {
      const hueco = await repo.crearHueco({
        consulta: `¿Hacen certificados para minería ${SUFIJO}?`,
        terminos: ['certificados', 'minería'],
      });
      huecosCreados.add(hueco.id);
      expect(hueco).toMatchObject({
        id: expect.any(Number),
        consulta: `¿Hacen certificados para minería ${SUFIJO}?`,
        estado: 'ABIERTO',
        origenSolicitudId: null,
      });
      expect(hueco.terminos).toEqual(['certificados', 'minería']);
      expect(hueco.creadoEn).toBeInstanceOf(Date);
    } finally {
      await limpiarProbeE3();
    }
  });

  it('estado explícito + origenSolicitudId enlazado; el hueco SOBREVIVE al borrado de la solicitud (FK SET NULL)', async () => {
    try {
      // Fixture: conversación + solicitud de ayuda propia de esta corrida.
      const conversaciones = new SqlServerConversacionRepository(pool);
      const conv = await conversaciones.crear({
        canal: 'WHATSAPP',
        telefono: telefonoProbeE3(),
        identificadorCanal: `probe-hueco-${SUFIJO}-${secuenciaE3}`,
      });
      conversacionesCreadas.add(conv.id);
      const solicitud = await conversaciones.crearSolicitudAyuda({
        conversacionId: conv.id,
        consulta: `Consulta que deja hueco ${SUFIJO}`,
        terminosBuscados: ['hueco'],
        score: 0.15,
      });

      const hueco = await repo.crearHueco({
        consulta: `Consulta que deja hueco ${SUFIJO}`,
        terminos: ['hueco', 'curado'],
        origenSolicitudId: solicitud.id,
        estado: 'CURADO',
      });
      huecosCreados.add(hueco.id);
      expect(hueco.origenSolicitudId).toBe(solicitud.id);
      expect(hueco.estado).toBe('CURADO');
      expect(hueco.terminos).toEqual(['hueco', 'curado']);

      // Borrar la conversación arrastra la solicitud (CASCADE) pero el
      // hueco SOBREVIVE con origenSolicitudId en NULL: el candidato de
      // hueco de KB es dato de curación, no de la conversación.
      await pool
        .request()
        .input('id', mssql.Int, conv.id)
        .query('DELETE FROM dbo.CRM_Conversaciones WHERE id = @id');
      conversacionesCreadas.delete(conv.id);

      const releido = await pool
        .request()
        .input('id', mssql.BigInt, hueco.id).query(`
          SELECT consulta, terminos, estado, origenSolicitudId
          FROM dbo.CRM_ConocimientoHuecos WHERE id = @id
        `);
      const fila = (releido.recordset as Array<{
        consulta: string;
        terminos: string | null;
        estado: string;
        origenSolicitudId: number | null;
      }>)[0];
      expect(fila?.origenSolicitudId).toBeNull();
      expect(fila?.consulta).toBe(`Consulta que deja hueco ${SUFIJO}`);
      expect(fila?.estado).toBe('CURADO');
      expect(JSON.parse(fila?.terminos ?? '[]')).toEqual(['hueco', 'curado']);
    } finally {
      await limpiarProbeE3();
    }
  });

  it('origenMensajeId (E4·T5): crearHueco lo persiste y el round-trip lo mapea; null cuando no se pasa', async () => {
    try {
      const conOrigen = await repo.crearHueco({
        consulta: `hueco con origen de mensaje ${SUFIJO}`,
        terminos: ['origen', 'mensaje'],
        origenMensajeId: 4_100_000_001,
      });
      huecosCreados.add(conOrigen.id);
      expect(conOrigen.origenMensajeId).toBe(4_100_000_001);

      const sinOrigen = await repo.crearHueco({
        consulta: `hueco sin origen de mensaje ${SUFIJO}`,
        terminos: ['sin', 'origen'],
      });
      huecosCreados.add(sinOrigen.id);
      expect(sinOrigen.origenMensajeId).toBeNull();
    } finally {
      await limpiarProbeE3();
    }
  });

  it('obtenerHuecoPorMensaje (E4·T5): devuelve el ÚLTIMO hueco de ese mensaje; null si no hay; ignora otros mensajes', async () => {
    try {
      const mensajeId = 4_100_000_002;
      const primero = await repo.crearHueco({
        consulta: `primer hueco del mensaje ${SUFIJO}`,
        terminos: ['primero'],
        origenMensajeId: mensajeId,
      });
      huecosCreados.add(primero.id);
      const segundo = await repo.crearHueco({
        consulta: `segundo hueco del mensaje ${SUFIJO}`,
        terminos: ['segundo'],
        origenMensajeId: mensajeId,
      });
      huecosCreados.add(segundo.id);
      const deOtro = await repo.crearHueco({
        consulta: `hueco de otro mensaje ${SUFIJO}`,
        terminos: ['otro'],
        origenMensajeId: 4_100_000_003,
      });
      huecosCreados.add(deOtro.id);

      const encontrado = await repo.obtenerHuecoPorMensaje(mensajeId);
      expect(encontrado?.id).toBe(segundo.id);
      expect(encontrado?.origenMensajeId).toBe(mensajeId);
      expect(encontrado?.consulta).toBe(`segundo hueco del mensaje ${SUFIJO}`);

      expect(await repo.obtenerHuecoPorMensaje(4_199_999_999)).toBeNull();
    } finally {
      await limpiarProbeE3();
    }
  });
});
