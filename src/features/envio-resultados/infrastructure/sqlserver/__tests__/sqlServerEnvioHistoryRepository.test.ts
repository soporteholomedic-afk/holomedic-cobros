import { describe, it, expect } from 'vitest';
import type * as mssql from 'mssql';
import type { EnvioHistoryInsert } from '../../../domain/entities';

import {
  SqlServerEnvioHistoryRepository,
  rowToEnvioHistoryRow,
  rowToEnvioHistorySummary,
} from '../SqlServerEnvioHistoryRepository';

/**
 * Unit tests for `SqlServerEnvioHistoryRepository` over a fake pool
 * (template-repo pattern): the fake executes the adapter's
 * INSERT/UPDATE against an in-memory row map and records every
 * `{ sql, inputs }` pair so parameter binding — never string
 * interpolation — can be asserted. For the READ path the fake serves
 * configurable page rows + total (search) and the row map itself
 * (getById PK seek).
 */

interface FakePoolEnv {
  pool: mssql.ConnectionPool;
  rows: Map<string, Record<string, unknown>>;
  queries: Array<{ sql: string; inputs: Record<string, unknown> }>;
}

/** Read-path stubs: what the search SELECT / COUNT SELECT return. */
interface FakeReads {
  pageRows?: Record<string, unknown>[];
  total?: number;
}

function makeFakePool(reads: FakeReads = {}): FakePoolEnv {
  const rows = new Map<string, Record<string, unknown>>();
  const queries: FakePoolEnv['queries'] = [];
  const pool = {
    request: () => {
      const inputs: Record<string, unknown> = {};
      const request = {
        input(name: string, value: unknown) {
          inputs[name] = value;
          return request;
        },
        async query(sql: string) {
          queries.push({ sql, inputs: { ...inputs } });
          const upper = sql.trim().toUpperCase();
          if (upper.startsWith('INSERT INTO DBO.ENVIOS_CONSOLIDADOS')) {
            const row = { ...inputs };
            rows.set(String(inputs.id), row);
            return { recordset: [{ id: inputs.id }], rowsAffected: 1 };
          }
          if (upper.startsWith('UPDATE DBO.ENVIOS_CONSOLIDADOS')) {
            const row = rows.get(String(inputs.id));
            if (!row) return { recordset: [], rowsAffected: 0 };
            row.status = inputs.status;
            row.errorDetail = inputs.errorDetail;
            return { recordset: [], rowsAffected: 1 };
          }
          if (upper.startsWith('SELECT')) {
            if (upper.includes('COUNT(*)')) {
              return { recordset: [{ total: reads.total ?? 0 }], rowsAffected: 1 };
            }
            if (upper.includes('WHERE ID = @ID')) {
              const row = rows.get(String(inputs.id));
              return { recordset: row ? [row] : [], rowsAffected: row ? 1 : 0 };
            }
            // Search page SELECT — configurable fixture.
            return { recordset: reads.pageRows ?? [], rowsAffected: reads.pageRows?.length ?? 0 };
          }
          throw new Error(`fake pool: unhandled SQL: ${sql}`);
        },
      };
      return request;
    },
  };
  return { pool: pool as unknown as mssql.ConnectionPool, rows, queries };
}

const INSERT_FIXTURE: EnvioHistoryInsert = {
  status: 'pendiente',
  sentBy: 'Dra. House',
  destino: 'Proyecto Norte',
  companyId: 'c-001',
  companyName: 'Perú Contratas S.A.',
  nombreCompleto: 'María Quispe',
  toRecipients: ['gerencia@perucontratas.pe'],
  ccRecipients: ['archivo@holomedic.pe'],
  subject: 'Resultados de María Quispe',
  bodyHtml: '<p>Adjuntos Perú</p>',
  attachments: [
    {
      source: 'unc',
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      storedName: '12345678CERT.pdf',
      deliveryName: 'CAMO-María Quispe-Proyecto Norte.pdf',
      tipoExamen: 'CAMO',
      nombreCompleto: 'María Quispe',
    },
    { source: 'local', storedName: 'foto.png', contentType: 'image/png', sizeBytes: 8 },
  ],
};

