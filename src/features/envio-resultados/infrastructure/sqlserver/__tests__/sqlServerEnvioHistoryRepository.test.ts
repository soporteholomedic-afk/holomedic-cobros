import { describe, it, expect } from 'vitest';
import type * as mssql from 'mssql';
import type { EnvioHistoryInsert } from '../../../domain/entities';

import {
  SqlServerEnvioHistoryRepository,
  rowToEnvioHistoryRow,
  rowToEnvioHistorySummary,
} from '../SqlServerEnvioHistoryRepository';

/**
 * Unit tests for the WRITE path of `SqlServerEnvioHistoryRepository`
 * over a fake pool (template-repo pattern): the fake executes the
 * adapter's INSERT/UPDATE against an in-memory row map and records
 * every `{ sql, inputs }` pair so parameter binding — never string
 * interpolation — can be asserted.
 */

interface FakePoolEnv {
  pool: mssql.ConnectionPool;
  rows: Map<string, Record<string, unknown>>;
  queries: Array<{ sql: string; inputs: Record<string, unknown> }>;
}

function makeFakePool(): FakePoolEnv {
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

  it('read methods throw until PR2 lands (loud slice boundary)', async () => {
    const repo = new SqlServerEnvioHistoryRepository(makeFakePool().pool);
    await expect(repo.search({ page: 1 })).rejects.toThrow(/PR2/);
    await expect(repo.getById('x')).rejects.toThrow(/PR2/);
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
