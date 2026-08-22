/**
 * Tests for `useCompanyContact(ruc, razonSocial)` (REQ-01 T2.1/T4.3).
 *
 * Spec: REQ-01-DIR-01 (junk key not memorized, send never blocked),
 * REQ-01-DIR-03 (modal prefill source). Design D10: the shared
 * `esClaveDirectorioValida` guard runs CLIENT-side so junk keys skip
 * the GET entirely (status 'skipped', zero fetches).
 *
 * Mocking strategy: `fetch` is mocked at the global boundary — the
 * API route is the hook's only dependency (useSpitches precedent).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCompanyContact } from '../useCompanyContact';
import type { EmpresaContacto } from '../../../domain/entities';

const SAMPLE_CONTACTO: EmpresaContacto = {
  ruc: '20601234567',
  razonSocial: 'HOLOMEDIC S.A.C.',
  emailPrincipal: 'contacto@empresa.com',
  emailCopia: 'gerencia@empresa.com',
  updatedAt: '2026-08-01T10:00:00.000Z',
  updatedBy: 'María Pérez',
};

function res(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('useCompanyContact', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports loading then populated on a 200 with a stored contact (spec: prefill source)', async () => {
    fetchMock.mockResolvedValue(res({ success: true, contacto: SAMPLE_CONTACTO }));

    const { result } = renderHook(() => useCompanyContact('20601234567', 'HOLOMEDIC S.A.C.'));

    expect(result.current.status).toBe('loading');
    expect(result.current.contacto).toBeNull();

    await waitFor(() => {
      expect(result.current.status).toBe('populated');
    });
    expect(result.current.contacto).toEqual(SAMPLE_CONTACTO);
    expect(result.current.error).toBeNull();
  });

  it('skips the fetch entirely for a junk key (CLIENTE SIN NOMBRE) — status "skipped"', async () => {
    const { result } = renderHook(() => useCompanyContact('20601234567', 'CLIENTE SIN NOMBRE'));

    await waitFor(() => {
      expect(result.current.status).toBe('skipped');
    });
    expect(result.current.contacto).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips the fetch entirely for a malformed ruc — status "skipped"', async () => {
    const { result } = renderHook(() => useCompanyContact('ABC-123', 'EMPRESA SAC'));

    await waitFor(() => {
      expect(result.current.status).toBe('skipped');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GETs /api/cobranza/contactos?ruc= with the trimmed key', async () => {
    fetchMock.mockResolvedValue(res({ success: true, contacto: null }));

    renderHook(() => useCompanyContact(' 20601234567 ', 'HOLOMEDIC S.A.C.'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/cobranza/contactos?ruc=20601234567');
    expect(init?.method).toBe('GET');
  });

  it('reports empty on a 200 with contacto null (no stored record)', async () => {
    fetchMock.mockResolvedValue(res({ success: true, contacto: null }));

    const { result } = renderHook(() => useCompanyContact('20601234567', 'HOLOMEDIC S.A.C.'));

    await waitFor(() => {
      expect(result.current.status).toBe('empty');
    });
    expect(result.current.contacto).toBeNull();
  });

  it('reports error with the API message on a non-OK response, and retry recovers', async () => {
    fetchMock.mockResolvedValue(res({ success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' }, false, 500));

    const { result } = renderHook(() => useCompanyContact('20601234567', 'HOLOMEDIC S.A.C.'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('INTERNAL_ERROR');
    expect(result.current.contacto).toBeNull();

    fetchMock.mockResolvedValue(res({ success: true, contacto: SAMPLE_CONTACTO }));

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.status).toBe('populated');
    });
    expect(result.current.contacto).toEqual(SAMPLE_CONTACTO);
  });

  it('reports error on a network failure (fetch rejects)', async () => {
    fetchMock.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useCompanyContact('20601234567', 'HOLOMEDIC S.A.C.'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('Network down');
  });

  it('reports error when the response body has an unexpected shape', async () => {
    fetchMock.mockResolvedValue(res({ data: 'unexpected' }));

    const { result } = renderHook(() => useCompanyContact('20601234567', 'HOLOMEDIC S.A.C.'));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toMatch(/inesperada|unexpected/i);
  });

  it('retry does nothing while the key is junk (no fetch, stays skipped)', async () => {
    const { result } = renderHook(() => useCompanyContact('20601234567', 'CLIENTE SIN NOMBRE'));

    await waitFor(() => {
      expect(result.current.status).toBe('skipped');
    });

    act(() => {
      result.current.retry();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('skipped');
  });

  it('re-fetches when the key changes (valid → valid)', async () => {
    fetchMock.mockResolvedValue(res({ success: true, contacto: SAMPLE_CONTACTO }));

    const { rerender } = renderHook(
      ({ ruc, razonSocial }: { ruc: string; razonSocial: string }) =>
        useCompanyContact(ruc, razonSocial),
      { initialProps: { ruc: '20601234567', razonSocial: 'HOLOMEDIC S.A.C.' } },
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    rerender({ ruc: '10444555666', razonSocial: 'JUAN PEREZ S.A.' });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const secondUrl = fetchMock.mock.calls[1]?.[0] as string;
    expect(secondUrl).toBe('/api/cobranza/contactos?ruc=10444555666');
  });

  it('saveContact PUTs the payload and returns the persisted contact', async () => {
    fetchMock.mockResolvedValue(res({ success: true, contacto: SAMPLE_CONTACTO }));

    const { result } = renderHook(() => useCompanyContact('20601234567', 'HOLOMEDIC S.A.C.'));
    await waitFor(() => {
      expect(result.current.status).toBe('populated');
    });

    let saved: EmpresaContacto | null = null;
    await act(async () => {
      saved = await result.current.saveContact({
        ruc: '20601234567',
        razonSocial: 'HOLOMEDIC S.A.C.',
        emailPrincipal: 'nuevo@empresa.com',
        emailCopia: 'cc@empresa.com, cc2@empresa.com',
      });
    });

    expect(saved).toEqual(SAMPLE_CONTACTO);
    const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
    expect(url).toBe('/api/cobranza/contactos');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init?.body as string)).toEqual({
      ruc: '20601234567',
      razonSocial: 'HOLOMEDIC S.A.C.',
      emailPrincipal: 'nuevo@empresa.com',
      emailCopia: 'cc@empresa.com, cc2@empresa.com',
    });
  });

  it('saveContact throws with the API error message when the PUT fails', async () => {
    // GET succeeds (contact already stored); the subsequent PUT fails.
    fetchMock
      .mockResolvedValueOnce(res({ success: true, contacto: SAMPLE_CONTACTO }))
      .mockResolvedValue(res({ success: false, error: 'CONFLICT', code: 'CONFLICT_ERROR' }, false, 409));

    const { result } = renderHook(() => useCompanyContact('20601234567', 'HOLOMEDIC S.A.C.'));
    await waitFor(() => {
      expect(result.current.status).toBe('populated');
    });

    await expect(
      act(async () => {
        await result.current.saveContact({
          ruc: '20601234567',
          razonSocial: 'HOLOMEDIC S.A.C.',
          emailPrincipal: 'nuevo@empresa.com',
          emailCopia: null,
        });
      }),
    ).rejects.toThrow('CONFLICT');
  });
});
