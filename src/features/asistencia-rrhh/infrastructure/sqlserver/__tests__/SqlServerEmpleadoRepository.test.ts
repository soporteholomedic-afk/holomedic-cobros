import { describe, expect, it } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerEmpleadoRepository } from '../SqlServerEmpleadoRepository';

/**
 * SQL contract for `SqlServerEmpleadoRepository.upsertPendientes` — the
 * heartbeat bootstrap channel (ADR-1, REQ-F1-03/09):
 *
 * - Creates ONLY the missing fichas: INSERT…SELECT VALUES with
 *   `WHERE NOT EXISTS` on the UNIQUE userId (same ADR-4 family). R5:
 *   existing rows are NEVER updated — a renamed device user does not
 *   rewrite an existing ficha.
 * - estado/modeExtras are NOT in the INSERT — the PENDIENTE_FICHA /
 *   PAGAR DB defaults apply.
 * - Intra-lote duplicates collapse BEFORE the VALUES constructor (two
 *   equal user_ids inside one statement would violate UNIQUE userId).
 * - Chunked under SQL Server's 2100-parameter limit (2 params/row), one
 *   transaction per chunk.
 *
 * The fake pool pins "the right SQL is sent" (migrate.test.ts
 * precedent); actual INSERT/UNIQUE semantics are SQL Server's.
 */

interface Consulta {
  sql: string;
  inputs: Record<string, unknown>;
}

const ES_INSERT = /INSERT\s+INTO\s+dbo\.empleados/i;

function makeFakePool(
  opciones: {
    /** rowsAffected returned per INSERT…SELECT statement, consumed in order. */
    rowsAffectedInsert?: number[];
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
        return { recordset: [], rowsAffected: [0] };
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

function usuario(i: number): { userId: string; nombre: string } {
  return { userId: `U${String(i + 1).padStart(3, '0')}`, nombre: `Usuario ${i + 1}` };
}

describe('SqlServerEmpleadoRepository.upsertPendientes', () => {
  it('empty report sends nothing and reports zero', async () => {
    const { pool, consultas } = makeFakePool();
    const repo = new SqlServerEmpleadoRepository(pool);
    await expect(repo.upsertPendientes([])).resolves.toBe(0);
    expect(consultas).toHaveLength(0);
  });

  it('35 usuarios → ONE transaction with ONE INSERT…SELECT…WHERE NOT EXISTS (70 params)', async () => {
    const { pool, consultas, eventos } = makeFakePool({ rowsAffectedInsert: [35] });
    const repo = new SqlServerEmpleadoRepository(pool);
    const usuarios = Array.from({ length: 35 }, (_, i) => usuario(i));
    const creadas = await repo.upsertPendientes(usuarios);
    expect(creadas).toBe(35);
    expect(eventos).toEqual(['begin', 'commit']);
    const inserts = consultas.filter((c) => ES_INSERT.test(c.sql));
    expect(inserts).toHaveLength(1);
    const sql = inserts[0]?.sql ?? '';
    expect(sql).toMatch(/INSERT\s+INTO\s+dbo\.empleados\s*\(\s*userId,\s*nombres\s*\)/i);
    expect(sql).toMatch(
      /WHERE\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+dbo\.empleados\s+\w+\s+WHERE\s+\w+\.userId\s*=\s*v\.userId/i,
    );
    // R5: never updates existing fichas; estado comes from the DB default.
    expect(sql).not.toMatch(/UPDATE/i);
    expect(sql).not.toMatch(/estado/i);
    const inputs = inserts[0]?.inputs ?? {};
    expect(Object.keys(inputs)).toHaveLength(70); // 2 params × 35 rows
    expect(inputs['u0']).toBe('U001');
    expect(inputs['n0']).toBe('Usuario 1');
  });

  it('collapses intra-lote duplicates BEFORE the VALUES constructor (UNIQUE-safe)', async () => {
    const { pool, consultas } = makeFakePool({ rowsAffectedInsert: [1] });
    const repo = new SqlServerEmpleadoRepository(pool);
    const creadas = await repo.upsertPendientes([
      { userId: 'U001', nombre: 'Uno' },
      { userId: 'U001', nombre: 'Uno (repetido)' },
    ]);
    const insert = consultas.find((c) => ES_INSERT.test(c.sql));
    const userInputs = Object.keys(insert?.inputs ?? {}).filter((k) => k.startsWith('u'));
    expect(userInputs).toHaveLength(1);
    expect(creadas).toBe(1);
  });

  it('chunks 650 usuarios into 300/300/50 — each statement under the 2100-parameter limit', async () => {
    const { pool, consultas, eventos } = makeFakePool({
      rowsAffectedInsert: [300, 300, 50],
    });
    const repo = new SqlServerEmpleadoRepository(pool);
    const usuarios = Array.from({ length: 650 }, (_, i) => usuario(i));
    const creadas = await repo.upsertPendientes(usuarios);
    const inserts = consultas.filter((c) => ES_INSERT.test(c.sql));
    expect(inserts).toHaveLength(3);
    expect(eventos.filter((e) => e === 'begin')).toHaveLength(3);
    expect(eventos.filter((e) => e === 'commit')).toHaveLength(3);
    const paramsPorInsert = inserts.map((c) => Object.keys(c.inputs).length);
    expect(paramsPorInsert).toEqual([600, 600, 100]); // 2 params/row, no extra binds
    for (const total of paramsPorInsert) {
      expect(total).toBeLessThanOrEqual(2100);
    }
    expect(creadas).toBe(650);
  });

  it('mixed report: 35 usuarios with 5 already present → created 30 (NOT EXISTS absorbs them)', async () => {
    const { pool } = makeFakePool({ rowsAffectedInsert: [30] });
    const repo = new SqlServerEmpleadoRepository(pool);
    const usuarios = Array.from({ length: 35 }, (_, i) => usuario(i));
    await expect(repo.upsertPendientes(usuarios)).resolves.toBe(30);
  });

  it('rolls the failed chunk back and propagates the error', async () => {
    const { pool, eventos } = makeFakePool({
      rowsAffectedInsert: [1],
      fallarEn: ES_INSERT,
    });
    const repo = new SqlServerEmpleadoRepository(pool);
    await expect(repo.upsertPendientes([usuario(0)])).rejects.toThrow('boom');
    expect(eventos).toEqual(['begin', 'rollback']);
  });
});
