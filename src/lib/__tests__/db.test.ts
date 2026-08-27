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

describe('getSiglaReadOnlyPool() — REQ-03 D1 read-only SIGLA pool', () => {
  // Direct cleanup instead of relying on vi.unstubAllEnvs: earlier
  // describes in this file replace the process.env object, which breaks
  // vitest's stub-restore bookkeeping between tests.
  const SIGLA_RO_KEYS = [
    'SIGLA_RO_HOST',
    'SIGLA_RO_PORT',
    'SIGLA_RO_USER',
    'SIGLA_RO_PASSWORD',
    'SIGLA_RO_NAME',
  ] as const;

  function clearSiglaRoEnv(): void {
    for (const key of SIGLA_RO_KEYS) delete process.env[key];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    clearSiglaRoEnv();
    // Baseline: a valid non-sa fallback so individual tests only stub
    // the variable under inspection.
    vi.stubEnv('DB_HOST', '172.16.10.14');
    vi.stubEnv('DB_PORT', '1433');
    vi.stubEnv('DB_USER', 'explorar_datos');
    vi.stubEnv('DB_PASSWORD', 'ro-pass');
    vi.stubEnv('DB_NAME', 'SIGLA');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearSiglaRoEnv();
  });

  it('RED->GREEN: rejects with SiglaRoSaError and constructs nothing when SIGLA_RO_USER is sa', async () => {
    vi.stubEnv('SIGLA_RO_HOST', '172.16.10.14');
    vi.stubEnv('SIGLA_RO_USER', 'sa');
    vi.stubEnv('SIGLA_RO_PASSWORD', 'whatever');
    vi.resetModules();
    const { getSiglaReadOnlyPool, SiglaRoSaError } = await import('../db');

    await expect(getSiglaReadOnlyPool()).rejects.toBeInstanceOf(SiglaRoSaError);
    // Pre-construction guard: the pool is never built for a sa config.
    expect(mockConnectionPoolConstructor).not.toHaveBeenCalled();
  });

  it('rejects sa case-insensitively via the SIGLA_RO_ prefix', async () => {
    vi.stubEnv('SIGLA_RO_HOST', '172.16.10.14');
    vi.stubEnv('SIGLA_RO_USER', 'SA');
    vi.stubEnv('SIGLA_RO_PASSWORD', 'whatever');
    vi.resetModules();
    const { getSiglaReadOnlyPool } = await import('../db');

    await expect(getSiglaReadOnlyPool()).rejects.toThrow(/sa/i);
    expect(mockConnectionPoolConstructor).not.toHaveBeenCalled();
  });

  it('rejects when the DB_* fallback resolves to sa (no SIGLA_RO_* overrides)', async () => {
    vi.stubEnv('DB_USER', 'sa');
    vi.resetModules();
    const { getSiglaReadOnlyPool, SiglaRoSaError } = await import('../db');

    await expect(getSiglaReadOnlyPool()).rejects.toBeInstanceOf(SiglaRoSaError);
    expect(mockConnectionPoolConstructor).not.toHaveBeenCalled();
  });

  it('prefers the SIGLA_RO_* env vars when any override is set', async () => {
    vi.stubEnv('SIGLA_RO_HOST', '10.0.0.9');
    vi.stubEnv('SIGLA_RO_PORT', '1444');
    vi.stubEnv('SIGLA_RO_USER', 'explorar_datos');
    vi.stubEnv('SIGLA_RO_PASSWORD', 'ro-pass-2');
    vi.stubEnv('SIGLA_RO_NAME', 'SIGLA_RO_DB');
    vi.resetModules();
    const { getSiglaReadOnlyPool } = await import('../db');

    const pool = await getSiglaReadOnlyPool();

    expect(mockConnectionPoolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        server: '10.0.0.9',
        port: 1444,
        user: 'explorar_datos',
        password: 'ro-pass-2',
        database: 'SIGLA_RO_DB',
        options: expect.objectContaining({ encrypt: false, trustServerCertificate: true }),
      }),
    );
    expect(pool).toBeDefined();
  });

  it('falls back to DB_* connection vars when no SIGLA_RO_* override exists', async () => {
    vi.resetModules();
    const { getSiglaReadOnlyPool } = await import('../db');

    await getSiglaReadOnlyPool();

    expect(mockConnectionPoolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        server: '172.16.10.14',
        port: 1433,
        user: 'explorar_datos',
        password: 'ro-pass',
      }),
    );
  });

  it('resolves the database as SIGLA_RO_NAME ?? DB_NAME ?? ICCGSA', async () => {
    vi.resetModules();
    const { getSiglaReadOnlyPool } = await import('../db');
    await getSiglaReadOnlyPool();
    // DB_NAME=SIGLA is stubbed -> used.
    expect(mockConnectionPoolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ database: 'SIGLA' }),
    );

    delete process.env.DB_NAME;
    vi.resetModules();
    const db2 = await import('../db');
    await db2.getSiglaReadOnlyPool();
    // No SIGLA_RO_NAME, no DB_NAME -> ICCGSA default.
    expect(mockConnectionPoolConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ database: 'ICCGSA' }),
    );
  });

  it('is a lazy singleton independent of the other two pools', async () => {
    vi.resetModules();
    const { getPool, getHolomedicPool, getSiglaReadOnlyPool } = await import('../db');

    const roA = await getSiglaReadOnlyPool();
    const roB = await getSiglaReadOnlyPool();
    const sigla = await getPool();
    const holomedic = await getHolomedicPool();

    expect(roA).toBe(roB);
    expect(roA).not.toBe(sigla);
    expect(roA).not.toBe(holomedic);
  });

  it('__setSiglaRoPoolForTests injects a fake pool and null resets the cache', async () => {
    vi.resetModules();
    const { getSiglaReadOnlyPool, __setSiglaRoPoolForTests } = await import('../db');

    const fake = { fake: 'pool' } as unknown as Awaited<ReturnType<typeof getSiglaReadOnlyPool>>;
    __setSiglaRoPoolForTests(fake);
    await expect(getSiglaReadOnlyPool()).resolves.toBe(fake);
    expect(mockConnectionPoolConstructor).not.toHaveBeenCalled();

    __setSiglaRoPoolForTests(null);
    await getSiglaReadOnlyPool();
    expect(mockConnectionPoolConstructor).toHaveBeenCalledTimes(1);
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