describe('SqlServerEnvioHistoryRepository — write path', () => {
  it('insert returns the generated id and persists accent-stripped search columns', async () => {
    const env = makeFakePool();
    const repo = new SqlServerEnvioHistoryRepository(env.pool);

    const id = await repo.insert(INSERT_FIXTURE);

    expect(id).toBeTruthy();
    const row = env.rows.get(id);
    expect(row).toBeDefined();
    // Accent-stripped, lowercase ("Perú"/"María" canonicalized).
    expect(row!.searchRecipients).toBe('gerencia@perucontratas.pe archivo@holomedic.pe');
    expect(row!.searchCompany).toBe('peru contratas s.a.');
    expect(row!.searchSubject).toBe('resultados de maria quispe');
    expect(row!.searchPatients).toBe('12345678 maria quispe');
  });

  it('persists the attachment snapshot verbatim: unc storedName AND deliveryName; local metadata-only', async () => {
    const env = makeFakePool();
    const repo = new SqlServerEnvioHistoryRepository(env.pool);

    const id = await repo.insert(INSERT_FIXTURE);
    const row = env.rows.get(id)!;
    const snapshot = JSON.parse(String(row.attachmentsJson)) as Array<Record<string, unknown>>;

    expect(snapshot).toHaveLength(2);
    // UNC entry keeps the durable address + both names.
    expect(snapshot[0]).toMatchObject({
      source: 'unc',
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      storedName: '12345678CERT.pdf',
      deliveryName: 'CAMO-María Quispe-Proyecto Norte.pdf',
    });
    // Local entry is metadata-only — no LAN coordinates, no bytes.
    expect(snapshot[1]).toEqual({
      source: 'local',
      storedName: 'foto.png',
      contentType: 'image/png',
      sizeBytes: 8,
    });
    // bodyHtml verbatim + recipients as JSON arrays.
    expect(row.bodyHtml).toBe('<p>Adjuntos Perú</p>');
    expect(JSON.parse(String(row.toRecipients))).toEqual(['gerencia@perucontratas.pe']);
  });

  it('uses OUTPUT INSERTED.id and binds every value as a parameter (no interpolation)', async () => {
    const env = makeFakePool();
    const repo = new SqlServerEnvioHistoryRepository(env.pool);

    await repo.insert(INSERT_FIXTURE);

    const { sql, inputs } = env.queries[0]!;
    expect(sql).toMatch(/OUTPUT\s+INSERTED\.id\s+AS\s+id/i);
    expect(sql).toContain('@id');
    // 16 parameters bound — the row map IS the inputs.
    expect(Object.keys(inputs)).toHaveLength(16);
    // The literal user values never appear inside the SQL text.
    expect(sql).not.toContain('Perú Contratas');
    expect(sql).not.toContain('Dra. House');
  });

  it('updateStatus sets enviado with a null errorDetail', async () => {
    const env = makeFakePool();
    const repo = new SqlServerEnvioHistoryRepository(env.pool);
    const id = await repo.insert(INSERT_FIXTURE);

    await repo.updateStatus(id, 'enviado', null);

    const row = env.rows.get(id)!;
    expect(row.status).toBe('enviado');
    expect(row.errorDetail).toBeNull();
    const update = env.queries[1]!;
    expect(update.sql).toMatch(/SET\s+status\s*=\s*@status,\s*errorDetail\s*=\s*@errorDetail\s+WHERE\s+id\s*=\s*@id/i);
  });

  it('updateStatus sets error with the populated detail', async () => {
    const env = makeFakePool();
    const repo = new SqlServerEnvioHistoryRepository(env.pool);
    const id = await repo.insert(INSERT_FIXTURE);

    await repo.updateStatus(id, 'error', 'SMTP: connection refused');

    const row = env.rows.get(id)!;
    expect(row.status).toBe('error');
    expect(row.errorDetail).toBe('SMTP: connection refused');
  });
});

