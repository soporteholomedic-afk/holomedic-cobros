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
});

describe('getHolomedicPool()', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults: SIGLA env vars present, no HOLOMEDIC-specific overrides.
    process.env.DB_HOST = '172.16.10.14';
    process.env.DB_PORT = '1433';
    process.env.DB_USER = 'sa';
    process.env.DB_PASSWORD = 'sa2008';
    process.env.DB_NAME = 'ICCGSA';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds a ConnectionPool targeting the HOLOMEDIC database by default', async () => {
    delete process.env.HOLOMEDIC_DB_NAME;
    delete process.env.HOLOMEDIC_DB_HOST;
    vi.resetModules();
    const { getHolomedicPool } = await import('../db');

    const pool = await getHolomedicPool();

    expect(mockConnectionPoolConstructor).toHaveBeenCalledTimes(1);
    expect(mockConnectionPoolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        server: '172.16.10.14',
        port: 1433,
        user: 'sa',
        password: 'sa2008',
        database: 'HOLOMEDIC',
      }),
    );
    expect(pool).toBeDefined();
  });

  it('honours HOLOMEDIC_DB_NAME when set', async () => {
    process.env.HOLOMEDIC_DB_NAME = 'HOLOMEDIC_OTHER';
    vi.resetModules();
    const { getHolomedicPool } = await import('../db');

    await getHolomedicPool();

    expect(mockConnectionPoolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ database: 'HOLOMEDIC_OTHER' }),
    );
  });

  it('falls back to the SIGLA DB_* env vars for host/user/password when HOLOMEDIC_DB_* is not set', async () => {
    // No HOLOMEDIC_DB_HOST / USER / PASSWORD — the pool MUST reuse the SIGLA ones.
    delete process.env.HOLOMEDIC_DB_HOST;
    delete process.env.HOLOMEDIC_DB_USER;
    delete process.env.HOLOMEDIC_DB_PASSWORD;
    vi.resetModules();
    const { getHolomedicPool } = await import('../db');

    await getHolomedicPool();

    expect(mockConnectionPoolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        server: '172.16.10.14',
        user: 'sa',
        password: 'sa2008',
        database: 'HOLOMEDIC',
      }),
    );
  });

  it('uses the HOLOMEDIC_DB_* overrides when any one of them is set', async () => {
    // A single override is enough to switch the whole pool onto the
    // HOLOMEDIC_DB_* prefix (host is the canonical signal).
    process.env.HOLOMEDIC_DB_HOST = '10.0.0.5';
    process.env.HOLOMEDIC_DB_USER = 'holomedic_user';
    process.env.HOLOMEDIC_DB_PASSWORD = 'holomedic_pass';
    process.env.HOLOMEDIC_DB_PORT = '1434';
    vi.resetModules();
    const { getHolomedicPool } = await import('../db');

    await getHolomedicPool();

    expect(mockConnectionPoolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        server: '10.0.0.5',
        port: 1434,
        user: 'holomedic_user',
        password: 'holomedic_pass',
        database: 'HOLOMEDIC',
      }),
    );
  });

  it('throws when the underlying connection env vars are missing (no DB_* fallback either)', async () => {
    delete process.env.HOLOMEDIC_DB_HOST;
    delete process.env.DB_HOST;
    vi.resetModules();
    const { getHolomedicPool } = await import('../db');

    await expect(getHolomedicPool()).rejects.toThrow(/HOST/);
  });

  it('returns the same pool instance on subsequent calls (singleton, independent of SIGLA pool)', async () => {
    vi.resetModules();
    const { getPool, getHolomedicPool } = await import('../db');
    const sigla = await getPool();
    const holomedicA = await getHolomedicPool();
    const holomedicB = await getHolomedicPool();

    // Two distinct pools (SIGLA + HOLOMEDIC) → two constructor calls.
    expect(mockConnectionPoolConstructor).toHaveBeenCalledTimes(2);
    // The Holomedic pool is cached independently.
    expect(holomedicA).toBe(holomedicB);
    expect(holomedicA).not.toBe(sigla);
  });
});

describe('buildConfig()', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reads the requested env-var prefix and returns a typed mssql.config', async () => {
    process.env.HOLOMEDIC_DB_HOST = '10.0.0.7';
    process.env.HOLOMEDIC_DB_USER = 'u';
    process.env.HOLOMEDIC_DB_PASSWORD = 'p';
    process.env.HOLOMEDIC_DB_PORT = '1433';
    vi.resetModules();
    const { buildConfig } = await import('../db');

    const config = buildConfig('HOLOMEDIC', 'HOLOMEDIC_DB_');

    expect(config).toEqual(
      expect.objectContaining({
        server: '10.0.0.7',
        port: 1433,
        user: 'u',
        password: 'p',
        database: 'HOLOMEDIC',
        options: expect.objectContaining({ encrypt: false, trustServerCertificate: true }),
      }),
    );
  });

  it('defaults to the DB_ prefix when none is given', async () => {
    process.env.DB_HOST = 'h';
    process.env.DB_USER = 'u';
    process.env.DB_PASSWORD = 'p';
    delete process.env.DB_PORT;
    vi.resetModules();
    const { buildConfig } = await import('../db');

    const config = buildConfig('ICCGSA');

    expect(config.server).toBe('h');
    expect(config.port).toBe(1433);
    expect(config.database).toBe('ICCGSA');
  });
});
