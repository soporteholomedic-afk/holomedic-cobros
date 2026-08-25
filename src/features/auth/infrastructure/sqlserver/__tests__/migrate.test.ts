import { describe, it, expect, beforeEach } from 'vitest';

import { migrate } from '../migrate';

/**
 * Schema migration tests for the dual-column usuarios identity
 * (usuarios-nombre-firma), mirroring the envio-resultados
 * `migrate.test.ts` precedent: a fake pool captures the batch (and the
 * seedAdmin queries) so the suite pins the exact statements that ship
 * in `migrate.ts`. Idempotency is structural (`sys.columns` gates) —
 * verified here by double-running against the fake pool.
 */
describe('sqlserver migrate() — dbo.usuarios dual column', () => {
  let batchCalls: string[];
  let queryCalls: string[];

  beforeEach(() => {
    batchCalls = [];
    queryCalls = [];
  });

  function makePool(batches: string[], queries: string[]) {
    const request = () => {
      const req = {
        input: () => req,
        query: async (sql: string) => {
          queries.push(sql);
          return { recordset: [], rowsAffected: [0] };
        },
        batch: async (sql: string) => {
          batches.push(sql);
          return { recordset: [], rowsAffected: [0] };
        },
      };
      return req;
    };
    return { request } as unknown as import('mssql').ConnectionPool;
  }

  it('sends a single schema batch to the pool', async () => {
    await migrate(makePool(batchCalls, queryCalls));
    expect(batchCalls).toHaveLength(1);
  });

  it('creates dbo.usuarios carrying both usuario and nombre columns', async () => {
    await migrate(makePool(batchCalls, queryCalls));
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/CREATE\s+TABLE\s+dbo\.usuarios/i);
    expect(sql).toMatch(/usuario\s+NVARCHAR\(200\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/nombre\s+NVARCHAR\(200\)\s+NOT\s+NULL\s+DEFAULT\s+''/i);
  });

  it('renames the legacy nombre column to usuario behind a sys.columns gate', async () => {
    await migrate(makePool(batchCalls, queryCalls));
    const sql = batchCalls[0] ?? '';
    const renameGate =
      /IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.columns\s+WHERE\s+object_id\s*=\s*OBJECT_ID\('dbo\.usuarios'\)\s+AND\s+name\s*=\s*'usuario'\s*\)/i;
    expect(sql).toMatch(renameGate);
    expect(sql).toMatch(
      /EXEC\s+sp_rename\s+'dbo\.usuarios\.nombre',\s*'usuario',\s*'COLUMN'/i,
    );
  });

  it("adds nombre with DEFAULT '' behind a sys.columns gate, backfill NESTED in the same gate", async () => {
    await migrate(makePool(batchCalls, queryCalls));
    const sql = batchCalls[0] ?? '';
    const addGate =
      /IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.columns\s+WHERE\s+object_id\s*=\s*OBJECT_ID\('dbo\.usuarios'\)\s+AND\s+name\s*=\s*'nombre'\s*\)/i;
    expect(sql).toMatch(addGate);
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+dbo\.usuarios\s+ADD\s+nombre\s+NVARCHAR\(200\)\s+NOT\s+NULL\s+DEFAULT\s+''/i,
    );

    // Nesting: the backfill runs between the ADD-gate and the END that
    // closes it — so it executes exactly once, only when the column is
    // first added (never re-backfilling an intentionally cleared name).
    const gateIndex = sql.search(addGate);
    const alterIndex = sql.search(/ALTER\s+TABLE\s+dbo\.usuarios\s+ADD\s+nombre/i);
    const backfillIndex = sql.indexOf('UPDATE dbo.usuarios SET nombre = usuario');
    const endAfterBackfill = sql.indexOf('END;', backfillIndex);
    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(alterIndex).toBeGreaterThan(gateIndex);
    expect(backfillIndex).toBeGreaterThan(alterIndex);
    expect(endAfterBackfill).toBeGreaterThan(backfillIndex);
    // The backfill appears exactly once in the batch.
    expect(sql.split('UPDATE dbo.usuarios SET nombre = usuario')).toHaveLength(2);
  });

  it('seeds the admin with BOTH usuario and nombre populated', async () => {
    await migrate(makePool(batchCalls, queryCalls));
    const insert = queryCalls.find((sql) => sql.includes('INSERT INTO dbo.usuarios'));
    expect(insert).toBeTruthy();
    expect(insert).toMatch(
      /INSERT\s+INTO\s+dbo\.usuarios\s+\(idUsuario,\s*usuario,\s*nombre,\s*area,\s*permisos,\s*contrasenaHash\)/i,
    );
    expect(insert).toMatch(/VALUES\s*\(@idUsuario,\s*@usuario,\s*@nombre,\s*@area,\s*@permisos,\s*@contrasenaHash\)/i);
  });

  it('is idempotent on double-run (identical batch, no extra statements)', async () => {
    const pool = makePool(batchCalls, queryCalls);
    await migrate(pool);
    await migrate(pool);
    expect(batchCalls).toHaveLength(2);
    expect(batchCalls[0]).toBe(batchCalls[1]);
  });
});

