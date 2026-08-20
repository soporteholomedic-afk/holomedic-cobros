import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvioHistoryRow } from '@/features/envio-resultados/domain/entities';
import type { IEnvioHistoryRepository } from '@/features/envio-resultados/domain/ports';

/**
 * GET /api/consolidados/envios/[id] — route contract tests (task 2.3):
 * full row (including bodyHtml) for a known id, 404 for an unknown
 * id, 500 when the repository fails. Consumed by the PR4
 * `?reenvio=<id>` hydration flow.
 */

const mockGetEnvioHistoryDb = vi.hoisted(() => vi.fn());
vi.mock('@/features/envio-resultados/infrastructure/getEnvioHistoryDb', () => ({
  getEnvioHistoryDb: mockGetEnvioHistoryDb,
}));

import { GET } from '../route';

const FULL_ROW: EnvioHistoryRow = {
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
  bodyHtml: '<p>Adjuntos Perú</p>',
  attachments: [
    {
      source: 'unc',
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      storedName: '12345678CERT.pdf',
      deliveryName: 'CAMO-María Quispe.pdf',
    },
  ],
};

function makeMockRepo(row: EnvioHistoryRow | null): IEnvioHistoryRepository {
  return {
    insert: vi.fn(),
    updateStatus: vi.fn(),
    search: vi.fn(),
    getById: vi.fn().mockResolvedValue(row),
  } as unknown as IEnvioHistoryRepository;
}

function callGet(id: string): Promise<Response> {
  return GET({ url: `http://localhost:3001/api/consolidados/envios/${id}` } as Request, {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEnvioHistoryDb.mockReset();
});

describe('GET /api/consolidados/envios/[id]', () => {
  it('returns the full row including bodyHtml for a known id', async () => {
    mockGetEnvioHistoryDb.mockResolvedValue(makeMockRepo(FULL_ROW));

    const res = await callGet('r1');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, row: FULL_ROW });
  });

  it('returns 404 NOT_FOUND for an unknown id', async () => {
    mockGetEnvioHistoryDb.mockResolvedValue(makeMockRepo(null));

    const res = await callGet('missing-id');
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });

  it('repository failure → 500 INTERNAL_ERROR', async () => {
    mockGetEnvioHistoryDb.mockRejectedValue(new Error('db down'));

    const res = await callGet('r1');
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
  });
});
