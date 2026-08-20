import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSearchText } from '@/lib/normalize-search-text';
import type { EnvioHistorySummary, EnvioSearchQuery, EnvioSearchResult } from '@/features/envio-resultados/domain/entities';
import type { IEnvioHistoryRepository } from '@/features/envio-resultados/domain/ports';

/**
 * GET /api/consolidados/envios — route-level contract tests (task 2.3).
 * The REAL `SearchEnviosUseCase` runs; only the repository is a mock
 * (mini in-memory search mirroring the SQL semantics: accent-insensitive
 * OR across the 4 axes, inclusive date range, newest-first, 20/row).
 */

const mockGetEnvioHistoryDb = vi.hoisted(() => vi.fn());
vi.mock('@/features/envio-resultados/infrastructure/getEnvioHistoryDb', () => ({
  getEnvioHistoryDb: mockGetEnvioHistoryDb,
}));

import { GET } from '../route';

// ---- Fixtures (newest first) ----

function summary(overrides: Partial<EnvioHistorySummary>): EnvioHistorySummary {
  return {
    id: 'r1',
    sentAt: '2026-08-20T10:00:00.000Z',
    status: 'enviado',
    errorDetail: null,
    sentBy: 'Dra. House',
    destino: 'Proyecto Norte',
    companyId: 'c-001',
    companyName: 'Perú Contratas S.A.',
    nombreCompleto: 'María Quispe',
    toRecipients: ['gerencia@perucontratas.pe'],
    ccRecipients: [],
    subject: 'Resultados María Quispe',
    attachments: [],
    ...overrides,
  };
}

const FIXTURES: EnvioHistorySummary[] = [
  summary({}),
  summary({
    id: 'r2',
    sentAt: '2026-08-19T09:00:00.000Z',
    companyId: 'c-002',
    companyName: 'ACME Ltda.',
    toRecipients: ['rrhh@acme.com'],
    subject: 'Envío batch agosto',
    attachments: [
      {
        source: 'unc',
        ruc: '20987654321',
        dni: '87654321',
        idAten: 'AT-002',
        path: '',
        storedName: '87654321EMO.pdf',
        deliveryName: 'EMO-Jorge Rojas.pdf',
        nombreCompleto: 'Jorge Rojas',
      },
    ],
  }),
  summary({
    id: 'r3',
    sentAt: '2026-08-18T08:00:00.000Z',
    status: 'error',
    errorDetail: 'SMTP: connection refused',
    companyId: 'c-003',
    companyName: 'Clínica Los Andes',
    toRecipients: ['facturacion@andes.pe'],
    subject: 'Resultados Jorge Álvarez',
    attachments: [
      {
        source: 'unc',
        ruc: '20555666777',
        dni: '11223344',
        idAten: 'AT-003',
        path: '',
        storedName: '11223344CERT.pdf',
        deliveryName: 'CERT-Jorge Álvarez.pdf',
        nombreCompleto: 'Jorge Álvarez',
      },
    ],
  }),
];

// ---- Mini in-memory repository (mirrors the SQL semantics) ----

function makeMockRepo(fixtures: EnvioHistorySummary[]): IEnvioHistoryRepository {
  return {
    insert: vi.fn(),
    updateStatus: vi.fn(),
    getById: vi.fn(),
    search: vi.fn(async (query: EnvioSearchQuery): Promise<EnvioSearchResult> => {
      let rows = [...fixtures].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
      if (query.q?.trim()) {
        const nq = normalizeSearchText(query.q);
        rows = rows.filter((r) =>
          [
            ...r.toRecipients,
            ...r.ccRecipients,
            r.companyName,
            r.subject,
            ...r.attachments.flatMap((a) => (a.source === 'unc' ? [a.dni, a.nombreCompleto ?? ''] : [])),
          ]
            .map(normalizeSearchText)
            .join(' ')
            .includes(nq),
        );
      }
      if (query.fechaInicio) rows = rows.filter((r) => r.sentAt.slice(0, 10) >= query.fechaInicio!);
      if (query.fechaFin) rows = rows.filter((r) => r.sentAt.slice(0, 10) <= query.fechaFin!);
      const total = rows.length;
      const start = (query.page - 1) * 20;
      return { rows: rows.slice(start, start + 20), total, page: query.page };
    }),
  } as unknown as IEnvioHistoryRepository;
}

function callGet(search: string): Promise<Response> {
  return GET({ url: `http://localhost:3001/api/consolidados/envios${search}` } as Request);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEnvioHistoryDb.mockReset();
  mockGetEnvioHistoryDb.mockResolvedValue(makeMockRepo(FIXTURES));
});

describe('GET /api/consolidados/envios — q axes (accent-insensitive both directions)', () => {
  it.each([
    ['q matches a recipient email', '?q=gerencia@perucontratas.pe', ['r1']],
    ['q matches part of a company name', '?q=contratas', ['r1']],
    ['q matches part of a subject', '?q=agosto', ['r2']],
    ['q matches a patient DNI', '?q=87654321', ['r2']],
    ['q matches a patient name', '?q=Jorge Rojas', ['r2']],
    ['accented q matches unaccented-stored text', '?q=perú', ['r1']],
    ['unaccented q matches accented-stored text', '?q=peru', ['r1']],
    ['uppercase unaccented q matches María', '?q=MARIA', ['r1']],
    ['accented q matches accented-stored text', '?q=María', ['r1']],
  ])('%s (%s → %j)', async (_label, search, expectedIds) => {
    const res = await callGet(search);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.rows.map((r: { id: string }) => r.id)).toEqual(expectedIds);
  });
});

describe('GET /api/consolidados/envios — dates, paging, defaults', () => {
  it('date range filters conjoin with q', async () => {
    // r1 (María) is 2026-08-20 — outside a range ending 2026-08-19.
    const res = await callGet('?q=maria&fechaInicio=2026-08-19&fechaFin=2026-08-19');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('inclusive end day: fechaFin=2026-08-19 keeps 08-19 rows', async () => {
    const res = await callGet('?fechaInicio=2026-08-19&fechaFin=2026-08-19');
    const body = await res.json();
    expect(body.rows.map((r: { id: string }) => r.id)).toEqual(['r2']);
  });

  it('default listing is newest-first with the 200 shape', async () => {
    const res = await callGet('');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rows.map((r: { id: string }) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    // Summaries never expose bodyHtml.
    expect('bodyHtml' in body.rows[0]).toBe(false);
  });
});

describe('GET /api/consolidados/envios — errors', () => {
  it.each([
    ['page=0', '?page=0'],
    ['page=abc', '?page=abc'],
    ['malformed fechaInicio', '?fechaInicio=20/08/2026'],
    ['malformed fechaFin', '?fechaFin=ayer'],
  ])('invalid params (%s) → 400 VALIDATION_ERROR JSON', async (_label, search) => {
    const res = await callGet(search);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(typeof body.error).toBe('string');
  });

  it('repository failure → 500 INTERNAL_ERROR', async () => {
    mockGetEnvioHistoryDb.mockRejectedValue(new Error('db down'));
    const res = await callGet('');
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
  });
});
