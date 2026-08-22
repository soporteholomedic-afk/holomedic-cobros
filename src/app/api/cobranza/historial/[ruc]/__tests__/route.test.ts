import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CobranzaEnvioHistorial } from '@/features/cobranza/domain/entities';
import type { ICobranzaEnviosHistorialRepository } from '@/features/cobranza/domain/ports';

/**
 * GET /api/cobranza/historial/[ruc] — route contract tests (REQ-02
 * task 4.1): the per-client audit history endpoint. 400 for a key
 * that is not an 8–11 digit RUC/DNI, 200 with the attempts array
 * (empty = valid "no sends yet" state, NOT 404 — no server-side
 * client master exists to 404 against), 500 when the repository
 * fails. Protected via the `/api/cobranza/historial` RUTAS_PROTEGIDAS
 * entry (proxy-level, tested in routes.cobranza-historial.test.ts).
 */

import { __setCobranzaHistorialForTests } from '@/features/cobranza/infrastructure/getCobranzaHistorialDb';

import { GET } from '../route';

function makeEnvio(
  overrides: Partial<CobranzaEnvioHistorial> = {},
): CobranzaEnvioHistorial {
  return {
    id: 1,
    ruc: '20123456789',
    razonSocial: 'EMPRESA SAC',
    destinatarios: ['cobranza@empresa.com'],
    copias: ['gerencia@empresa.com'],
    asunto: 'Estado de cuenta',
    montoReclamado: 1500.5,
    moneda: 'S/',
    comprobantesCount: 3,
    estadoEnvio: 'SUCCESS',
    errorDetalle: null,
    enviadoPor: 'Dra. House',
    fechaEnvio: '2026-08-21T18:30:00.000Z',
    ...overrides,
  };
}

function makeMockRepo(
  repo: Partial<ICobranzaEnviosHistorialRepository> = {},
): ICobranzaEnviosHistorialRepository {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    getByRuc: vi.fn().mockResolvedValue([]),
    ...repo,
  };
}

function callGet(ruc: string): Promise<Response> {
  return GET({ url: `http://localhost:3001/api/cobranza/historial/${ruc}` } as Request, {
    params: Promise.resolve({ ruc }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  __setCobranzaHistorialForTests(makeMockRepo());
});

afterEach(() => {
  __setCobranzaHistorialForTests(null);
});

describe('GET /api/cobranza/historial/[ruc]', () => {
  it('returns 200 with the attempts array for a valid key, most-recent-first from the repo', async () => {
    const envios = [
      makeEnvio({ id: 2, estadoEnvio: 'FAILED', errorDetalle: 'SMTP timeout' }),
      makeEnvio({ id: 1, fechaEnvio: '2026-08-20T10:00:00.000Z' }),
    ];
    const getByRuc = vi.fn().mockResolvedValue(envios);
    __setCobranzaHistorialForTests(makeMockRepo({ getByRuc }));

    const response = await callGet('20123456789');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.envios).toEqual(envios);
    expect(getByRuc).toHaveBeenCalledWith('20123456789');
  });

  it('returns rows without the cuerpoResumen LOB column (read model stays light)', async () => {
    __setCobranzaHistorialForTests(
      makeMockRepo({ getByRuc: vi.fn().mockResolvedValue([makeEnvio()]) }),
    );

    const response = await callGet('20123456789');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.envios).toHaveLength(1);
    expect(Object.keys(body.envios[0])).not.toContain('cuerpoResumen');
  });

  it('trims the path key before validating and querying', async () => {
    const getByRuc = vi.fn().mockResolvedValue([]);
    __setCobranzaHistorialForTests(makeMockRepo({ getByRuc }));

    // Next decodes the path segment before the route sees it — the
    // raw param arrives with literal whitespace.
    const response = await callGet(' 20123456789 ');
    await response.json();

    // The route receives the RAW param; trimming is its job.
    expect(getByRuc).toHaveBeenCalledWith('20123456789');
  });

  it('returns 200 with an empty array for a valid key with no attempts (NOT 404)', async () => {
    const response = await callGet('99999999999');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.envios).toEqual([]);
  });

  it.each(['123', '123456789012', 'abcdefghijk', '20123456A89', '  '])(
    'returns 400 VALIDATION_ERROR for invalid ruc %j and never queries the repo',
    async (ruc) => {
      const getByRuc = vi.fn().mockResolvedValue([]);
      __setCobranzaHistorialForTests(makeMockRepo({ getByRuc }));

      const response = await callGet(ruc);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.error).toContain('ruc');
      expect(getByRuc).not.toHaveBeenCalled();
    },
  );

  it('returns 500 INTERNAL_ERROR (typed JSON) when the repository fails', async () => {
    __setCobranzaHistorialForTests(
      makeMockRepo({ getByRuc: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }),
    );

    const response = await callGet('20123456789');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
