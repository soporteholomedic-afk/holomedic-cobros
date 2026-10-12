import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';

import type { MensajeCrm } from '../../../domain/entities';
import { SqlServerConversacionRepository } from '../sqlServerConversacionRepository';
import { SqlServerMensajeRepository } from '../sqlServerMensajeRepository';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `SqlServerMensajeRepository`
 * (agente-ia-crm E1) against the real SHARED HOLOMEDIC SQL Server.
 * Same resilience rules as the conversación suite: per-run random
 * suffix, own probe rows (one parent conversación per test, unique
 * telefono/identificadorCanal), tracked ids deleted in `finally`
 * (CRM_Mensajes falls with the conversación via FK CASCADE) and zero
 * assumptions about foreign rows.
 *
 * Pinned here (advisory remediation E1):
 * - idempotencia dedup (existePorIdempotenciaKey true/false);
 * - thread paging: newest-first pages with the exclusive antesDeId
 *   cursor (the port contract — the view renders reversed);
 * - actualizarEnvio: ENVIADO sets wamid; FALLIDO WITHOUT wamid
 *   PRESERVES the stored one (R3 fallido-borra-wamid regression);
 *   explicit null DOES clear it; missing id → null.
 */

const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const DIGITOS = Math.floor(Math.random() * 1_000_000)
  .toString()
  .padStart(6, '0');

let pool: mssql.ConnectionPool;
let repoConversaciones: SqlServerConversacionRepository;
let repoMensajes: SqlServerMensajeRepository;
let secuencia = 0;

const conversacionesCreadas = new Set<number>();

async function limpiarProbe(): Promise<void> {
  // Los mensajes caen por FK CASCADE al borrar su conversación.
  for (const id of conversacionesCreadas) {
    await pool.request().input('id', mssql.Int, id)
      .query('DELETE FROM dbo.CRM_Conversaciones WHERE id = @id');
  }
  conversacionesCreadas.clear();
}

/** One probe parent conversación (unique canal keys, random run digits). */
async function crearConversacionProbe(): Promise<number> {
  secuencia += 1;
  const conversacion = await repoConversaciones.crear({
    canal: 'WHATSAPP',
    telefono: `+595983${DIGITOS}${String(secuencia).padStart(4, '0')}`,
    identificadorCanal: `probe-${SUFIJO}-m${secuencia}`,
  });
  conversacionesCreadas.add(conversacion.id);
  return conversacion.id;
}

function keyProbe(): string {
  secuencia += 1;
  return `probe-${SUFIJO}-k${secuencia}`;
}

beforeAll(async () => {
  const db = await getCrmDb();
  pool = db.pool;
  repoConversaciones = new SqlServerConversacionRepository(pool);
  repoMensajes = new SqlServerMensajeRepository(pool);
});

afterAll(async () => {
  if (pool) {
    await limpiarProbe(); // idempotente por si un finally no alcanzó a correr
    await pool.close();
  }
});

