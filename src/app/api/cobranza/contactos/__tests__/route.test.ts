import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __setContactDbForTests } from '@/features/cobranza/infrastructure/getContactDb';
import { ContactConflictError } from '@/features/cobranza/infrastructure/sqlserver';
import type { ICompanyContactRepository } from '@/features/cobranza/domain/ports';
import type { EmpresaContacto, SaveContactInput } from '@/features/cobranza/domain/entities';

// ---- Mock the auth session (OQ1/D1: updatedBy = session.nombre) ----

const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
}));

// ---- Import under test (after mocks) ----

import { GET, PUT } from '../route';

// ---- Helpers ----

function makeContacto(overrides: Partial<EmpresaContacto> = {}): EmpresaContacto {
  return {
    ruc: '20123456789',
    razonSocial: 'EMPRESA SAC',
    emailPrincipal: 'contacto@empresa.com',
    emailCopia: 'gerencia@empresa.com',
    updatedAt: '2026-08-21T12:00:00.000Z',
    updatedBy: 'Dra. House',
    ...overrides,
  };
}

function makeMockRepo(repo: Partial<ICompanyContactRepository> = {}): ICompanyContactRepository {
  return {
    getByRuc: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(makeContacto()),
    ...repo,
  };
}

function makeGetRequest(query: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/cobranza/contactos');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePutRequest(body: unknown): Request {
  return new Request('http://localhost/api/cobranza/contactos', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  ruc: '20123456789',
  razonSocial: 'EMPRESA SAC',
  emailPrincipal: 'contacto@empresa.com',
  emailCopia: 'gerencia@empresa.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ nombre: 'Dra. House', permisos: ['cobranza'] });
  __setContactDbForTests(makeMockRepo());
});

afterEach(() => {
  __setContactDbForTests(null);
});

describe('GET /api/cobranza/contactos', () => {
  it('returns 200 with the stored contacto for a known key', async () => {
    const stored = makeContacto();
    const getByRuc = vi.fn().mockResolvedValue(stored);
    __setContactDbForTests(makeMockRepo({ getByRuc }));

    const response = await GET(makeGetRequest({ ruc: '20123456789' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.contacto).toEqual(stored);
    expect(getByRuc).toHaveBeenCalledWith('20123456789');
  });

  it('returns 200 with contacto null for an unknown key (empty-prefill state)', async () => {
    const response = await GET(makeGetRequest({ ruc: '99999999999' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.contacto).toBeNull();
  });

  it.each(['', '1234567', '123456789012', 'abcdefghijk', '20123456A89'])(
    'returns 400 VALIDATION_ERROR for invalid ruc %j',
    async (ruc) => {
      const response = await GET(makeGetRequest(ruc ? { ruc } : {}));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.error).toContain('ruc');
    },
  );

  it('returns 500 INTERNAL_ERROR (typed JSON) when the repository fails', async () => {
    const getByRuc = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    __setContactDbForTests(makeMockRepo({ getByRuc }));

    const response = await GET(makeGetRequest({ ruc: '20123456789' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});

describe('PUT /api/cobranza/contactos', () => {
  it('returns 200 with the persisted contacto and resolves updatedBy from the session nombre (trimmed)', async () => {
    const saved = makeContacto();
    const upsert = vi.fn().mockResolvedValue(saved);
    mockGetSession.mockResolvedValue({ nombre: '  Dra. House  ', permisos: ['cobranza'] });
    __setContactDbForTests(makeMockRepo({ upsert }));

    const response = await PUT(makePutRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.contacto).toEqual(saved);
    const input = upsert.mock.calls[0]?.[0] as SaveContactInput;
    expect(input.updatedBy).toBe('Dra. House');
  });

  it('falls back to updatedBy "sistema" when the session is absent (defensive)', async () => {
    mockGetSession.mockResolvedValue(null);
    const upsert = vi.fn().mockResolvedValue(makeContacto());
    __setContactDbForTests(makeMockRepo({ upsert }));

    const response = await PUT(makePutRequest(VALID_BODY));

    expect(response.status).toBe(200);
    const input = upsert.mock.calls[0]?.[0] as SaveContactInput;
    expect(input.updatedBy).toBe('sistema');
  });

  it('normalizes emailCopia: empty string becomes null, absent becomes null', async () => {
    const upsert = vi.fn().mockResolvedValue(makeContacto());
    __setContactDbForTests(makeMockRepo({ upsert }));

    const response = await PUT(makePutRequest({ ...VALID_BODY, emailCopia: '' }));
    expect(response.status).toBe(200);
    let input = upsert.mock.calls[0]?.[0] as SaveContactInput;
    expect(input.emailCopia).toBeNull();

    const { emailCopia: _omitted, ...withoutCopia } = VALID_BODY;
    void _omitted;
    await PUT(makePutRequest(withoutCopia));
    input = upsert.mock.calls[1]?.[0] as SaveContactInput;
    expect(input.emailCopia).toBeNull();
  });

  it('returns 400 VALIDATION_ERROR for a malformed JSON body', async () => {
    const response = await PUT(makePutRequest('{not json'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['missing ruc', { ...VALID_BODY, ruc: undefined }],
    ['missing razonSocial', { ...VALID_BODY, razonSocial: undefined }],
    ['missing emailPrincipal', { ...VALID_BODY, emailPrincipal: undefined }],
    ['non-string ruc', { ...VALID_BODY, ruc: 20123456789 }],
    ['non-string emailCopia', { ...VALID_BODY, emailCopia: 42 }],
    ['array body', ['nope']],
  ])('returns 400 VALIDATION_ERROR for %s', async (_label, badBody) => {
    const response = await PUT(makePutRequest(badBody));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it.each(['1234567', '123456789012', 'abcdefghijk'])(
    'returns 400 VALIDATION_ERROR for invalid ruc %j',
    async (ruc) => {
      const response = await PUT(makePutRequest({ ...VALID_BODY, ruc }));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.error).toContain('ruc');
    },
  );

  it('returns 400 VALIDATION_ERROR when esClaveDirectorioValida rejects the junk razonSocial', async () => {
    const response = await PUT(
      makePutRequest({ ...VALID_BODY, razonSocial: '  CLIENTE SIN NOMBRE  ' }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('CLIENTE SIN NOMBRE');
  });

  it.each([
    ['malformed emailPrincipal', { ...VALID_BODY, emailPrincipal: 'not-an-email' }],
    ['empty emailPrincipal', { ...VALID_BODY, emailPrincipal: '' }],
    ['malformed emailCopia', { ...VALID_BODY, emailCopia: 'nope' }],
  ])('returns 400 VALIDATION_ERROR for %s', async (_label, badBody) => {
    const response = await PUT(makePutRequest(badBody));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 CONFLICT_ERROR when the upsert hits a unique violation race', async () => {
    const upsert = vi.fn().mockRejectedValue(new ContactConflictError());
    __setContactDbForTests(makeMockRepo({ upsert }));

    const response = await PUT(makePutRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.code).toBe('CONFLICT_ERROR');
  });

  it('returns 500 INTERNAL_ERROR (typed JSON) when the repository fails', async () => {
    const upsert = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    __setContactDbForTests(makeMockRepo({ upsert }));

    const response = await PUT(makePutRequest(VALID_BODY));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
