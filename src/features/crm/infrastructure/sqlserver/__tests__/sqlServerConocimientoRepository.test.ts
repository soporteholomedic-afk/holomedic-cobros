import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';

import { SqlServerConocimientoRepository } from '../sqlServerConocimientoRepository';
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

  it('buscarPorTexto: prefilter LIKE sobre titulo y contenido', async () => {
    try {
      const idTitulo = await insertarProbe({
        titulo: `${MARCA} certificados`,
        contenido: 'nada relevante aqui',
      });
      const idContenido = await insertarProbe({
        titulo: `${MARCA} otro`,
        contenido: `habla de examenes ocupacionales ${SUFIJO} en el cuerpo`,
      });

      const porTitulo = await repo.buscarPorTexto(`${MARCA} certificados`);
      expect(porTitulo.map((e) => e.id)).toEqual([idTitulo]);

      const porContenido = await repo.buscarPorTexto(`ocupacionales ${SUFIJO}`);
      expect(porContenido.map((e) => e.id)).toEqual([idContenido]);

      // Texto vacío → [] sin llegar a la base.
      expect(await repo.buscarPorTexto('   ')).toEqual([]);
    } finally {
      await limpiarProbe();
    }
  });

  it('buscarPorTexto escapa comodines: % y _ literales matchean SOLO lo literal', async () => {
    try {
      // A lleva '%' INMEDIATAMENTE antes del sufijo (regresión del '%'
      // inicial del pattern) y '_' literal en descuento_premium.
      const idConComodines = await insertarProbe({
        titulo: `${MARCA} 50%${SUFIJO} descuento_premium`,
        contenido: 'contenido con % y _ literales',
      });
      const idLimpio = await insertarProbe({
        titulo: `${MARCA} limpio`,
        contenido: 'texto completamente normal',
      });

      // Base: ambas filas son visibles bajo el sufijo propio.
      const base = await repo.buscarPorTexto(SUFIJO);
      const idsBase = new Set(base.map((e) => e.id));
      expect(idsBase.has(idConComodines)).toBe(true);
      expect(idsBase.has(idLimpio)).toBe(true);

      // REGRESIÓN '%': un '%' inicial de la consulta matchea SOLO la fila
      // con '%' LITERAL justo antes del sufijo — con el escape roto el
      // pattern '%%sufijo%' traería TAMBIÉN la fila limpia.
      const conPorcentaje = await repo.buscarPorTexto(`%${SUFIJO}`);
      const idsCon = new Set(conPorcentaje.map((e) => e.id));
      expect(idsCon.has(idConComodines)).toBe(true);
      expect(idsCon.has(idLimpio)).toBe(false);

      // REGRESIÓN '_': 'l_mpio' con '_' literal no matchea 'limpio' —
      // con el escape roto '_' sería comodín de un carácter.
      const conGuionBajo = await repo.buscarPorTexto(`l_mpio ${SUFIJO}`);
      const idsGuion = new Set(conGuionBajo.map((e) => e.id));
      expect(idsGuion.has(idLimpio)).toBe(false);
      expect(idsGuion.has(idConComodines)).toBe(false);
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