describe('sqlserver migrate() — usuarios correo column', () => {
  let batchCalls: string[];
  let queryCalls: string[];

  beforeEach(() => {
    batchCalls = [];
    queryCalls = [];
  });

  function makePool(batches: string[], queries: string[]) {
    const request = () => {
      const req = {
        input: () => req,
        query: async (sql: string) => {
          queries.push(sql);
          return { recordset: [], rowsAffected: [0] };
        },
        batch: async (sql: string) => {
          batches.push(sql);
          return { recordset: [], rowsAffected: [0] };
        },
      };
      return req;
    };
    return { request } as unknown as import('mssql').ConnectionPool;
  }

  it('defines correo NVARCHAR(200) NULL in the CREATE TABLE block (fresh installs)', async () => {
    await migrate(makePool(batchCalls, queryCalls));
    const sql = batchCalls[0] ?? '';
    expect(sql).toMatch(/correo\s+NVARCHAR\(200\)\s+NULL/i);
  });

  it('adds correo behind a sys.columns gate for existing databases', async () => {
    await migrate(makePool(batchCalls, queryCalls));
    const sql = batchCalls[0] ?? '';
    const correoGate =
      /IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.columns\s+WHERE\s+object_id\s*=\s*OBJECT_ID\('dbo\.usuarios'\)\s+AND\s+name\s*=\s*'correo'\s*\)/i;
    expect(sql).toMatch(correoGate);
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+dbo\.usuarios\s+ADD\s+correo\s+NVARCHAR\(200\)\s+NULL/i,
    );
    // The correo ALTER must sit INSIDE its gate (gate precedes it, and an
    // END closes the block after it).
    const gateIndex = sql.search(correoGate);
    const alterIndex = sql.search(/ALTER\s+TABLE\s+dbo\.usuarios\s+ADD\s+correo/i);
    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(alterIndex).toBeGreaterThan(gateIndex);
    // No backfill statement for correo (existing rows stay NULL).
    expect(sql).not.toMatch(/UPDATE\s+dbo\.usuarios\s+SET\s+correo/i);
  });

  it('is idempotent on double-run with the correo batch (identical statements)', async () => {
    const pool = makePool(batchCalls, queryCalls);
    await migrate(pool);
    await migrate(pool);
    expect(batchCalls).toHaveLength(2);
    expect(batchCalls[0]).toBe(batchCalls[1]);
    // Idempotency is structural: the correo ALTER appears exactly once
    // per batch (guarded by sys.columns, never duplicated).
    expect(batchCalls[0]?.split('ADD correo NVARCHAR(200) NULL')).toHaveLength(2);
  });
});
