import { describe, it, expect, beforeEach } from 'vitest';

import { migrate } from '../migrate';

/**
 * Schema migration tests for the consolidated-send history store,
 * mirroring the `dbo.templates` precedent: a fake pool captures the
 * batch so the suite pins the exact statements that ship in
 * `migrate.ts`. Idempotency is structural (`IF NOT EXISTS` guards) —
 * verified here by double-running against the fake pool.
 */
describe('sqlserver migrate() — envios_consolidados', () => {
  let batchCalls: string[];

  beforeEach(() => {
    batchCalls = [];
  });

  function makePool(calls: string[]) {
    return {
      request: () => ({
        batch: async (sql: string) => {
          calls.push(sql);
          return { recordset: [], rowsAffected: [0] };
        },
      }),
    } as unknown as import('mssql').ConnectionPool;
  }

  it('sends a single batch to the pool (one round-trip for the whole schema)', async () => {
    await migrate(makePool(batchCalls));
    expect(batchCalls).toHaveLength(1);
  });

  it('creates dbo.envios_consolidados with the documented columns and types', async () => {
    await migrate(makePool(batchCalls));
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/CREATE\s+TABLE\s+dbo\.envios_consolidados/i);
    expect(sql).toMatch(/id\s+NVARCHAR\(50\)\s+NOT\s+NULL\s+PRIMARY\s+KEY/i);
    expect(sql).toMatch(/sentAt\s+DATETIME2\(3\)\s+NOT\s+NULL\s+DEFAULT\s+SYSUTCDATETIME\(\)/i);
    expect(sql).toMatch(/bodyHtml\s+NVARCHAR\(MAX\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/attachmentsJson\s+NVARCHAR\(MAX\)\s+NOT\s+NULL\s+DEFAULT\s+'\[\]'/i);
    expect(sql).toMatch(/searchRecipients\s+NVARCHAR\(4000\)\s+NOT\s+NULL\s+DEFAULT\s+''/i);
  });

  it('enforces the status CHECK constraint (pendiente/enviado/error)', async () => {
    await migrate(makePool(batchCalls));
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/CHECK\s*\(status\s+IN\s*\('pendiente','enviado','error'\)\)/i);
  });

  it('creates the default-listing index (sentAt DESC)', async () => {
    await migrate(makePool(batchCalls));
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/CREATE\s+INDEX\s+idx_envios_sentAt\s+ON\s+dbo\.envios_consolidados\s+\(sentAt\s+DESC\)/i);
  });

  it('creates the covering search index WITHOUT bodyHtml (LOB excluded)', async () => {
    await migrate(makePool(batchCalls));
    const sql = batchCalls[0] ?? '';
    const idxMatch = sql.match(/CREATE\s+INDEX\s+idx_envios_search[\s\S]*?;/i);
    expect(idxMatch).toBeTruthy();
    const idx = idxMatch?.[0] ?? '';
    // Covering INCLUDE list carries the search + display columns…
    expect(idx).toMatch(/INCLUDE\s*\(/i);
    for (const col of ['status', 'sentBy', 'destino', 'companyId', 'companyName', 'subject',
      'searchRecipients', 'searchCompany', 'searchSubject', 'searchPatients']) {
      expect(idx).toContain(col);
    }
    // …but never the off-row LOB columns.
    expect(idx).not.toContain('bodyHtml');
    expect(idx).not.toContain('attachmentsJson');
    expect(idx).not.toContain('errorDetail');
  });

  it('guards every CREATE with IF NOT EXISTS and is idempotent on double-run', async () => {
    const pool = makePool(batchCalls);
    await migrate(pool);
    await migrate(pool);
    expect(batchCalls).toHaveLength(2);
    expect(batchCalls[0]).toBe(batchCalls[1]);
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.tables/i);
    const creates = sql.match(/CREATE\s+(?:TABLE|INDEX)/gi) ?? [];
    expect(creates).toHaveLength(3); // 1 table + 2 indexes
  });
});
