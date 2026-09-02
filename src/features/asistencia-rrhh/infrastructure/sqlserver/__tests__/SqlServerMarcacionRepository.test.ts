import { describe, expect, it } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerMarcacionRepository } from '../SqlServerMarcacionRepository';

/**
 * SQL contract for `SqlServerMarcacionRepository.insertarLote` (ADR-4):
 *
 * - Batches are split into ~300-row chunks — each INSERT…SELECT VALUES
 *   carries at most 300×4+1 parameters, safely under SQL Server's 2100
 *   parameter limit (R2).
 * - Idempotency: `WHERE NOT EXISTS` on the uq_marcacion triple
 *   (userId, fechaHora, punch); intra-lote duplicates are collapsed
 *   BEFORE building the VALUES constructor (two equal rows inside one
 *   statement would violate the UNIQUE constraint).
 * - REQ-F1-02: empleadoId resolves through a join on userId with NO
 *   estado filter — a PENDIENTE_FICHA ficha is a known user; only a
 *   missing ficha row leaves empleadoId NULL.
 * - Each chunk runs inside its own transaction (atomic per chunk).
 * - Naive Lima wall-clock: the wire string binds as VARCHAR and is CAST
 *   to DATETIME2(0) — no timezone reinterpretation (ADR-9).
 *
 * The fake pool pins "the right SQL is sent" (migrate.test.ts
 * precedent); actual INSERT/UNIQUE semantics are SQL Server's. The
 * `duplicados` accounting (recibidos − insertados) lives in the use
 * case (ingestarMarcaciones.test.ts) — the adapter only reports
 * `insertados` and the unknown user_ids, exactly as its port declares.
 */

interface Consulta {
  sql: string;
  inputs: Record<string, unknown>;
}

function makeFakePool(
  opciones: {
    /** rowsAffected returned per INSERT…SELECT statement, consumed in order. */
    rowsAffectedInsert?: number[];
    /** recordset returned by non-INSERT statements (the unknowns query). */
    recordset?: unknown[];
    /** When an executed SQL matches, the statement rejects (rollback test). */
    fallarEn?: RegExp;
  } = {},
) {
  const consultas: Consulta[] = [];
  const eventos: string[] = [];
  let idxInsert = 0;

  const makeRequest = () => {
    const inputs: Record<string, unknown> = {};
    const request = {
      input: (name: string, _type: unknown, value: unknown) => {
        inputs[name] = value;
        return request;
      },
      query: async (sql: string) => {
        if (opciones.fallarEn?.test(sql)) throw new Error('boom');
        consultas.push({ sql, inputs: { ...inputs } });
        if (ES_INSERT.test(sql)) {
          const valor = opciones.rowsAffectedInsert?.[idxInsert] ?? 0;
          idxInsert += 1;
          return { recordset: [], rowsAffected: [valor] };
        }
        return { recordset: opciones.recordset ?? [], rowsAffected: [0] };
      },
    };
    return request;
  };

  const pool = {
    request: () => makeRequest(),
    transaction: () => ({
      begin: async () => {
        eventos.push('begin');
      },
      commit: async () => {
        eventos.push('commit');
      },
      rollback: async () => {
        eventos.push('rollback');
      },
      request: () => makeRequest(),
    }),
  };

  return { pool: pool as unknown as mssql.ConnectionPool, consultas, eventos };
}

function wire(user_id: string, punch: number, fecha_hora = '2026-09-01T08:15:00') {
  return { user_id, fecha_hora, punch, tipo_verificacion: 'HUELLA' as const };
}

const ES_INSERT = /INSERT\s+INTO\s+dbo\.marcaciones_raw/i;

