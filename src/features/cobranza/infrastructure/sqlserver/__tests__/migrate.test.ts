import { describe, it, expect } from 'vitest';

import { migrate } from '../migrate';

/**
 * Schema migration tests for the SQL Server cobranza schema
 * (EmpresaContactos REQ-01 + CobranzaEnviosHistorial REQ-02),
 * modeled on the plantillas-editor `migrate.test.ts`.
 *
 * The fake pool's `request().batch(sql)` captures the SQL so the suite
 * pins the exact statements that ship in `migrate.ts`. Table creation
 * itself is verified in production by running `migrate()` against a
 * real `HOLOMEDIC` database — the unit suite is the "the right code
 * path is taken + the right SQL is sent" contract.
 */
describe('sqlserver contact migrate()', () => {
  function makePool(calls: string[]) {
    return {
      request: () => ({
        batch: async (sql: string): Promise<{ recordset: unknown[]; rowsAffected: number[] }> => {
          calls.push(sql);
          return { recordset: [], rowsAffected: [0] };
        },
      }),
    } as unknown as import('mssql').ConnectionPool;
  }

  it('sends a single batch to the pool (one round-trip for the whole schema)', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    expect(calls).toHaveLength(1);
  });

  it('creates the dbo.EmpresaContactos table with the documented columns', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const sql = calls[0] ?? '';
    expect(sql).toMatch(/CREATE\s+TABLE\s+dbo\.EmpresaContactos/i);
    expect(sql).toMatch(/ruc\s+VARCHAR\(11\)\s+NOT\s+NULL\s+PRIMARY\s+KEY/i);
    expect(sql).toMatch(/razonSocial\s+NVARCHAR\(200\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/emailPrincipal\s+NVARCHAR\(320\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/emailCopia\s+NVARCHAR\(320\)\s+NULL/i);
    expect(sql).toMatch(/updatedAt\s+DATETIME2\(3\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/updatedBy\s+NVARCHAR\(200\)\s+NULL/i);
  });

  it('guards every CREATE with IF NOT EXISTS on sys.tables (idempotent)', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const sql = calls[0] ?? '';
    expect(sql).toMatch(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.tables/i);
    expect(sql).toMatch(/WHERE\s+name\s*=\s*'EmpresaContactos'/i);
    expect(sql).toMatch(/WHERE\s+name\s*=\s*'CobranzaEnviosHistorial'/i);
    expect(sql).toMatch(/SCHEMA_ID\s*\(\s*'dbo'\s*\)/i);
    // Every CREATE TABLE ships inside its own sys.tables guard: one guarded
    // block per table (EmpresaContactos REQ-01, CobranzaEnviosHistorial REQ-02).
    const creates = sql.match(/CREATE\s+TABLE/gi) ?? [];
    const guards = sql.match(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.tables/gi) ?? [];
    expect(creates).toHaveLength(2);
    expect(guards).toHaveLength(creates.length);
    // The history index is guarded on sys.indexes the same way.
    expect(sql).toMatch(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.indexes/i);
    expect(sql).toMatch(/name\s*=\s*'idx_cobranza_hist_ruc'/i);
  });

  it('is idempotent — calling migrate() twice sends the same guarded batch', async () => {
    const calls: string[] = [];
    const pool = makePool(calls);
    await migrate(pool);
    await migrate(pool);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe(calls[1]);
  });
});
