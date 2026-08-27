import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ISiglaValoracionesRepository } from '@/features/valoraciones/domain/ports';
import type { ICompanyContactRepository } from '@/features/cobranza/domain/ports';

/**
 * GET /api/valoraciones/contactos (REQ-03 M-R3, design D5) — thin prefill
 * endpoint under the `/api/valoraciones` prefix (the proxy enforces one
 * permiso per route; valoraciones operators cannot ride
 * `/api/cobranza/contactos`). Resolves `Cliente.NroRuc` by `codCli`
 * (`buscarClientePorCodigo`) and passes it through to the REQ-01 contact
 * directory (`getContactDb().getByRuc()`).
 *
 * Repositories injected through their test seams — no SQL, no pool.
 */

const CONTACTO = {
  ruc: '20123456789',
  razonSocial: 'EMPRESA DEMO S.A.C.',
  emailPrincipal: 'facturas@demo.com.pe',
  emailCopia: 'cc@demo.com.pe',
  updatedAt: '2026-01-15T10:00:00.000Z',
  updatedBy: 'ops',
};

const request = (query: string): Request =>
  new Request(`http://localhost/api/valoraciones/contactos${query}`);

describe('GET /api/valoraciones/contactos', () => {
  let buscarClientePorCodigo: ReturnType<typeof vi.fn>;
  let getByRuc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { __setValoracionesDbForTests } = await import(
      '@/features/valoraciones/infrastructure/getValoracionesDb'
    );
    const { __setContactDbForTests } = await import(
      '@/features/cobranza/infrastructure/getContactDb'
    );

    buscarClientePorCodigo = vi
      .fn()
      .mockResolvedValue({ codCli: 123, nomCom: 'EMPRESA DEMO S.A.C.', nroRuc: '20123456789' });
    getByRuc = vi.fn().mockResolvedValue(CONTACTO);

    __setValoracionesDbForTests({
      buscarClientePorCodigo,
    } as unknown as ISiglaValoracionesRepository);
    __setContactDbForTests({ getByRuc } as unknown as ICompanyContactRepository);
  });

  it('passes the RUC from buscarClientePorCodigo through to getByRuc (RUC passthrough)', async () => {
    const { GET } = await import('../route');
    const res = await GET(request('?codCli=123'));
    expect(res.status).toBe(200);

    expect(buscarClientePorCodigo).toHaveBeenCalledWith(123);
    expect(getByRuc).toHaveBeenCalledWith('20123456789');

    const json = (await res.json()) as {
      success: boolean;
      nroRuc: string | null;
      contacto: typeof CONTACTO | null;
    };
    expect(json.success).toBe(true);
    expect(json.nroRuc).toBe('20123456789');
    expect(json.contacto).toEqual(CONTACTO);
  });

  it('returns 200 with contacto null when the directory misses (empty on miss)', async () => {
    getByRuc.mockResolvedValue(null);
    const { GET } = await import('../route');
    const res = await GET(request('?codCli=123'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.nroRuc).toBe('20123456789');
    expect(json.contacto).toBeNull();
  });

  it('DNI-keyed particular (client without RUC) → nroRuc null, contacto null, no directory call', async () => {
    buscarClientePorCodigo.mockResolvedValue({
      codCli: 456,
      nomCom: 'JUAN PEREZ',
      nroRuc: null,
    });
    const { GET } = await import('../route');
    const res = await GET(request('?codCli=456'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.nroRuc).toBeNull();
    expect(json.contacto).toBeNull();
    expect(getByRuc).not.toHaveBeenCalled();
  });

  it('unknown client code → 200 with nroRuc/contacto null', async () => {
    buscarClientePorCodigo.mockResolvedValue(null);
    const { GET } = await import('../route');
    const res = await GET(request('?codCli=999'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, nroRuc: null, contacto: null });
    expect(getByRuc).not.toHaveBeenCalled();
  });

  it('junk NroRuc (not 8-11 digits) skips the directory lookup', async () => {
    buscarClientePorCodigo.mockResolvedValue({ codCli: 123, nomCom: 'X', nroRuc: 'ABC-123' });
    const { GET } = await import('../route');
    const res = await GET(request('?codCli=123'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.nroRuc).toBeNull();
    expect(json.contacto).toBeNull();
    expect(getByRuc).not.toHaveBeenCalled();
  });

  it.each([
    ['missing codCli', ''],
    ['non-numeric codCli', '?codCli=abc'],
    ['zero codCli', '?codCli=0'],
    ['negative codCli', '?codCli=-5'],
  ])('400 VALIDATION_ERROR on %s', async (_label, query) => {
    const { GET } = await import('../route');
    const res = await GET(request(query));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; code: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(buscarClientePorCodigo).not.toHaveBeenCalled();
  });

  it('repository failure → 500 INTERNAL_ERROR with a user-safe message (no internals)', async () => {
    buscarClientePorCodigo.mockRejectedValue(
      new Error('Connection timeout to 172.16.10.14 for user sa'),
    );
    const { GET } = await import('../route');
    const res = await GET(request('?codCli=123'));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { success: boolean; code: string; error: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('INTERNAL_ERROR');
    // User-safe: no hostnames, credentials or driver details leak.
    expect(json.error).not.toContain('172.16.10.14');
    expect(json.error).not.toContain('sa');
  });
});