describe('SqlServerMarcacionRepository.insertarLote (ADR-4)', () => {
  it('empty batch sends nothing and reports zero', async () => {
    const { pool, consultas } = makeFakePool();
    const repo = new SqlServerMarcacionRepository(pool);
    const resultado = await repo.insertarLote(7, []);
    expect(resultado).toEqual({ insertados: 0, userIdsDesconocidos: [] });
    expect(consultas).toHaveLength(0);
  });

  it('a small batch runs ONE transaction (begin + commit) with ONE INSERT…SELECT', async () => {
    const { pool, consultas, eventos } = makeFakePool({ rowsAffectedInsert: [3] });
    const repo = new SqlServerMarcacionRepository(pool);
    const items = [wire('U001', 1), wire('U001', 2), wire('U002', 3)];
    const resultado = await repo.insertarLote(7, items);
    expect(eventos).toEqual(['begin', 'commit']);
    expect(consultas.filter((c) => ES_INSERT.test(c.sql))).toHaveLength(1);
    expect(resultado.insertados).toBe(3);
  });

  it('collapses intra-lote duplicates BEFORE the VALUES constructor (UNIQUE-safe)', async () => {
    const { pool, consultas } = makeFakePool({ rowsAffectedInsert: [3] });
    const repo = new SqlServerMarcacionRepository(pool);
    const items = [
      wire('U001', 1),
      wire('U001', 1), // exact duplicate within the same batch
      wire('U001', 2),
      wire('U002', 3),
    ];
    const resultado = await repo.insertarLote(7, items);
    const insert = consultas.find((c) => ES_INSERT.test(c.sql));
    expect(insert).toBeDefined();
    const userInputs = Object.keys(insert?.inputs ?? {}).filter((k) => k.startsWith('u'));
    expect(userInputs).toHaveLength(3); // 4 recibidos − 1 intra-lote dup
    expect(resultado.insertados).toBe(3);
  });

  it('chunks 650 items into 300/300/50 — each statement under the 2100-parameter limit', async () => {
    const { pool, consultas, eventos } = makeFakePool({
      rowsAffectedInsert: [300, 300, 50],
    });
    const repo = new SqlServerMarcacionRepository(pool);
    const items = Array.from({ length: 650 }, (_, i) => wire('U100', i + 1));
    const resultado = await repo.insertarLote(7, items);
    const inserts = consultas.filter((c) => ES_INSERT.test(c.sql));
    expect(inserts).toHaveLength(3);
    expect(eventos.filter((e) => e === 'begin')).toHaveLength(3);
    expect(eventos.filter((e) => e === 'commit')).toHaveLength(3);
    const paramsPorInsert = inserts.map((c) => Object.keys(c.inputs).length);
    expect(paramsPorInsert).toEqual([1201, 1201, 201]); // 4 params/row + dispositivoId
    for (const total of paramsPorInsert) {
      expect(total).toBeLessThanOrEqual(2100);
    }
    expect(resultado.insertados).toBe(650);
  });

  it('INSERT contract: NOT EXISTS on the uq triple + naive DATETIME2 cast + dispositivoId bound', async () => {
    const { pool, consultas } = makeFakePool({ rowsAffectedInsert: [1] });
    const repo = new SqlServerMarcacionRepository(pool);
    await repo.insertarLote(7, [wire('U001', 9)]);
    const insert = consultas.find((c) => ES_INSERT.test(c.sql));
    const sql = insert?.sql ?? '';
    expect(sql).toMatch(
      /WHERE\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+dbo\.marcaciones_raw\s+\w+\s+WHERE\s+\w+\.userId\s*=\s*v\.userId\s+AND\s+\w+\.fechaHora\s*=\s*CAST\s*\(\s*v\.fechaHora\s+AS\s+DATETIME2/i,
    );
    expect(sql).toMatch(/CAST\s*\(\s*v\.fechaHora\s+AS\s+DATETIME2\(0\)\s*\)/i);
    expect(sql).toMatch(/FROM\s*\(\s*VALUES/i);
    expect(Object.values(insert?.inputs ?? {})).toContain(7); // dispositivoId
  });

  it('REQ-F1-02: empleadoId resolves via LEFT JOIN on userId with NO estado filter', async () => {
    const { pool, consultas } = makeFakePool({ rowsAffectedInsert: [1] });
    const repo = new SqlServerMarcacionRepository(pool);
    await repo.insertarLote(7, [wire('U001', 9)]);
    const sql = consultas.find((c) => ES_INSERT.test(c.sql))?.sql ?? '';
    expect(sql).toMatch(/LEFT\s+JOIN\s+dbo\.empleados\s+\w+\s+ON\s+\w+\.userId\s*=\s*v\.userId/i);
    expect(sql).not.toMatch(/estado/i); // any ficha estado (incl. PENDIENTE_FICHA) resolves
  });

  it('unknown user_ids: one SELECT with NOT EXISTS against dbo.empleados — also with NO estado filter', async () => {
    const { pool, consultas } = makeFakePool({
      rowsAffectedInsert: [2],
      recordset: [{ userId: 'U404' }],
    });
    const repo = new SqlServerMarcacionRepository(pool);
    const resultado = await repo.insertarLote(7, [wire('U404', 1), wire('U404', 2)]);
    const consultaDesconocidos = consultas.find((c) => !ES_INSERT.test(c.sql));
    expect(consultaDesconocidos).toBeDefined();
    const sql = consultaDesconocidos?.sql ?? '';
    expect(sql).toMatch(
      /NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+dbo\.empleados\s+\w+\s+WHERE\s+\w+\.userId\s*=\s*v\.userId/i,
    );
    expect(sql).not.toMatch(/estado/i);
    expect(resultado.userIdsDesconocidos).toEqual(['U404']);
  });

  it('rolls the failed chunk back and propagates the error', async () => {
    const { pool, eventos } = makeFakePool({
      rowsAffectedInsert: [1],
      fallarEn: ES_INSERT,
    });
    const repo = new SqlServerMarcacionRepository(pool);
    await expect(repo.insertarLote(7, [wire('U001', 1)])).rejects.toThrow('boom');
    expect(eventos).toEqual(['begin', 'rollback']);
  });
});