// ---- Read path (PR2 — search + getById) ----

/** A raw DB-shaped page row (what SELECT would return; no search* columns). */
function makePageRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'row-1',
    sentAt: new Date('2026-08-20T12:00:00.000Z'),
    status: 'enviado',
    errorDetail: null,
    sentBy: 'Dra. House',
    destino: 'Proyecto Norte',
    companyId: 'c-001',
    companyName: 'Perú Contratas S.A.',
    nombreCompleto: 'María Quispe',
    toRecipients: '["gerencia@perucontratas.pe"]',
    ccRecipients: '[]',
    subject: 'Resultados de María Quispe',
    attachmentsJson:
      '[{"source":"unc","ruc":"20123456789","dni":"12345678","idAten":"AT-001","path":"LEGAJOS","storedName":"12345678CERT.pdf","deliveryName":"CAMO.pdf"}]',
    ...overrides,
  };
}

describe('SqlServerEnvioHistoryRepository — search (read path)', () => {
  it('normalizes q, escapes LIKE wildcards, and ORs @pattern across the 4 search columns', async () => {
    const env = makeFakePool({ pageRows: [], total: 0 });
    const repo = new SqlServerEnvioHistoryRepository(env.pool);

    const result = await repo.search({ q: 'Perú 100%_LC [PDF]', page: 1 });

    const { sql, inputs } = env.queries[0]!;
    // Term normalized (accent-stripped, lowercase) AND wildcards escaped.
    // `]` needs no escape: a lone `]` outside a `[...]` class is literal.
    expect(inputs.pattern).toBe('%peru 100\\%\\_lc \\[pdf]%');
    expect(sql).toMatch(/ESCAPE '\\'/);
    for (const column of ['searchRecipients', 'searchCompany', 'searchSubject', 'searchPatients']) {
      expect(sql).toContain(`${column} LIKE @pattern`);
    }
    // The raw user term never appears inside the SQL text.
    expect(sql).not.toContain('[PDF]');
    expect(result).toEqual({ rows: [], total: 0, page: 1 });
  });

  it('computes OFFSET from the requested page and keeps the COUNT WHERE identical', async () => {
    const env = makeFakePool({ pageRows: [makePageRow()], total: 47 });
    const repo = new SqlServerEnvioHistoryRepository(env.pool);

    await repo.search({ q: 'maria', fechaInicio: '2026-08-01', fechaFin: '2026-08-20', page: 3 });

    const [pageQuery, countQuery] = env.queries;
    expect(pageQuery!.inputs.offset).toBe(40);
    expect(pageQuery!.inputs.pageSize).toBe(20);
    expect(pageQuery!.sql).toContain('ORDER BY sentAt DESC, id DESC');
    expect(pageQuery!.sql).toContain('OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY');
    expect(pageQuery!.sql).toContain('sentAt >= @fechaInicio');
    expect(pageQuery!.sql).toContain('sentAt < DATEADD(DAY, 1, @fechaFin)');
    // Twin COUNT: identical WHERE, same bound filter params.
    const whereOf = (sql: string): string =>
      /WHERE([\s\S]*?)(?:ORDER BY|;)/.exec(sql)![1]!.trim();
    expect(whereOf(countQuery!.sql)).toBe(whereOf(pageQuery!.sql));
    expect(countQuery!.sql).toContain('SELECT COUNT(*) AS total');
    expect(countQuery!.inputs.pattern).toBe(pageQuery!.inputs.pattern);
    expect(countQuery!.inputs.fechaInicio).toBe('2026-08-01');
  });

  it('omits the q and date predicates entirely when absent', async () => {
    const env = makeFakePool({ pageRows: [], total: 0 });
    const repo = new SqlServerEnvioHistoryRepository(env.pool);

    await repo.search({ page: 1 });

    const { sql, inputs } = env.queries[0]!;
    expect(sql).not.toContain('LIKE');
    expect(sql).not.toContain('fechaInicio');
    expect(sql).not.toContain('DATEADD');
    expect(inputs.pattern).toBeUndefined();
    expect(inputs.offset).toBe(0);
  });

  it('page past the end returns an empty page with a consistent total, summaries without bodyHtml', async () => {
    const env = makeFakePool({ pageRows: [], total: 47 });
    const repo = new SqlServerEnvioHistoryRepository(env.pool);

    const result = await repo.search({ page: 99 });

    expect(result).toEqual({ rows: [], total: 47, page: 99 });
  });

  it('maps page rows to parsed summaries (Date→ISO, JSON parsed, bodyHtml dropped)', async () => {
    const env = makeFakePool({ pageRows: [makePageRow(), makePageRow({ id: 'row-2' })], total: 2 });
    const repo = new SqlServerEnvioHistoryRepository(env.pool);

    const result = await repo.search({ page: 1 });

    expect(result.rows).toHaveLength(2);
    const first = result.rows[0]!;
    expect(first.id).toBe('row-1');
    expect(first.sentAt).toBe('2026-08-20T12:00:00.000Z');
    expect(first.toRecipients).toEqual(['gerencia@perucontratas.pe']);
    expect(first.attachments).toHaveLength(1);
    for (const row of result.rows) {
      expect('bodyHtml' in row).toBe(false);
    }
  });
});

