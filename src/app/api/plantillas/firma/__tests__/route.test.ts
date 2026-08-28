import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextResponse } from 'next/server';

import type { FirmaCorreo } from '@/features/firma-correo/domain/entities';
import type { IFirmaRepository } from '@/features/firma-correo/domain/ports';

/**
 * API contract tests for `/api/plantillas/firma` (PR2 task 2.4).
 *
 * Auth is the two-layer model: the proxy protects the path (TM1/TM2
 * route-table tests live in the auth domain suite) AND the route
 * re-checks `getSession()` in-route (defense-in-depth, /api/usuarios
 * precedent). Threat-matrix cases covered here:
 *  - TM1 unauthenticated in-route → 401 JSON (never a redirect — this
 *    is an API surface).
 *  - TM2 session WITHOUT `firma_correo` → 403 JSON.
 *  - TM4 own-row-only: `ownerId` is ALWAYS `session.sub`; no request
 *    shape can address another user's row (a client-supplied `ownerId`
 *    is not part of the body guard and is never forwarded).
 *  - TM5 a PUT body carrying `firma`/`firmaHtml` → rejected with 400;
 *    there is NO client-supplied signature-HTML surface (composition
 *    happens SERVER-SIDE via the pure composer).
 *
 * The storage port is injected through the real factory's
 * `__setFirmaDbForTests` seam; `getSession` is mocked at the module
 * boundary.
 */

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({
  getSession: mockGetSession,
  COOKIE_NAME: 'token',
}));

import { __setFirmaDbForTests } from '@/features/firma-correo/infrastructure/getFirmaDb';
import { GET, PUT } from '../route';

const SESSION = {
  sub: 'user-owner-1',
  nombre: 'Juana Pérez',
  area: 'Dermatología',
  permisos: ['firma_correo'],
};

function makeFirma(overrides: Partial<FirmaCorreo> = {}): FirmaCorreo {
  return {
    nombre: 'Dra. Juana Pérez',
    area: 'Dermatología',
    correo: 'juana.perez@holomedic.pe',
    telefono: '',
    anexo: '',
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<IFirmaRepository> = {}): IFirmaRepository {
  return {
    getOwnFirma: vi.fn().mockResolvedValue(null),
    saveOwnFirma: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function getJson(res: NextResponse): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function putRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/plantillas/firma', {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('/api/plantillas/firma — auth guard (in-route defense-in-depth)', () => {
  let repo: IFirmaRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = fakeRepo();
    __setFirmaDbForTests(repo);
  });

  afterEach(() => {
    __setFirmaDbForTests(null);
  });

  it('TM1 — unauthenticated GET → 401 JSON (no redirect)', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    const body = await getJson(res);
    expect(body).toMatchObject({ success: false });
    expect(String(body.error)).toContain('autenticado');
  });

  it('TM1 — unauthenticated PUT → 401 JSON', async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await PUT(putRequest({ nombre: 'X', area: 'Y', correo: 'z@z.pe' }));

    expect(res.status).toBe(401);
    expect(await getJson(res)).toMatchObject({ success: false });
  });

  it('TM2 — session WITHOUT firma_correo → 403 JSON on GET and PUT', async () => {
    mockGetSession.mockResolvedValue({ ...SESSION, permisos: ['consolidados'] });

    const getRes = await GET();
    expect(getRes.status).toBe(403);
    expect(await getJson(getRes)).toMatchObject({ success: false });

    const putRes = await PUT(putRequest({ nombre: 'X', area: 'Y', correo: 'z@z.pe' }));
    expect(putRes.status).toBe(403);
    expect(await getJson(putRes)).toMatchObject({ success: false });
    expect(repo.saveOwnFirma).not.toHaveBeenCalled();
  });
});

describe('/api/plantillas/firma — GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION);
  });

  afterEach(() => {
    __setFirmaDbForTests(null);
  });

  it('returns the stored firma with its SERVER-COMPOSED firmaHtml', async () => {
    const firma = makeFirma();
    __setFirmaDbForTests(fakeRepo({ getOwnFirma: vi.fn().mockResolvedValue(firma) }));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toMatchObject({ success: true, firma });
    const html = body.firmaHtml as string;
    expect(html).toContain('Dra. Juana Pérez');
    // Redesigned composer: correo as plain text (no mailto) + logo cid +
    // FIXED company contact data.
    expect(html).toContain('juana.perez@holomedic.pe');
    expect(html).not.toContain('mailto:');
    expect(html).toContain('cid:holomedic-logo');
    expect(html).toContain('Telef. 480-0217');
  });

  it('returns firmaHtml as an EMPTY string when no signature exists (no fallback here)', async () => {
    __setFirmaDbForTests(fakeRepo({ getOwnFirma: vi.fn().mockResolvedValue(null) }));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toMatchObject({ success: true, firma: null, firmaHtml: '' });
  });

  it('TM4 — reads ONLY the session user’s row (ownerId = session.sub)', async () => {
    const repo = fakeRepo();
    __setFirmaDbForTests(repo);

    await GET();

    expect(repo.getOwnFirma).toHaveBeenCalledTimes(1);
    expect(repo.getOwnFirma).toHaveBeenCalledWith('user-owner-1');
  });

  it('escapes stored values at composition (no raw markup leaves the server)', async () => {
    const firma = makeFirma({ nombre: '<b>X</b>' });
    __setFirmaDbForTests(fakeRepo({ getOwnFirma: vi.fn().mockResolvedValue(firma) }));

    const res = await GET();

    const body = await getJson(res);
    const html = body.firmaHtml as string;
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(html).not.toContain('<b>X</b>');
  });

  it('maps storage failures to 500 INTERNAL_ERROR JSON', async () => {
    __setFirmaDbForTests(
      fakeRepo({ getOwnFirma: vi.fn().mockRejectedValue(new Error('db down')) }),
    );

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await getJson(res);
    expect(body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
  });
});