describe('SqlServerMensajeRepository (integración, filas probe propias)', () => {
  it('crear + existePorIdempotenciaKey true/false, round-trip del mapeo', async () => {
    try {
      const conversacionId = await crearConversacionProbe();
      const key = keyProbe();

      const mensaje = await repoMensajes.crear({
        conversacionId,
        direccion: 'IN',
        emisor: 'CLIENTE',
        cuerpo: 'Hola, necesito un presupuesto',
        tipo: 'TEXTO',
        canal: 'WHATSAPP',
        wamid: `wamid.${SUFIJO}`,
        idempotenciaKey: key,
        estadoEnvio: null,
      });

      expect(mensaje).toMatchObject({
        id: expect.any(Number),
        conversacionId,
        direccion: 'IN',
        emisor: 'CLIENTE',
        cuerpo: 'Hola, necesito un presupuesto',
        tipo: 'TEXTO',
        canal: 'WHATSAPP',
        wamid: `wamid.${SUFIJO}`,
        idempotenciaKey: key,
        estadoEnvio: null,
        fuentes: null,
        score: null,
        modelo: null,
        promptVersion: null,
      });
      expect(mensaje.creadoEn).toBeTruthy();

      expect(await repoMensajes.existePorIdempotenciaKey(key)).toBe(true);
      expect(await repoMensajes.existePorIdempotenciaKey(keyProbe())).toBe(false);
    } finally {
      await limpiarProbe();
    }
  });

  it('crear roundtrip promptVersion (E4·T1): se guarda y se lee igual que score/modelo', async () => {
    try {
      const conversacionId = await crearConversacionProbe();

      const mensaje = await repoMensajes.crear({
        conversacionId,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'El examen incluye examen médico y audiometría.',
        estadoEnvio: 'PENDIENTE',
        fuentes: '[{"id":7,"tipo":"KB","titulo":"Examen ocupacional"}]',
        score: 0.9,
        modelo: 'glm-test',
        promptVersion: 'v2',
      });

      expect(mensaje.promptVersion).toBe('v2');

      const hilo = await repoMensajes.listarPorConversacion(conversacionId, { limite: 10 });
      expect(hilo).toHaveLength(1);
      expect(hilo[0]?.promptVersion).toBe('v2');
    } finally {
      await limpiarProbe();
    }
  });

  it('crear roundtrip fidelidad + deficiente (E4·T5): DECIMAL(4,3) cruza como number, BIT como boolean, defaults correctos', async () => {
    try {
      const conversacionId = await crearConversacionProbe();

      const conFidelidad = await repoMensajes.crear({
        conversacionId,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'Respuesta con fidelidad autoevaluada',
        estadoEnvio: 'ENVIADO',
        score: 0.8,
        fidelidad: 0.905,
      });
      expect(conFidelidad.fidelidad).toBeCloseTo(0.905, 6);
      expect(conFidelidad.deficiente).toBe(false); // DEFAULT 0

      const sinNada = await repoMensajes.crear({
        conversacionId,
        direccion: 'IN',
        emisor: 'CLIENTE',
        cuerpo: 'consulta del cliente',
      });
      expect(sinNada.fidelidad).toBeNull(); // columna nullable
      expect(sinNada.deficiente).toBe(false);

      const hilo = await repoMensajes.listarPorConversacion(conversacionId, { limite: 10 });
      expect(hilo.map((m) => m.fidelidad)).toEqual([null, expect.any(Number)]);
      expect(hilo.every((m) => m.deficiente === false)).toBe(true);
    } finally {
      await limpiarProbe();
    }
  });

  it('marcarDeficiente (E4·T5): marca 1 y devuelve la fila, es idempotente y null con id desconocido', async () => {
    try {
      const conversacionId = await crearConversacionProbe();
      const mensaje = await repoMensajes.crear({
        conversacionId,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'respuesta a marcar',
        estadoEnvio: 'ENVIADO',
        score: 0.9,
        fidelidad: 0.9,
      });

      const primera = await repoMensajes.marcarDeficiente(mensaje.id);
      expect(primera).not.toBeNull();
      expect(primera?.deficiente).toBe(true);
      // Idempotente: marcar de nuevo NO falla ni altera el resto de la fila.
      const segunda = await repoMensajes.marcarDeficiente(mensaje.id);
      expect(segunda?.deficiente).toBe(true);
      expect(segunda?.score).toBe(0.9);
      expect(segunda?.fidelidad).toBeCloseTo(0.9, 6);

      // La marca se lee desde el hilo (el repo SELECT la mapea).
      const hilo = await repoMensajes.listarPorConversacion(conversacionId, { limite: 10 });
      expect(hilo[0]?.deficiente).toBe(true);

      expect(await repoMensajes.marcarDeficiente(4_000_000_000)).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('obtenerPorId público (E4·T5): devuelve la fila o null con id desconocido', async () => {
    try {
      const conversacionId = await crearConversacionProbe();
      const mensaje = await repoMensajes.crear({
        conversacionId,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'para leer por id',
        estadoEnvio: 'ENVIADO',
      });

      const leido = await repoMensajes.obtenerPorId(mensaje.id);
      expect(leido).toMatchObject({ id: mensaje.id, cuerpo: 'para leer por id' });
      expect(await repoMensajes.obtenerPorId(4_000_000_001)).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('listarPorConversacion: páginas newest-first con cursor antesDeId exclusivo', async () => {
    try {
      const conversacionId = await crearConversacionProbe();
      const cuerpos = ['uno', 'dos', 'tres', 'cuatro', 'cinco'];
      const creados: MensajeCrm[] = [];
      for (const cuerpo of cuerpos) {
        creados.push(
          await repoMensajes.crear({
            conversacionId,
            direccion: 'IN',
            emisor: 'CLIENTE',
            cuerpo,
            idempotenciaKey: keyProbe(),
          }),
        );
      }
      const idDe = (cuerpo: string): number => {
        const mensaje = creados.find((m) => m.cuerpo === cuerpo);
        if (mensaje === undefined) throw new Error(`mensaje ${cuerpo} no creado`);
        return mensaje.id;
      };

      // Hilo completo: newest-first DESC (la vista lo renderiza revertido).
      const hilo = await repoMensajes.listarPorConversacion(conversacionId, { limite: 10 });
      expect(hilo.map((m) => m.cuerpo)).toEqual(['cinco', 'cuatro', 'tres', 'dos', 'uno']);

      // Página 1 (las 2 más nuevas) y el cursor exclusivo camina hacia atrás.
      const pagina1 = await repoMensajes.listarPorConversacion(conversacionId, {
        limite: 2,
      });
      expect(pagina1.map((m) => m.cuerpo)).toEqual(['cinco', 'cuatro']);

      const pagina2 = await repoMensajes.listarPorConversacion(conversacionId, {
        limite: 2,
        antesDeId: idDe('cuatro'),
      });
      expect(pagina2.map((m) => m.cuerpo)).toEqual(['tres', 'dos']);

      const pagina3 = await repoMensajes.listarPorConversacion(conversacionId, {
        limite: 2,
        antesDeId: idDe('dos'),
      });
      expect(pagina3.map((m) => m.cuerpo)).toEqual(['uno']);

      // Cursor en el más viejo → vacío; unión sin solaparse = hilo entero.
      expect(
        await repoMensajes.listarPorConversacion(conversacionId, {
          limite: 2,
          antesDeId: idDe('uno'),
        }),
      ).toEqual([]);
      const ids = [...pagina1, ...pagina2, ...pagina3].map((m) => m.id);
      expect(new Set(ids).size).toBe(5);
    } finally {
      await limpiarProbe();
    }
  });

  it('actualizarEnvio ENVIADO con wamid lo persiste', async () => {
    try {
      const conversacionId = await crearConversacionProbe();
      const mensaje = await repoMensajes.crear({
        conversacionId,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'Respuesta enviada',
        estadoEnvio: 'PENDIENTE',
      });

      const actualizado = await repoMensajes.actualizarEnvio(mensaje.id, {
        estadoEnvio: 'ENVIADO',
        wamid: `wamid.ok.${SUFIJO}`,
      });

      expect(actualizado).toMatchObject({
        id: mensaje.id,
        estadoEnvio: 'ENVIADO',
        wamid: `wamid.ok.${SUFIJO}`,
      });
    } finally {
      await limpiarProbe();
    }
  });

  it('actualizarEnvio FALLIDO SIN wamid PRESERVA el wamid existente (regresión); null explícito lo borra', async () => {
    try {
      const conversacionId = await crearConversacionProbe();
      const conservado = await repoMensajes.crear({
        conversacionId,
        direccion: 'OUT',
        emisor: 'HUMANO',
        cuerpo: 'reintento fallido',
        wamid: `wamid.orig.${SUFIJO}`,
        estadoEnvio: 'PENDIENTE',
      });
      const borrado = await repoMensajes.crear({
        conversacionId,
        direccion: 'OUT',
        emisor: 'HUMANO',
        cuerpo: 'borrado explícito',
        wamid: `wamid.borrar.${SUFIJO}`,
        estadoEnvio: 'PENDIENTE',
      });

      // wamid AUSENTE (undefined) = no tocar el valor existente.
      const trasFallo = await repoMensajes.actualizarEnvio(conservado.id, {
        estadoEnvio: 'FALLIDO',
      });
      expect(trasFallo).toMatchObject({
        id: conservado.id,
        estadoEnvio: 'FALLIDO',
        wamid: `wamid.orig.${SUFIJO}`, // PRESERVADO
      });

      // null EXPLÍCITO sí lo borra (semántica del puerto).
      const trasNull = await repoMensajes.actualizarEnvio(borrado.id, {
        estadoEnvio: 'FALLIDO',
        wamid: null,
      });
      expect(trasNull).toMatchObject({ id: borrado.id, estadoEnvio: 'FALLIDO', wamid: null });
    } finally {
      await limpiarProbe();
    }
  });

  it('actualizarEnvio id inexistente → null', async () => {
    try {
      const maximo = await pool.request().query('SELECT MAX(id) AS maximo FROM dbo.CRM_Mensajes');
      const idInexistente =
        ((maximo.recordset as { maximo: number | null }[])[0]?.maximo ?? 0) + 1000;

      expect(
        await repoMensajes.actualizarEnvio(idInexistente, { estadoEnvio: 'ENVIADO' }),
      ).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });
});
