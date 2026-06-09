import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mock so it's available before the module loads
const mockConnectionPoolConstructor = vi.hoisted(() => vi.fn());

vi.mock('mssql', () => {
  const mockPool = mockConnectionPoolConstructor;
  return {
    default: {
      ConnectionPool: mockPool,
    },
    ConnectionPool: mockPool,
  };
});

describe('getPool()', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env vars for each test
    process.env.DB_HOST = '172.16.10.14';
    process.env.DB_PORT = '1433';
    process.env.DB_USER = 'sa';
    process.env.DB_PASSWORD = 'sa2008';
    process.env.DB_NAME = 'ICCGSA';
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it('should create a ConnectionPool with correct config from env vars', async () => {
    vi.resetModules();
    const { getPool } = await import('../db');

    const pool = await getPool();

    expect(mockConnectionPoolConstructor).toHaveBeenCalledTimes(1);
    expect(mockConnectionPoolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        server: '172.16.10.14',
        port: 1433,
        user: 'sa',
        password: 'sa2008',
        database: 'ICCGSA',
      }),
    );
    expect(pool).toBeDefined();
  });

  it('should return the same pool instance on subsequent calls (singleton)', async () => {
    vi.resetModules();
    const { getPool } = await import('../db');
    const poolA = await getPool();

    // Second call — same module, should return cached pool
    const poolB = await getPool();

    // ConnectionPool constructor should only be called once
    expect(mockConnectionPoolConstructor).toHaveBeenCalledTimes(1);
    expect(poolA).toBe(poolB);
  });

  it('should throw when DB_HOST is missing', async () => {
    delete process.env.DB_HOST;
    vi.resetModules();

    const { getPool } = await import('../db');

    await expect(getPool()).rejects.toThrow('DB_HOST');
  });

  it('should throw when DB_USER is missing', async () => {
    delete process.env.DB_USER;
    vi.resetModules();

    const { getPool } = await import('../db');

    await expect(getPool()).rejects.toThrow('DB_USER');
  });

  it('should throw when DB_PASSWORD is missing', async () => {
    delete process.env.DB_PASSWORD;
    vi.resetModules();

    const { getPool } = await import('../db');

    await expect(getPool()).rejects.toThrow('DB_PASSWORD');
  });

  it('should throw when DB_NAME is missing', async () => {
    delete process.env.DB_NAME;
    vi.resetModules();

    const { getPool } = await import('../db');

    await expect(getPool()).rejects.toThrow('DB_NAME');
  });
});
