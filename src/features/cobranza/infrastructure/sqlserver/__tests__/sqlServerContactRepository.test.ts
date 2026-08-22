import { describe, it, expect, beforeEach } from 'vitest';

import type { EmpresaContacto, SaveContactInput } from '../../../domain/entities';

import { SqlServerContactRepository } from '../sqlServerContactRepository';
import { ContactConflictError } from '../errors';

/**
 * Unit tests for `SqlServerContactRepository` over a fake mssql pool
 * (T1a.5), modeled on the plantillas-editor adapter suite.
 *
 * The fake exposes an in-memory `EmpresaContactos` map keyed by ruc.
 * Every request's `{ sql, inputs }` pair is captured so ordering and
 * parameter binding can be asserted. The fake simulates mssql's
 * `DATETIME2 -> Date` round-trip: writes accept whatever the adapter
 * sends (ISO strings), reads return JS `Date` objects, and the
 * adapter's boundary conversion produces ISO strings on the entity.
 */

// ---------------------------------------------------------------------------
// Fake pool plumbing
// ---------------------------------------------------------------------------

interface CapturedQuery {
  sql: string;
  inputs: Record<string, unknown>;
}

interface StoredRow {
  ruc: string;
  razonSocial: string;
  emailPrincipal: string;
  emailCopia: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

interface FakePool {
  pool: { request: () => unknown };
  queryLog: CapturedQuery[];
  tables: Map<string, StoredRow>;
  inputCalls: Array<Record<string, unknown>>;
  errors: unknown[];
}

/**
 * Simulate what SQL Server does with the adapter's statements:
 *  - `SELECT … WHERE ruc = @ruc` → the row (with a Date updatedAt) or none.
 *  - the upsert batch (`UPDATE … WHERE ruc = @ruc; IF @@ROWCOUNT = 0
 *    INSERT …`) → updates when the key exists, inserts otherwise.
 */
function executeSql(sql: string, inputs: Record<string, unknown>, tables: Map<string, StoredRow>): { recordset: unknown[]; rowsAffected: number[] } {
  const upper = sql.trim().toUpperCase();
  if (upper.startsWith('SELECT') && upper.includes('FROM DBO.EMPRESACONTACTOS')) {
    const row = tables.get(String(inputs.ruc));
    if (!row) return { recordset: [], rowsAffected: [0] };
    return { recordset: [toDateShape(row)], rowsAffected: [1] };
  }
  if (upper.startsWith('UPDATE DBO.EMPRESACONTACTOS')) {
    const ruc = String(inputs.ruc);
    const existing = tables.get(ruc);
    if (existing) {
      tables.set(ruc, applySet(existing, inputs));
      return { recordset: [], rowsAffected: [1] };
    }
    // IF @@ROWCOUNT = 0 INSERT — the insert branch fills the missing key.
    tables.set(ruc, applySet(newRow(inputs), inputs));
    return { recordset: [], rowsAffected: [1] };
  }
  throw new Error(`fake: unhandled SQL: ${sql}`);
}

function newRow(inputs: Record<string, unknown>): StoredRow {
  return {
    ruc: String(inputs.ruc),
    razonSocial: '',
    emailPrincipal: '',
    emailCopia: null,
    updatedAt: '',
    updatedBy: null,
  };
}

function applySet(row: StoredRow, inputs: Record<string, unknown>): StoredRow {
  return {
    ...row,
    razonSocial: String(inputs.razonSocial),
    emailPrincipal: String(inputs.emailPrincipal),
    emailCopia: inputs.emailCopia === null ? null : String(inputs.emailCopia),
    updatedAt: String(inputs.updatedAt),
    updatedBy: inputs.updatedBy === null ? null : String(inputs.updatedBy),
  };
}

/** Simulate mssql's DATETIME2 → JS Date conversion on reads. */
function toDateShape(row: StoredRow): Record<string, unknown> {
  return { ...row, updatedAt: new Date(row.updatedAt) };
}

function createFakePool(): FakePool {
  const queryLog: CapturedQuery[] = [];
  const tables = new Map<string, StoredRow>();
  const inputCalls: Array<Record<string, unknown>> = [];
  const errors: unknown[] = [];

  const pool = {
    request: () => {
      let inputs: Record<string, unknown> = {};
      const request = {
        input: (name: string, value: unknown) => {
          inputs[name] = value;
          return request;
        },
        query: async (sql: string) => {
          if (errors.length > 0) throw errors.shift();
          queryLog.push({ sql, inputs: { ...inputs } });
          inputCalls.push({ ...inputs });
          return executeSql(sql, inputs, tables);
        },
        batch: async () => ({ recordset: [], rowsAffected: [0] }),
      };
      // Each request starts a fresh parameter bag, like a real
      // mssql Request.
      const resetInputs = (): void => {
        inputs = {};
      };
      void resetInputs;
      return request;
    },
  };
  return { pool, queryLog, tables, inputCalls, errors };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<SaveContactInput> = {}): SaveContactInput {
  return {
    ruc: '20123456789',
    razonSocial: 'EMPRESA SAC',
    emailPrincipal: 'contacto@empresa.com',
    emailCopia: 'gerencia@empresa.com',
    updatedBy: 'Dra. House',
    ...overrides,
  };
}

function seedRow(overrides: Partial<StoredRow> = {}): StoredRow {
  return {
    ruc: '20123456789',
    razonSocial: 'EMPRESA VIEJA SAC',
    emailPrincipal: 'viejo@empresa.com',
    emailCopia: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'alguien',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SqlServerContactRepository', () => {
  let fake: FakePool;
  let repo: SqlServerContactRepository;

  beforeEach(() => {
    fake = createFakePool();
    repo = new SqlServerContactRepository(fake.pool as never);
  });

  describe('getByRuc', () => {
    it('maps a stored row to the entity, converting updatedAt Date → ISO string', async () => {
      fake.tables.set('20123456789', seedRow());

      const contacto = await repo.getByRuc('20123456789');

      expect(contacto).not.toBeNull();
      expect(contacto).toEqual({
        ruc: '20123456789',
        razonSocial: 'EMPRESA VIEJA SAC',
        emailPrincipal: 'viejo@empresa.com',
        emailCopia: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedBy: 'alguien',
      } satisfies EmpresaContacto);
    });

    it('resolves null for an unknown key', async () => {
      expect(await repo.getByRuc('99999999999')).toBeNull();
    });

    it('parameterizes the ruc (no interpolation) via request().input()', async () => {
      await repo.getByRuc('20123456789');
      const select = fake.queryLog[0];
      expect(select).toBeDefined();
      expect(select?.sql).toContain('@ruc');
      expect(select?.sql).not.toContain("'20123456789'");
      expect(select?.inputs.ruc).toBe('20123456789');
    });

    it('propagates read errors unchanged (route maps them to 500)', async () => {
      fake.errors.push(new Error('ECONNRESET'));
      await expect(repo.getByRuc('20123456789')).rejects.toThrow('ECONNRESET');
    });
  });

  describe('upsert — existing key takes the UPDATE branch', () => {
    it('updates the row in place: exactly one row, latest emails, updatedBy from input', async () => {
      fake.tables.set('20123456789', seedRow());

      const saved = await repo.upsert(makeInput());

      expect(fake.tables.size).toBe(1);
      const row = fake.tables.get('20123456789');
      expect(row).toMatchObject({
        razonSocial: 'EMPRESA SAC',
        emailPrincipal: 'contacto@empresa.com',
        emailCopia: 'gerencia@empresa.com',
        updatedBy: 'Dra. House',
      });
      // The read-back after the write is what the route returns.
      expect(saved.ruc).toBe('20123456789');
      expect(saved.emailPrincipal).toBe('contacto@empresa.com');
      expect(saved.updatedBy).toBe('Dra. House');
      expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('sends the idempotent shape: UPDATE … WHERE ruc = @ruc; IF @@ROWCOUNT = 0 INSERT', async () => {
      fake.tables.set('20123456789', seedRow());

      await repo.upsert(makeInput());

      const write = fake.queryLog.find((q) => q.sql.toUpperCase().startsWith('UPDATE'));
      expect(write).toBeDefined();
      expect(write?.sql).toMatch(/UPDATE\s+dbo\.EmpresaContactos/i);
      expect(write?.sql).toMatch(/WHERE\s+ruc\s*=\s*@ruc/i);
      expect(write?.sql).toMatch(/IF\s+@@ROWCOUNT\s*=\s*0/i);
      expect(write?.sql).toMatch(/INSERT\s+INTO\s+dbo\.EmpresaContactos/i);
    });
  });

  describe('upsert — missing key takes the INSERT branch (IF @@ROWCOUNT = 0)', () => {
    it('inserts exactly one new row stamped with the input values', async () => {
      expect(fake.tables.size).toBe(0);

      const saved = await repo.upsert(makeInput({ ruc: '12345678' }));

      expect(fake.tables.size).toBe(1);
      const row = fake.tables.get('12345678');
      expect(row).toMatchObject({
        ruc: '12345678',
        razonSocial: 'EMPRESA SAC',
        emailPrincipal: 'contacto@empresa.com',
        emailCopia: 'gerencia@empresa.com',
        updatedBy: 'Dra. House',
      });
      expect(saved.ruc).toBe('12345678');
      expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('is idempotent from the caller perspective: identical double-upsert keeps one row', async () => {
      const input = makeInput();
      await repo.upsert(input);
      await repo.upsert(input);

      expect(fake.tables.size).toBe(1);
    });
  });

  describe('upsert — parameter binding and timestamps', () => {
    it('binds every value via .input() — no email or name text in the SQL', async () => {
      await repo.upsert(makeInput());

      const write = fake.queryLog.find((q) => q.sql.toUpperCase().startsWith('UPDATE'));
      expect(write).toBeDefined();
      expect(write?.sql).not.toContain('contacto@empresa.com');
      expect(write?.sql).not.toContain('EMPRESA SAC');
      expect(write?.sql).not.toContain('Dra. House');
      expect(write?.inputs).toMatchObject({
        ruc: '20123456789',
        razonSocial: 'EMPRESA SAC',
        emailPrincipal: 'contacto@empresa.com',
        emailCopia: 'gerencia@empresa.com',
        updatedBy: 'Dra. House',
      });
      // updatedAt is stamped app-side as an ISO string (D5).
      expect(typeof write?.inputs.updatedAt).toBe('string');
      expect(write?.inputs.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('passes a null emailCopia through as NULL', async () => {
      await repo.upsert(makeInput({ emailCopia: null }));

      const write = fake.queryLog.find((q) => q.sql.toUpperCase().startsWith('UPDATE'));
      expect(write?.inputs.emailCopia).toBeNull();
      expect(fake.tables.get('20123456789')?.emailCopia).toBeNull();
    });
  });

  describe('upsert — error mapping', () => {
    it('maps SQL Server 2627 (PK violation) to ContactConflictError', async () => {
      fake.errors.push(Object.assign(new Error('Violation of PRIMARY KEY constraint'), { number: 2627 }));
      await expect(repo.upsert(makeInput())).rejects.toBeInstanceOf(ContactConflictError);
    });

    it('maps SQL Server 2601 (duplicate key row) to ContactConflictError', async () => {
      fake.errors.push(Object.assign(new Error('Cannot insert duplicate key row'), { number: 2601 }));
      await expect(repo.upsert(makeInput())).rejects.toBeInstanceOf(ContactConflictError);
    });

    it('rethrows non-unique errors unchanged', async () => {
      const boom = Object.assign(new Error('Login failed'), { number: 18456 });
      fake.errors.push(boom);
      await expect(repo.upsert(makeInput())).rejects.toBe(boom);
    });
  });
});
