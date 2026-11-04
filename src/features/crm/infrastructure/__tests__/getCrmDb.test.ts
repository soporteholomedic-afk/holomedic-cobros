import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  migrate: vi.fn(),
  pool: { connect: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ getHolomedicPool: vi.fn(async () => mocks.pool) }));
vi.mock('../sqlserver', () => ({
  migrate: mocks.migrate,
  SqlServerCrmEmpresaRepository: class {
    constructor(readonly pool: unknown) {}
  },
}));

import { __setCrmDbForTests, getCrmDb } from '../getCrmDb';

describe('getCrmDb', () => {
  beforeEach(() => {
    __setCrmDbForTests(null);
    mocks.migrate.mockReset();
    mocks.pool.connect.mockReset();
  });

  it('migrates once and reuses the repository', async () => {
    mocks.migrate.mockResolvedValue(undefined);
    const a = await getCrmDb();
    const b = await getCrmDb();
    expect(a).toBe(b);
    expect(mocks.migrate).toHaveBeenCalledTimes(1);
  });

  it('retries on the next request after a failed migration instead of failing forever', async () => {
    mocks.migrate.mockRejectedValueOnce(new Error('CRM migration: could not get the application lock'));
    mocks.migrate.mockResolvedValueOnce(undefined);
    await expect(getCrmDb()).rejects.toThrow('could not get the application lock');
    await expect(getCrmDb()).resolves.toBeDefined();
    expect(mocks.migrate).toHaveBeenCalledTimes(2);
  });

  it('retries after a failed connection too', async () => {
    mocks.pool.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    mocks.migrate.mockResolvedValue(undefined);
    await expect(getCrmDb()).rejects.toThrow('ECONNREFUSED');
    await expect(getCrmDb()).resolves.toBeDefined();
  });
});
