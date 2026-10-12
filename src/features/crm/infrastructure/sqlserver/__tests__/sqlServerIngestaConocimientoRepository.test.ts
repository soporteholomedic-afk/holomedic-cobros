import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';

import { SqlServerIngestaConocimientoRepository } from '../sqlServerIngestaConocimientoRepository';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `SqlServerIngestaConocimientoRepository`
 * (agente-ia-crm E4·T7) against the real dev HOLOMEDIC SQL Server —
 * the user authorized inserting and removing test data here. Every
 * probe row carries the `[E4T7-PROBE]` nombre marker plus a per-run
 * random suffix; ids are tracked and deleted in `finally`, with the
 * marker prefix as the afterAll backstop. NO assertion assumes
 * anything about rows owned by other runs/users.
 *
 * Pinned here:
 * - crear/obtenerPorId round-trip: BIGINT id, contenidoCrudo, vigencia
 *   heredable, creadoPor — estado nace PENDIENTE con entradasCreadas 0.
 * - listarRecientes: ORDER BY id DESC, respeta el límite.
 * - marcarProcesando / marcarCompletada(n) / marcarFallida(error):
 *   transiciones de estado con procesadoEn estampado (y error limpio
 *   al completar).
 * - obtenerPorId de una fila inexistente → null (sin inventar filas).
 */

const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const MARCA = `[E4T7-PROBE]-${SUFIJO}`;

let pool: mssql.ConnectionPool;
let repo: SqlServerIngestaConocimientoRepository;

const idsCreados = new Set<number>();

/** Deletes ONLY what this run created — tracked ids first. */
async function limpiarProbe(): Promise<void> {
  for (const id of idsCreados) {
    await pool.request().input('id', mssql.BigInt, id)
      .query('DELETE FROM dbo.CRM_IngestasConocimiento WHERE id = @id');
  }
  idsCreados.clear();
}

/** Marker-prefix backstop (if a finally didn't reach). */
async function limpiarPorMarca(): Promise<void> {
  await pool
    .request()
    .input('patron', mssql.NVarChar(300), `${MARCA}%`)
    .query('DELETE FROM dbo.CRM_IngestasConocimiento WHERE nombre LIKE @patron');
}

beforeAll(async () => {
  const db = await getCrmDb();
  pool = db.pool;
  // El container real SIEMPRE provee el repo (fakes rule) — se fija acá.
  repo = db.ingestaConocimiento instanceof SqlServerIngestaConocimientoRepository
    ? db.ingestaConocimiento
    : new SqlServerIngestaConocimientoRepository(pool);
});

afterAll(async () => {
  if (pool) {
    // Idempotente por si un finally de test no alcanzó a correr.
    await limpiarProbe();
    await limpiarPorMarca();
    await pool.close();
  }
});

