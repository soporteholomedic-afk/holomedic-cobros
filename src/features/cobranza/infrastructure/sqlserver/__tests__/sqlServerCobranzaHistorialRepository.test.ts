import { describe, it, expect, beforeEach } from 'vitest';

import type {
  CobranzaEnvioHistorial,
  RegistroEnvioCobranzaInput,
} from '../../../domain/entities';

import { SqlServerCobranzaHistorialRepository } from '../sqlServerCobranzaHistorialRepository';

/**
 * Unit tests for `SqlServerCobranzaHistorialRepository` over a fake
 * mssql pool, modeled on the contact-directory adapter suite.
 *
 * The fake exposes an in-memory `CobranzaEnviosHistorial` row array.
 * Every request's `{ sql, inputs }` pair is captured (including the
 * explicit mssql type argument) so parameter typing, JSON encoding
 * and ordering can be asserted. The fake simulates mssql behavior:
 * writes stamped with `SYSUTCDATETIME()` (an increasing clock — the
 * adapter omits `fechaEnvio` so the DB default fires) and reads
 * returning JS `Date` objects that the adapter converts to ISO
 * strings at the boundary.
 */

// ---------------------------------------------------------------------------
// Fake pool plumbing
// ---------------------------------------------------------------------------

interface CapturedParam {
  value: unknown;
  type: unknown;
  hasExplicitType: boolean;
}

interface CapturedQuery {
  sql: string;
  inputs: Record<string, CapturedParam>;
}

interface StoredHistRow {
  id: number;
  ruc: string;
  razonSocial: string | null;
  destinatarios: string;
  copias: string | null;
  asunto: string;
  cuerpoResumen: string | null;
  montoReclamado: number | null;
  moneda: string | null;
  comprobantesCount: number | null;
  estadoEnvio: string;
  errorDetalle: string | null;
  enviadoPor: string;
  fechaEnvio: Date;
}

interface FakePool {
  pool: { request: () => unknown };
  queryLog: CapturedQuery[];
  tables: StoredHistRow[];
  errors: unknown[];
  /** Popped on every INSERT — deterministic SYSUTCDATETIME() clock. */
  clock: Date[];
}

function executeSql(
  sql: string,
  inputs: Record<string, CapturedParam>,
  tables: StoredHistRow[],
  clock: Date[],
): { recordset: unknown[]; rowsAffected: number[] } {
  const upper = sql.trim().toUpperCase();
  if (upper.startsWith('INSERT INTO DBO.COBRANZAENVIOSHISTORIAL')) {
    const val = (name: string): unknown => inputs[name]?.value ?? null;
    tables.push({
      id: tables.length + 1,
      ruc: String(val('ruc')),
      razonSocial: val('razonSocial') === null ? null : String(val('razonSocial')),
      destinatarios: String(val('destinatarios')),
      copias: val('copias') === null ? null : String(val('copias')),
      asunto: String(val('asunto')),
      cuerpoResumen: val('cuerpoResumen') === null ? null : String(val('cuerpoResumen')),
      montoReclamado: val('montoReclamado') === null ? null : Number(val('montoReclamado')),
      moneda: val('moneda') === null ? null : String(val('moneda')),
      comprobantesCount:
        val('comprobantesCount') === null ? null : Number(val('comprobantesCount')),
      estadoEnvio: String(val('estadoEnvio')),
      errorDetalle: val('errorDetalle') === null ? null : String(val('errorDetalle')),
      enviadoPor: String(val('enviadoPor')),
      // SYSUTCDATETIME() DEFAULT — the adapter must NOT send fechaEnvio.
      fechaEnvio: clock.shift() ?? new Date(),
    });
    return { recordset: [], rowsAffected: [1] };
  }
  if (upper.startsWith('SELECT') && upper.includes('FROM DBO.COBRANZAENVIOSHISTORIAL')) {
    const ruc = String(inputs.ruc?.value);
    const rows = tables
      .filter((row) => row.ruc === ruc)
      // Server-side ORDER BY fechaEnvio DESC.
      .sort((a, b) => b.fechaEnvio.getTime() - a.fechaEnvio.getTime())
      .map((row) => ({ ...row }));
    return { recordset: rows, rowsAffected: [rows.length] };
  }
  throw new Error(`fake: unhandled SQL: ${sql}`);
}