describe('/api/plantillas/firma — PUT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(SESSION);
  });

  afterEach(() => {
    __setFirmaDbForTests(null);
  });

  it('persists a valid body and answers with the fresh firma + composed html', async () => {
    const repo = fakeRepo();
    __setFirmaDbForTests(repo);

    const res = await PUT(
      putRequest({
        nombre: '  Juana Pérez  ',
        area: 'Dermatología',
        correo: 'juana.perez@holomedic.pe',
      }),
    );

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toMatchObject({ success: true });
    const firma = body.firma as FirmaCorreo;
    // The persisted values are the VALIDATED + TRIMMED ones.
    expect(firma).toMatchObject({
      nombre: 'Juana Pérez',
      area: 'Dermatología',
      correo: 'juana.perez@holomedic.pe',
      telefono: '',
      anexo: '',
    });
    expect(body.firmaHtml).toContain('Juana Pérez');
    expect(repo.saveOwnFirma).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid bodies with 400 + per-field errors and does NOT persist', async () => {
    const repo = fakeRepo();
    __setFirmaDbForTests(repo);

    const res = await PUT(putRequest({ nombre: 'A', area: '', correo: 'no-es-correo' }));

    expect(res.status).toBe(400);
    const body = await getJson(res);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    const fields = body.fields as Record<string, string>;
    expect(Object.keys(fields).sort()).toEqual(['area', 'correo', 'nombre']);
    expect(repo.saveOwnFirma).not.toHaveBeenCalled();
  });

  it('accepts optional fields omitted (telefono/anexo default empty)', async () => {
    const repo = fakeRepo();
    __setFirmaDbForTests(repo);

    const res = await PUT(
      putRequest({ nombre: 'Juana Pérez', area: 'Dermatología', correo: 'juana@holomedic.pe' }),
    );

    expect(res.status).toBe(200);
    expect(repo.saveOwnFirma).toHaveBeenCalledTimes(1);
  });

  it('TM5 — a body carrying firma/firmaHtml is REJECTED (no client HTML surface)', async () => {
    const repo = fakeRepo();
    __setFirmaDbForTests(repo);

    const res = await PUT(
      putRequest({
        nombre: 'Juana Pérez',
        area: 'Dermatología',
        correo: 'juana@holomedic.pe',
        firma: '<img src=x onerror=alert(1)>',
      }),
    );

    expect(res.status).toBe(400);
    const body = await getJson(res);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(repo.saveOwnFirma).not.toHaveBeenCalled();
  });

  it('TM5 — a body carrying firmaHtml is REJECTED too', async () => {
    const repo = fakeRepo();
    __setFirmaDbForTests(repo);

    const res = await PUT(
      putRequest({
        nombre: 'Juana Pérez',
        area: 'Dermatología',
        correo: 'juana@holomedic.pe',
        firmaHtml: '<table></table>',
      }),
    );

    expect(res.status).toBe(400);
    expect(repo.saveOwnFirma).not.toHaveBeenCalled();
  });

  it('TM4 — a client-supplied ownerId is ignored; the row owner is always session.sub', async () => {
    const repo = fakeRepo();
    __setFirmaDbForTests(repo);

    const res = await PUT(
      putRequest({
        nombre: 'Juana Pérez',
        area: 'Dermatología',
        correo: 'juana@holomedic.pe',
        ownerId: 'victim-user',
      }),
    );

    expect(res.status).toBe(200);
    expect(repo.saveOwnFirma).toHaveBeenCalledWith('user-owner-1', expect.anything());
  });

  it('malformed JSON → 400 VALIDATION_ERROR', async () => {
    const res = await PUT(
      new Request('http://localhost:3000/api/plantillas/firma', {
        method: 'PUT',
        body: '{not json',
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(400);
    const body = await getJson(res);
    expect(body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
  });

  it('non-object bodies (array/string/null) → 400 VALIDATION_ERROR', async () => {
    for (const bad of ['just a string', ['array'], 42, null]) {
      const res = await PUT(putRequest(bad));
      expect(res.status).toBe(400);
    }
  });

  it('maps storage failures to 500 INTERNAL_ERROR JSON', async () => {
    __setFirmaDbForTests(
      fakeRepo({ saveOwnFirma: vi.fn().mockRejectedValue(new Error('db down')) }),
    );

    const res = await PUT(
      putRequest({ nombre: 'Juana Pérez', area: 'Dermatología', correo: 'juana@holomedic.pe' }),
    );

    expect(res.status).toBe(500);
    const body = await getJson(res);
    expect(body).toMatchObject({ success: false, code: 'INTERNAL_ERROR' });
  });
});
