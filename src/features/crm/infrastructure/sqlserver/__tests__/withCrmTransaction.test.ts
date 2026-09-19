import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getHolomedicPool } from '@/lib/db';

import { withCrmTransaction } from '../withCrmTransaction';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `withCrmTransaction` (design §2) — the
 * first transactional helper in the repo, backing every CRM
 * cross-table invariant (crearEmpresa, per-RUC-group import confirm,
 * registrarTransicion, ENVIO_CADENCIA counters, asignar/devolver).
 *
 * The flagged obligation is the ROLLBACK path: when `fn` throws, every
 * write `fn` made must vanish and the ORIGINAL error must propagate
 * (never a rollback failure), leaving the pool fully usable. The
 * commit path and the return-value path triangulate the helper.
 *
 * Probe writes use a reserved rucNormalizado; the commit-path row is
 * deleted in a finally block, the rollback path is self-cleaning.
 */

const PROBE_RUC = '0000000000998';
const PROBE_RAZON = 'PR2 TX PROBE';

let pool: mssql.ConnectionPool;

beforeAll(async () => {
  pool = await getHolomedicPool();
  await pool.connect();
  // Clean stale probe rows from an aborted earlier run.
  await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE rucNormalizado = '${PROBE_RUC}'`);
});

afterAll(async () => {
  if (pool) await pool.close();
});

async function insertProbeEmpresa(tx: mssql.Transaction): Promise<void> {
  await tx
    .request()
    .input('ruc', mssql.NVarChar(30), PROBE_RUC)
    .input('rucNormalizado', mssql.VarChar(30), PROBE_RUC)
    .input('razonSocial', mssql.NVarChar(200), PROBE_RAZON).query(`
      INSERT INTO dbo.CRM_Empresas (ruc, rucNormalizado, razonSocial, tipo, origen)
      VALUES (@ruc, @rucNormalizado, @razonSocial, 'Prospecto', 'Outbound')`);
}

async function probeRowCount(p: mssql.ConnectionPool): Promise<number> {
  const result = await p
    .request()
    .input('rucNormalizado', mssql.VarChar(30), PROBE_RUC)
    .query(`SELECT id FROM dbo.CRM_Empresas WHERE rucNormalizado = @rucNormalizado`);
  return result.recordset.length;
}

describe('withCrmTransaction()', () => {
  it('commits when fn resolves — the write is visible to the pool after the helper returns', async () => {
    try {
      await withCrmTransaction(pool, async (tx) => {
        await insertProbeEmpresa(tx);
      });
      expect(await probeRowCount(pool)).toBe(1);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE rucNormalizado = '${PROBE_RUC}'`);
    }
    expect(await probeRowCount(pool)).toBe(0);
  });

  it('resolves with the value fn returned', async () => {
    const value = await withCrmTransaction(pool, async () => 'tx-ok');
    expect(value).toBe('tx-ok');
  });

  it('rolls back and preserves pool state when fn throws — the original error propagates', async () => {
    const boom = new Error('boom: simulating a failed invariant mid-transaction');
    await expect(
      withCrmTransaction(pool, async (tx) => {
        await insertProbeEmpresa(tx);
        throw boom;
      }),
    ).rejects.toBe(boom);

    // The probe write must have vanished with the rollback...
    expect(await probeRowCount(pool)).toBe(0);

    // ...and the pool must still be fully usable afterwards.
    expect(await withCrmTransaction(pool, async () => 'still-alive')).toBe('still-alive');
  });
});
