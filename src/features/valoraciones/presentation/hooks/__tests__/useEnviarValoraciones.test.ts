import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useEnviarValoraciones } from '../useEnviarValoraciones';
import type { ValoracionesFilter } from '../../../domain/entities';

/**
 * useEnviarValoraciones (REQ-03 M-R3/M-R4) — recipient prefill via
 * `/api/valoraciones/contactos` (RUC-keyed REQ-01 lookup by codCli) and
 * the dispatch action against `/api/valoraciones/send` (FormData with
 * regenerated PDF/Excel attachment flags). `fetch` mocked at the network
 * boundary (useCompanyContact / useSpitches precedent).
 */

const filtro: ValoracionesFilter = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
};

const CONTACTO = {
  ruc: '20123456789',
  razonSocial: 'EMPRESA DEMO S.A.C.',
  emailPrincipal: 'facturas@demo.com.pe',
  emailCopia: 'cc@demo.com.pe',
  updatedAt: '2026-01-15T10:00:00.000Z',
  updatedBy: 'ops',
};

function mockFetchOnce(url: string, status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    if (String(input).includes(url)) {
      return Promise.resolve(
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
      );
    }
    return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('useEnviarValoraciones — prefill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('codCli defined + directory hit → populated with the contact and RUC', async () => {
    mockFetchOnce('/api/valoraciones/contactos', 200, {
      success: true,
      nroRuc: '20123456789',
      contacto: CONTACTO,
    });
    const { result } = renderHookWithConfig(55);

    await waitFor(() => expect(result.current.prefillStatus).toBe('populated'));
    expect(result.current.contacto).toEqual(CONTACTO);
    expect(result.current.nroRuc).toBe('20123456789');
    expect(result.current.prefillError).toBeNull();
  });

  it('codCli defined + directory miss → empty (manual entry), no error', async () => {
    mockFetchOnce('/api/valoraciones/contactos', 200, {
      success: true,
      nroRuc: '20123456789',
      contacto: null,
    });
    const { result } = renderHookWithConfig(55);

    await waitFor(() => expect(result.current.prefillStatus).toBe('empty'));
    expect(result.current.contacto).toBeNull();
  });

  it('no codCli (particular / clientless) → skipped, zero network calls', async () => {
    const fetchMock = mockFetchOnce('/api/valoraciones/contactos', 200, {});
    const { result } = renderHookWithConfig(undefined);

    expect(result.current.prefillStatus).toBe('skipped');
    expect(result.current.contacto).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('non-OK response → error with the API message and retry re-fetches', async () => {
    mockFetchOnce('/api/valoraciones/contactos', 500, {
      success: false,
      error: 'Error al consultar los contactos. Intente nuevamente.',
      code: 'INTERNAL_ERROR',
    });
    const { result } = renderHookWithConfig(55);

    await waitFor(() => expect(result.current.prefillStatus).toBe('error'));
    expect(result.current.prefillError).toBe('Error al consultar los contactos. Intente nuevamente.');

    mockFetchOnce('/api/valoraciones/contactos', 200, {
      success: true,
      nroRuc: '20123456789',
      contacto: CONTACTO,
    });
    act(() => result.current.retryPrefill());
    await waitFor(() => expect(result.current.prefillStatus).toBe('populated'));
  });
});

describe('useEnviarValoraciones — enviar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs FormData to /api/valoraciones/send with every field and maps success', async () => {
    const fetchMock = mockFetchOnce('/api/valoraciones/send', 200, {
      success: true,
      messageId: '<abc@demo>',
    });
    const { result } = renderHookWithConfig(55);

    let ok = false;
    await act(async () => {
      ok = await result.current.enviar({
        filtro,
        to: 'a@demo.com, b@demo.com',
        cc: 'c@demo.com',
        subject: 'Valorización enero',
        html: '<p>Hola</p>',
        adjuntarPdf: true,
        adjuntarExcel: false,
      });
    });

    expect(ok).toBe(true);
    expect(result.current.envioStatus).toBe('success');

    // The hook with codCli=55 also fires the prefill GET; isolate the
    // send POST by URL.
    const sendCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/valoraciones/send'));
    expect(sendCalls).toHaveLength(1);
    const [url, init] = sendCalls[0] as [string, RequestInit];
    expect(url).toBe('/api/valoraciones/send');
    expect(init.method).toBe('POST');
    const body = init.body as FormData;
    expect(body.get('filtro')).toBe(JSON.stringify(filtro));
    expect(body.get('to')).toBe('a@demo.com, b@demo.com');
    expect(body.get('cc')).toBe('c@demo.com');
    expect(body.get('subject')).toBe('Valorización enero');
    expect(body.get('html')).toBe('<p>Hola</p>');
    expect(body.get('adjuntarPdf')).toBe('true');
    expect(body.get('adjuntarExcel')).toBe('false');
    // No empresa field → global attachments (legacy scope).
    expect(body.get('empresa')).toBeNull();
  });

  it('appends the per-empresa scope when provided so attachments stay row-scoped (U6)', async () => {
    const fetchMock = mockFetchOnce('/api/valoraciones/send', 200, {
      success: true,
      messageId: '<abc@demo>',
    });
    const { result } = renderHookWithConfig(55);

    await act(async () => {
      await result.current.enviar({
        filtro,
        to: 'a@demo.com',
        cc: '',
        subject: 's',
        html: '<p>h</p>',
        adjuntarPdf: true,
        adjuntarExcel: true,
        empresa: 'EMPRESA DEMO S.A.C.',
      });
    });

    const sendCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/valoraciones/send'));
    const body = (sendCalls[0] as [string, RequestInit])[1].body as FormData;
    expect(body.get('empresa')).toBe('EMPRESA DEMO S.A.C.');
  });

  it('maps a non-OK response to envioStatus error with the API message', async () => {
    mockFetchOnce('/api/valoraciones/send', 503, {
      success: false,
      error: 'SMTP connection timed out',
      code: 'SMTP_TIMEOUT',
    });
    const { result } = renderHookWithConfig(55);

    let ok = true;
    await act(async () => {
      ok = await result.current.enviar({
        filtro,
        to: 'a@demo.com',
        cc: '',
        subject: 's',
        html: '<p>h</p>',
        adjuntarPdf: false,
        adjuntarExcel: false,
      });
    });

    expect(ok).toBe(false);
    expect(result.current.envioStatus).toBe('error');
    expect(result.current.envioError).toBe('SMTP connection timed out');
  });

  it('network failure → error with a connection message (never silent)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const { result } = renderHookWithConfig(55);

    let ok = true;
    await act(async () => {
      ok = await result.current.enviar({
        filtro,
        to: 'a@demo.com',
        cc: '',
        subject: 's',
        html: '<p>h</p>',
        adjuntarPdf: false,
        adjuntarExcel: false,
      });
    });

    expect(ok).toBe(false);
    expect(result.current.envioStatus).toBe('error');
    expect(result.current.envioError).toBe('Error de conexión al enviar el correo');
  });
});

// ---- helper ----

function renderHookWithConfig(codCli: number | undefined) {
  return renderHook(() => useEnviarValoraciones(codCli));
}