function createFakePool(): FakePool {
  const queryLog: CapturedQuery[] = [];
  const tables: StoredHistRow[] = [];
  const errors: unknown[] = [];
  const clock: Date[] = [];

  const pool = {
    request: () => {
      const inputs: Record<string, CapturedParam> = {};
      const request = {
        input: (name: string, typeOrValue: unknown, maybeValue?: unknown) => {
          const hasExplicitType = maybeValue !== undefined;
          inputs[name] = hasExplicitType
            ? { value: maybeValue, type: typeOrValue, hasExplicitType: true }
            : { value: typeOrValue, type: undefined, hasExplicitType: false };
          return request;
        },
        query: async (sql: string) => {
          if (errors.length > 0) throw errors.shift();
          queryLog.push({ sql, inputs: { ...inputs } });
          return executeSql(sql, inputs, tables, clock);
        },
        batch: async () => ({ recordset: [], rowsAffected: [0] }),
      };
      return request;
    },
  };
  return { pool, queryLog, tables, errors, clock };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInput(
  overrides: Partial<RegistroEnvioCobranzaInput> = {},
): RegistroEnvioCobranzaInput {
  return {
    ruc: '20123456789',
    razonSocial: 'EMPRESA SAC',
    destinatarios: ['cobranza@empresa.com'],
    copias: ['gerencia@empresa.com'],
    asunto: 'Estado de cuenta — requerimiento',
    cuerpoResumen: '<p>Requerimiento de pago</p>',
    montoReclamado: 1500.5,
    moneda: 'S/',
    comprobantesCount: 3,
    estadoEnvio: 'SUCCESS',
    errorDetalle: null,
    enviadoPor: 'Dra. House',
    ...overrides,
  };
}

function seedRow(overrides: Partial<StoredHistRow> = {}): StoredHistRow {
  return {
    id: 1,
    ruc: '20123456789',
    razonSocial: 'EMPRESA SAC',
    destinatarios: '["cobranza@empresa.com"]',
    copias: '["gerencia@empresa.com"]',
    asunto: 'Estado de cuenta',
    cuerpoResumen: '<p>body</p>',
    montoReclamado: 1500.5,
    moneda: 'S/',
    comprobantesCount: 3,
    estadoEnvio: 'SUCCESS',
    errorDetalle: null,
    enviadoPor: 'Dra. House',
    fechaEnvio: new Date('2026-08-20T10:00:00.000Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SqlServerCobranzaHistorialRepository', () => {
  let fake: FakePool;
  let repo: SqlServerCobranzaHistorialRepository;

  beforeEach(() => {
    fake = createFakePool();
    repo = new SqlServerCobranzaHistorialRepository(fake.pool as never);
  });

  describe('insert', () => {
    it('appends one row binding every column explicitly-typed via .input(name, type, value)', async () => {
      fake.clock.push(new Date('2026-08-22T15:00:00.000Z'));

      await repo.insert(makeInput());

      expect(fake.tables).toHaveLength(1);
      const write = fake.queryLog[0];
      expect(write).toBeDefined();
      // Typed-parameter contract: every bound column carries an
      // explicit mssql type (Decimal(18,2) for money — never inferred
      // Float — Int for counts, NVarChar for JSON/LOB columns).
      for (const param of Object.values(write?.inputs ?? {})) {
        expect(param.hasExplicitType).toBe(true);
        expect(param.type).toBeDefined();
      }
      expect(Object.keys(write?.inputs ?? {}).sort()).toEqual(
        [
          'ruc',
          'razonSocial',
          'destinatarios',
          'copias',
          'asunto',
          'cuerpoResumen',
          'montoReclamado',
          'moneda',
          'comprobantesCount',
          'estadoEnvio',
          'errorDetalle',
          'enviadoPor',
        ].sort(),
      );
      // fechaEnvio is DB-stamped (SYSUTCDATETIME DEFAULT, R7) — the
      // adapter never sends it.
      expect(write?.sql.toLowerCase()).not.toContain('fechaenvio');
      // The stored row mirrors the input.
      expect(fake.tables[0]).toMatchObject({
        ruc: '20123456789',
        asunto: 'Estado de cuenta — requerimiento',
        estadoEnvio: 'SUCCESS',
        enviadoPor: 'Dra. House',
        fechaEnvio: new Date('2026-08-22T15:00:00.000Z'),
      });
    });

    it('parameterizes values — no email, subject or body text in the SQL', async () => {
      await repo.insert(makeInput());

      const write = fake.queryLog[0];
      expect(write?.sql).not.toContain('cobranza@empresa.com');
      expect(write?.sql).not.toContain('EMPRESA SAC');
      expect(write?.sql).not.toContain('Requerimiento de pago');
      expect(write?.sql).toContain('@ruc');
      expect(write?.sql).toContain('@cuerpoResumen');
    });

    it('JSON-encodes destinatarios/copias and passes null copias through as NULL', async () => {
      await repo.insert(makeInput({ copias: null }));

      expect(fake.queryLog[0]?.inputs.destinatarios?.value).toBe('["cobranza@empresa.com"]');
      expect(fake.queryLog[0]?.inputs.copias?.value).toBeNull();
      expect(fake.tables[0]?.copias).toBeNull();
    });

    it('clamps razonSocial to 255 characters (NVARCHAR(255) column)', async () => {
      await repo.insert(makeInput({ razonSocial: 'X'.repeat(300) }));

      expect((String(fake.queryLog[0]?.inputs.razonSocial?.value)).length).toBe(255);
    });

    it('keeps null optional metadata as NULL (back-compat payloads)', async () => {
      await repo.insert(
        makeInput({
          razonSocial: null,
          montoReclamado: null,
          moneda: null,
          comprobantesCount: null,
        }),
      );

      const inputs = fake.queryLog[0]?.inputs ?? {};
      expect(inputs.razonSocial?.value).toBeNull();
      expect(inputs.montoReclamado?.value).toBeNull();
      expect(inputs.moneda?.value).toBeNull();
      expect(inputs.comprobantesCount?.value).toBeNull();
    });

    it('propagates write errors unchanged (audit helper swallows them)', async () => {
      fake.errors.push(new Error('String or binary data would be truncated'));
      await expect(repo.insert(makeInput())).rejects.toThrow('truncated');
    });
  });

  describe('getByRuc', () => {
    it('returns rows most-recent-first, mapped to entities without cuerpoResumen', async () => {
      fake.tables.push(
        seedRow({ id: 1, fechaEnvio: new Date('2026-08-20T10:00:00.000Z') }),
        seedRow({
          id: 2,
          estadoEnvio: 'FAILED',
          errorDetalle: 'SMTP connection timed out',
          fechaEnvio: new Date('2026-08-21T18:30:00.000Z'),
        }),
        seedRow({ id: 3, ruc: '99999999999', fechaEnvio: new Date('2026-08-22T09:00:00.000Z') }),
      );

      const envios = await repo.getByRuc('20123456789');

      expect(envios).toHaveLength(2);
      // Most-recent-first: the 2026-08-21 attempt precedes 2026-08-20.
      expect(envios[0]).toEqual({
        id: 2,
        ruc: '20123456789',
        razonSocial: 'EMPRESA SAC',
        destinatarios: ['cobranza@empresa.com'],
        copias: ['gerencia@empresa.com'],
        asunto: 'Estado de cuenta',
        montoReclamado: 1500.5,
        moneda: 'S/',
        comprobantesCount: 3,
        estadoEnvio: 'FAILED',
        errorDetalle: 'SMTP connection timed out',
        enviadoPor: 'Dra. House',
        fechaEnvio: '2026-08-21T18:30:00.000Z',
      } satisfies CobranzaEnvioHistorial);
      expect(envios[1]?.id).toBe(1);
      // The read model never carries the LOB body column.
      expect(Object.keys(envios[0] ?? {})).not.toContain('cuerpoResumen');
    });

    it('selects without cuerpoResumen, orders by fechaEnvio DESC and parameterizes ruc', async () => {
      await repo.getByRuc('20123456789');

      const select = fake.queryLog[0];
      expect(select).toBeDefined();
      const sqlLower = select?.sql.toLowerCase() ?? '';
      expect(sqlLower).toContain('order by fechaenvio desc');
      expect(sqlLower).not.toContain('cuerporesumen');
      expect(select?.sql).toContain('@ruc');
      expect(select?.sql).not.toContain("'20123456789'");
      expect(select?.inputs.ruc?.value).toBe('20123456789');
    });

    it('resolves [] for a key with no attempts (seeded others excluded)', async () => {
      fake.tables.push(seedRow({ ruc: '99999999999' }));

      const envios = await repo.getByRuc('20123456789');

      expect(envios).toEqual([]);
    });

    it('defensively decodes malformed stored JSON: destinatarios → [], copias → null', async () => {
      fake.tables.push(
        seedRow({ destinatarios: 'not-json', copias: 'also-not-json' }),
      );

      const envios = await repo.getByRuc('20123456789');

      expect(envios).toHaveLength(1);
      expect(envios[0]?.destinatarios).toEqual([]);
      expect(envios[0]?.copias).toBeNull();
    });

    it('propagates read errors unchanged (route maps them to 500)', async () => {
      fake.errors.push(new Error('ECONNRESET'));
      await expect(repo.getByRuc('20123456789')).rejects.toThrow('ECONNRESET');
    });
  });
});
