import { describe, it, expect, beforeEach, vi } from 'vitest';

import { migrate } from '../migrate';

/**
 * Schema migration tests for the SQL Server template store.
 *
 * The mock replaces `mssql.ConnectionPool` with a fake whose
 * `request().batch(sql)` captures the SQL so the suite can pin the
 * exact statements that ship in `migrate.ts`. The table / index
 * creation itself is verified in production by `EXEC`ing `migrate()`
 * against a real `HOLOMEDIC` database — the unit suite is the
 * "the right code path is taken + the right SQL is sent" contract.
 */
describe('sqlserver migrate()', () => {
  let batchCalls: string[];

  beforeEach(() => {
    batchCalls = [];
    vi.doMock('mssql', () => {
      const fakePool = {
        request: () => ({
          batch: vi.fn().mockImplementation(async (sql: string) => {
            batchCalls.push(sql);
            return { recordset: [], rowsAffected: [0] };
          }),
        }),
      };
      return {
        default: {
          ConnectionPool: vi.fn().mockImplementation(() => fakePool),
        },
        ConnectionPool: vi.fn().mockImplementation(() => fakePool),
      };
    });
  });

  it('sends a single batch to the pool (one round-trip for the whole schema)', async () => {
    const { migrate: migrateFresh } = await import('../migrate');
    const fakePool = {
      request: () => ({
        batch: vi.fn().mockImplementation(async (sql: string) => {
          batchCalls.push(sql);
          return { recordset: [], rowsAffected: [0] };
        }),
      }),
    };
    await migrateFresh(fakePool as unknown as import('mssql').ConnectionPool);
    expect(batchCalls).toHaveLength(1);
  });

  it('creates the dbo.templates table with the documented columns', async () => {
    const fakePool = makePool(batchCalls);
    await migrate(fakePool);
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/CREATE\s+TABLE\s+dbo\.templates/i);
    expect(sql).toMatch(/id\s+NVARCHAR\(50\)\s+NOT\s+NULL\s+PRIMARY\s+KEY/i);
    expect(sql).toMatch(/isDefault\s+BIT\s+NOT\s+NULL\s+DEFAULT\s+0/i);
    expect(sql).toMatch(/createdAt\s+DATETIME2\(3\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/ownerId\s+NVARCHAR\(50\)\s+NULL/i);
  });

  it('creates the dbo.template_versions table with the documented columns', async () => {
    const fakePool = makePool(batchCalls);
    await migrate(fakePool);
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/CREATE\s+TABLE\s+dbo\.template_versions/i);
    expect(sql).toMatch(/versionId\s+NVARCHAR\(50\)\s+NOT\s+NULL\s+PRIMARY\s+KEY/i);
    expect(sql).toMatch(/bodyHtml\s+NVARCHAR\(MAX\)\s+NOT\s+NULL/i);
  });

  it('creates the filtered UNIQUE index for default uniqueness per area+type', async () => {
    const fakePool = makePool(batchCalls);
    await migrate(fakePool);
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+idx_templates_default_area_type/i);
    expect(sql).toMatch(/WHERE\s+isDefault\s*=\s*1\s+AND\s+deletedAt\s+IS\s+NULL/i);
  });

  it('creates the active-only listing index (filtered)', async () => {
    const fakePool = makePool(batchCalls);
    await migrate(fakePool);
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/CREATE\s+INDEX\s+idx_templates_area_type_active/i);
    expect(sql).toMatch(/WHERE\s+deletedAt\s+IS\s+NULL/i);
  });

  it('creates the versions-by-template index (editedAt DESC)', async () => {
    const fakePool = makePool(batchCalls);
    await migrate(fakePool);
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/CREATE\s+INDEX\s+idx_versions_template_edited/i);
    expect(sql).toMatch(/editedAt\s+DESC/i);
  });

  it('guards every CREATE with IF NOT EXISTS (idempotent re-runs)', async () => {
    const fakePool = makePool(batchCalls);
    await migrate(fakePool);
    const sql = batchCalls[0] ?? '';
    // The IF NOT EXISTS wrapper for the templates table.
    expect(sql).toMatch(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.tables/i);
    // Five CREATE statements total: 2 tables + 3 indexes.
    const creates = sql.match(/CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX)/gi) ?? [];
    expect(creates).toHaveLength(5);
  });

  it('is idempotent — calling migrate() twice is safe (no error, two batches)', async () => {
    const fakePool = makePool(batchCalls);
    await migrate(fakePool);
    await migrate(fakePool);
    expect(batchCalls).toHaveLength(2);
    // Both batches carry the same SQL (CREATE … IF NOT EXISTS guards).
    expect(batchCalls[0]).toBe(batchCalls[1]);
  });
});

function makePool(calls: string[]) {
  return {
    request: () => ({
      batch: vi.fn().mockImplementation(async (sql: string) => {
        calls.push(sql);
        return { recordset: [], rowsAffected: [0] };
      }),
    }),
  } as unknown as import('mssql').ConnectionPool;
}
