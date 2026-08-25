/**
 * Tests for `useSendCobranzaEmail` (envio-correos-facturacion Unit 2, task 2.1).
 *
 * Spec (cobranza-envio MODIFIED):
 *  - "Send semantics preserved": purpose 'cobranza', contacts persist
 *    before dispatch (REQ-01-DIR-07 persist-before-dispatch).
 *  - "Cobranza Attachments and Route": the composer dispatches FormData
 *    (fields + repeated `attachments` File parts). Unit 3 makes the ROUTE
 *    accept it; this hook defines the client side of that contract.
 *
 * Mocking strategy: `fetch` stubbed at the global boundary; the
 * directory port is injected as a fake (design "Send logic placement" —
 * injection keeps the hook unit-testable, DIR-07 abort semantics
 * preserved without a real useCompanyContact mount).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSendCobranzaEmail } from '../useSendCobranzaEmail';
import type { CobranzaDirectoryPort, SendCobranzaEmailInput } from '../useSendCobranzaEmail';
import type { CobranzaAuditMetadata } from '../../helpers/buildCobranzaAuditMetadata';

const AUDIT_META: CobranzaAuditMetadata = {
  ruc: '20601234567',
  razonSocial: 'HOLOMEDIC S.A.C.',
  moneda: 'S/',
  montoReclamado: 1000,
  comprobantesCount: 1,
};

const EMPTY_DEBT_META: CobranzaAuditMetadata = {
  ruc: '20111222333',
  razonSocial: 'CLINICA SANTA MARIA S.A.',
  moneda: null,
  montoReclamado: null,
  comprobantesCount: 0,
};

function makeFile(name: string, size = 64): File {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

function baseInput(overrides: Partial<SendCobranzaEmailInput> = {}): SendCobranzaEmailInput {
  return {
    to: ['cobranzas@cliente.com'],
    subject: 'Recordatorio de pago',
    html: '<p>Estimados,</p>',
    attachments: [],
    auditMeta: AUDIT_META,
    ...overrides,
  };
}

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

function postBodyOf(fetchMock: ReturnType<typeof vi.fn>): FormData {
  const lastPost = fetchMock.mock.calls
    .filter(([url, init]) => String(url) === '/api/send-email' && init?.method === 'POST')
    .at(-1);
  return lastPost?.[1]?.body as FormData;
}

describe('useSendCobranzaEmail', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---- FormData contract (fields + purpose + audit) ----

  it('POSTs FormData with comma-joined to, subject, html and purpose cobranza', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true }));

    const { result } = renderHook(() => useSendCobranzaEmail());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.send(baseInput());
    });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/send-email');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    const body = postBodyOf(fetchMock);
    expect(body.get('to')).toBe('cobranzas@cliente.com');
    expect(body.get('subject')).toBe('Recordatorio de pago');
    expect(body.get('html')).toBe('<p>Estimados,</p>');
    expect(body.get('purpose')).toBe('cobranza');
    // No manual Content-Type: the browser sets the multipart boundary.
    expect(init?.headers).toBeUndefined();
  });

  it('joins multiple recipients with commas in the to field', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true }));

    const { result } = renderHook(() => useSendCobranzaEmail());
    await act(async () => {
      await result.current.send(baseInput({ to: ['a@x.com', 'b@x.com', 'c@x.com'] }));
    });

    expect(postBodyOf(fetchMock).get('to')).toBe('a@x.com,b@x.com,c@x.com');
  });

  it('omits cc when not provided and joins it when provided', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true }));

    const { result } = renderHook(() => useSendCobranzaEmail());

    await act(async () => {
      await result.current.send(baseInput());
    });
    expect(postBodyOf(fetchMock).get('cc')).toBeNull();

    await act(async () => {
      await result.current.send(baseInput({ cc: ['gerencia@x.com', 'conta@x.com'] }));
    });
    expect(postBodyOf(fetchMock).get('cc')).toBe('gerencia@x.com,conta@x.com');
  });

  it('carries audit metadata fields on the FormData', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true }));

    const { result } = renderHook(() => useSendCobranzaEmail());
    await act(async () => {
      await result.current.send(baseInput());
    });

    const body = postBodyOf(fetchMock);
    expect(body.get('ruc')).toBe('20601234567');
    expect(body.get('razonSocial')).toBe('HOLOMEDIC S.A.C.');
    expect(body.get('moneda')).toBe('S/');
    expect(body.get('montoReclamado')).toBe('1000');
    expect(body.get('comprobantesCount')).toBe('1');
  });

  it('omits null moneda/montoReclamado for an empty-debt client', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true }));

    const { result } = renderHook(() => useSendCobranzaEmail());
    await act(async () => {
      await result.current.send(baseInput({ auditMeta: EMPTY_DEBT_META }));
    });

    const body = postBodyOf(fetchMock);
    expect(body.get('moneda')).toBeNull();
    expect(body.get('montoReclamado')).toBeNull();
    expect(body.get('ruc')).toBe('20111222333');
    expect(body.get('comprobantesCount')).toBe('0');
  });

  it('appends repeated attachments entries preserving order and filenames', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true }));

    const first = makeFile('factura.pdf', 10);
    const second = makeFile('estado-cuenta.xlsx', 20);

    const { result } = renderHook(() => useSendCobranzaEmail());
    await act(async () => {
      await result.current.send(baseInput({ attachments: [first, second] }));
    });

    const attachments = postBodyOf(fetchMock).getAll('attachments');
    expect(attachments).toHaveLength(2);
    // FormData.getAll() may re-wrap the File objects; assert the entries
    // travel intact (name/size/type) and in dispatch order.
    expect(attachments[0]).toStrictEqual(first);
    expect(attachments[1]).toStrictEqual(second);
  });

  // ---- persist-before-dispatch (REQ-01-DIR-07) ----

  it('awaits directory.save() BEFORE dispatching the POST', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true }));
    const events: string[] = [];
    const directory: CobranzaDirectoryPort = {
      save: async () => {
        events.push('save-start');
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push('save-end');
      },
    };

    const { result } = renderHook(() => useSendCobranzaEmail());
    await act(async () => {
      await result.current.send(baseInput({ directory }));
    });

    events.push('post-done');
    expect(events).toEqual(['save-start', 'save-end', 'post-done']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the send (no POST) when the directory persist fails, surfacing the cause', async () => {
    const directory: CobranzaDirectoryPort = {
      save: () => Promise.reject(new Error('CONFLICT')),
    };

    const { result } = renderHook(() => useSendCobranzaEmail());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.send(baseInput({ directory }));
    });

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error).toBe('No se pudo guardar el contacto: CONFLICT');
    expect(result.current.isSending).toBe(false);
  });

  it('sends without persisting when no directory port is injected (junk key path)', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true }));

    const { result } = renderHook(() => useSendCobranzaEmail());
    await act(async () => {
      await result.current.send(baseInput());
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  // ---- error mapping ----

  it('maps a non-OK response to the API error message and returns false', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: false, error: 'Error SMTP del servidor' }, false, 500));

    const { result } = renderHook(() => useSendCobranzaEmail());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.send(baseInput());
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('Error SMTP del servidor');
  });

  it('falls back to a generic message when a non-OK response has no error body', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as unknown as Response);

    const { result } = renderHook(() => useSendCobranzaEmail());
    await act(async () => {
      await result.current.send(baseInput());
    });

    expect(result.current.error).toBe('Error al enviar el correo');
  });

  it('maps a network rejection to Error de conexión and returns false', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useSendCobranzaEmail());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.send(baseInput());
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('Error de conexión');
  });

  // ---- sending lifecycle ----

  it('tracks isSending while the POST is in flight, then resolves success', async () => {
    let resolvePost: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolvePost = resolve;
      }),
    );

    const { result } = renderHook(() => useSendCobranzaEmail());
    expect(result.current.isSending).toBe(false);

    let sendPromise: Promise<boolean> = Promise.resolve(false);
    act(() => {
      sendPromise = result.current.send(baseInput());
    });
    expect(result.current.isSending).toBe(true);

    await act(async () => {
      resolvePost(jsonRes({ success: true }));
      await sendPromise;
    });

    await waitFor(() => {
      expect(result.current.isSending).toBe(false);
    });
    expect(result.current.error).toBeNull();
  });

  it('clears a previous error on the next send attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ success: false, error: 'Error SMTP' }, false, 500))
      .mockResolvedValueOnce(jsonRes({ success: true }));

    const { result } = renderHook(() => useSendCobranzaEmail());

    await act(async () => {
      await result.current.send(baseInput());
    });
    expect(result.current.error).toBe('Error SMTP');

    await act(async () => {
      await result.current.send(baseInput());
    });
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