describe('SqlServerEnvioHistoryRepository — getById (read path)', () => {
  it('returns the full row by PK including bodyHtml, with Date→ISO conversion', async () => {
    const env = makeFakePool();
    env.rows.set('row-1', makePageRow({ bodyHtml: '<p>Adjuntos Perú</p>' }));
    const repo = new SqlServerEnvioHistoryRepository(env.pool);

    const row = await repo.getById('row-1');

    expect(row).not.toBeNull();
    expect(row!.id).toBe('row-1');
    expect(row!.bodyHtml).toBe('<p>Adjuntos Perú</p>');
    expect(row!.sentAt).toBe('2026-08-20T12:00:00.000Z');
    expect(row!.attachments[0]).toMatchObject({ source: 'unc', dni: '12345678' });
    const { sql } = env.queries[0]!;
    expect(sql).toContain('bodyHtml');
    expect(sql).toMatch(/WHERE id = @id/);
  });

  it('returns null for an unknown id', async () => {
    const env = makeFakePool();
    const repo = new SqlServerEnvioHistoryRepository(env.pool);

    expect(await repo.getById('missing')).toBeNull();
  });
});

describe('rowTo mappers', () => {
  const rawRow: Record<string, unknown> = {
    id: 'row-1',
    sentAt: new Date('2026-08-20T12:00:00.000Z'),
    status: 'error',
    errorDetail: 'boom',
    sentBy: 'sistema',
    destino: '',
    companyId: '',
    companyName: 'Perú Contratas S.A.',
    nombreCompleto: '',
    toRecipients: '["a@b.pe"]',
    ccRecipients: '[]',
    subject: 'Resultados',
    bodyHtml: '<p>Body</p>',
    attachmentsJson:
      '[{"source":"local","storedName":"foto.png","contentType":"image/png","sizeBytes":8}]',
  };

  it('rowToEnvioHistoryRow converts Date→ISO and parses the JSON columns', () => {
    const row = rowToEnvioHistoryRow(rawRow);
    expect(row.sentAt).toBe('2026-08-20T12:00:00.000Z');
    expect(row.toRecipients).toEqual(['a@b.pe']);
    expect(row.attachments).toEqual([
      { source: 'local', storedName: 'foto.png', contentType: 'image/png', sizeBytes: 8 },
    ]);
    expect(row.errorDetail).toBe('boom');
  });

  it('rowToEnvioHistorySummary drops bodyHtml', () => {
    const summary = rowToEnvioHistorySummary(rawRow);
    expect('bodyHtml' in summary).toBe(false);
    expect(summary.id).toBe('row-1');
  });
});