describe('SqlServerIngestaConocimientoRepository (integración, filas probe propias)', () => {
  it('crear: round-trip completo con estado PENDIENTE por defecto y entradasCreadas 0', async () => {
    try {
      const desde = new Date('2026-01-01T08:00:00.000Z');
      const hasta = new Date('2026-12-31T08:00:00.000Z');
      const ingesta = await repo.crear({
        nombre: `${MARCA} manual-operativo.pdf`,
        tipo: 'PDF',
        tamanoBytes: Buffer.byteLength('contenido crudo de prueba'),
        contenidoCrudo: 'contenido crudo de prueba',
        creadoPor: 'operador-probe',
        vigenciaDesde: desde,
        vigenciaHasta: hasta,
      });
      idsCreados.add(ingesta.id);

      expect(ingesta.id).toBeGreaterThan(0);
      expect(ingesta.nombre).toBe(`${MARCA} manual-operativo.pdf`);
      expect(ingesta.tipo).toBe('PDF');
      expect(ingesta.contenidoCrudo).toBe('contenido crudo de prueba');
      expect(ingesta.estado).toBe('PENDIENTE');
      expect(ingesta.error).toBeNull();
      expect(ingesta.entradasCreadas).toBe(0);
      expect(ingesta.creadoPor).toBe('operador-probe');
      expect(ingesta.vigenciaDesde).toEqual(desde);
      expect(ingesta.vigenciaHasta).toEqual(hasta);
      expect(ingesta.procesadoEn).toBeNull();
      expect(ingesta.creadoEn).toBeInstanceOf(Date);

      // Re-lectura por id: lo persistido coincide con lo devuelto.
      const releida = await repo.obtenerPorId(ingesta.id);
      expect(releida).not.toBeNull();
      expect(releida?.nombre).toBe(ingesta.nombre);
      expect(releida?.vigenciaDesde).toEqual(desde);
      expect(releida?.contenidoCrudo).toBe('contenido crudo de prueba');
    } finally {
      await limpiarProbe();
    }
  });

  it('crear: los opcionales se quedan en NULL cuando no se pasan', async () => {
    try {
      const ingesta = await repo.crear({
        nombre: `${MARCA} pegado.txt`,
        tipo: 'TEXTO',
        tamanoBytes: 42,
        contenidoCrudo: 'texto pegado',
      });
      idsCreados.add(ingesta.id);
      expect(ingesta.creadoPor).toBeNull();
      expect(ingesta.vigenciaDesde).toBeNull();
      expect(ingesta.vigenciaHasta).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('obtenerPorId de una fila inexistente → null', async () => {
    await expect(repo.obtenerPorId(-999999)).resolves.toBeNull();
  });

  it('listarRecientes: id DESC y respeta el límite', async () => {
    try {
      const primera = await repo.crear({
        nombre: `${MARCA} primera.txt`,
        tipo: 'TXT',
        tamanoBytes: 1,
        contenidoCrudo: 'primera',
      });
      const segunda = await repo.crear({
        nombre: `${MARCA} segunda.txt`,
        tipo: 'TXT',
        tamanoBytes: 2,
        contenidoCrudo: 'segunda',
      });
      idsCreados.add(primera.id);
      idsCreados.add(segunda.id);
      expect(segunda.id).toBeGreaterThan(primera.id);

      const recientes = await repo.listarRecientes(10);
      const ids = recientes.map((i) => i.id);
      expect(ids.indexOf(segunda.id)).toBeLessThan(ids.indexOf(primera.id));
      // DESC estricto en toda la lista (sin reordenamientos raros).
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeLessThan(ids[i - 1] ?? 0);
      }
      // El límite se respeta.
      const dos = await repo.listarRecientes(2);
      expect(dos).toHaveLength(2);
      expect(dos[0]?.id).toBe(segunda.id);
    } finally {
      await limpiarProbe();
    }
  });

  it('marcarProcesando → marcarCompletada(n): estado, contador y procesadoEn', async () => {
    try {
      const ingesta = await repo.crear({
        nombre: `${MARCA} completa.docx`,
        tipo: 'DOCX',
        tamanoBytes: 10,
        contenidoCrudo: 'documento',
      });
      idsCreados.add(ingesta.id);

      await repo.marcarProcesando(ingesta.id);
      const procesando = await repo.obtenerPorId(ingesta.id);
      expect(procesando?.estado).toBe('PROCESANDO');
      expect(procesando?.procesadoEn).toBeNull();

      await repo.marcarCompletada(ingesta.id, 7);
      const completada = await repo.obtenerPorId(ingesta.id);
      expect(completada?.estado).toBe('COMPLETADA');
      expect(completada?.entradasCreadas).toBe(7);
      expect(completada?.procesadoEn).toBeInstanceOf(Date);
      expect(completada?.error).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('marcarFallida: estado FALLIDA con el mensaje y procesadoEn', async () => {
    try {
      const ingesta = await repo.crear({
        nombre: `${MARCA} rota.pdf`,
        tipo: 'PDF',
        tamanoBytes: 10,
        contenidoCrudo: 'pdf ilegible',
      });
      idsCreados.add(ingesta.id);

      await repo.marcarFallida(ingesta.id, 'pdf parse error de prueba');
      const fallida = await repo.obtenerPorId(ingesta.id);
      expect(fallida?.estado).toBe('FALLIDA');
      expect(fallida?.error).toBe('pdf parse error de prueba');
      expect(fallida?.procesadoEn).toBeInstanceOf(Date);
      expect(fallida?.entradasCreadas).toBe(0);
    } finally {
      await limpiarProbe();
    }
  });
});
