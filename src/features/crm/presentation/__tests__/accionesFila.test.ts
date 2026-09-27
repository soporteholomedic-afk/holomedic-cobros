import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildEnviosPath,
  enviarCorreoEmpresa,
  pausarEmpresa,
} from '../accionesFila';
import { MOTIVO_NEGATIVO_POR_DEFECTO } from '../components/panel/ModalRespuesta';

/**
 * Row-action client seam (decision 13, batch 14): the panel's send row
 * buttons (Enviar carta / +1 Sem / Reactivar ya) ride the EXISTING
 * POST /api/crm/empresas/[id]/envios endpoint (task 5.2 — the same one
 * the ficha quick action uses, extracted here so both callers share the
 * error mapping), and "Pausar 3m" rides the EXISTING transiciones
 * endpoint with the T14 Rechazo payload (the same write
 * ModalRespuesta performs on a negative answer).
 *
 * Tested at the lowest seam: global fetch stubbed, zero component or
 * hook mocks (extract-before-mock). {ok, error} — never a thrown
 * promise — so callers surface the API's Spanish error verbatim.
 */

const fetchMock = vi.fn();

function okResponse(payload: unknown = { success: true }): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildEnviosPath — single source of the envios URL', () => {
  it('builds the existing POST /envios route for an empresa', () => {
    expect(buildEnviosPath(5)).toBe('/api/crm/empresas/5/envios');
  });
});

describe('enviarCorreoEmpresa — POST /envios (ficha quick action + panel rows)', () => {
  it('POSTs the plantilla to the empresa envios route and resolves ok on 200', async () => {
    fetchMock.mockResolvedValue(okResponse());

    const resultado = await enviarCorreoEmpresa(7, 'seguimiento_2');

    expect(resultado).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/crm/empresas/7/envios');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ plantilla: 'seguimiento_2' });
  });

  it('surfaces the API Spanish error verbatim on failure', async () => {
    fetchMock.mockResolvedValue(
      errorResponse(409, { error: 'El contacto no tiene correo registrado' }),
    );

    const resultado = await enviarCorreoEmpresa(7, 'carta_presentacion');

    expect(resultado).toEqual({ ok: false, error: 'El contacto no tiene correo registrado' });
  });

  it('falls back to "HTTP <status>" when the error body carries no string error', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, { error: 42 }));

    const resultado = await enviarCorreoEmpresa(7, 'carta_presentacion');

    expect(resultado).toEqual({ ok: false, error: 'HTTP 400' });
  });

  it('maps a network failure to "Error de red" (ficha precedent, never throws)', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));

    const resultado = await enviarCorreoEmpresa(7, 'carta_presentacion');

    expect(resultado).toEqual({ ok: false, error: 'Error de red' });
  });
});

describe('pausarEmpresa — POST /transiciones (T14 Rechazo, same write as ModalRespuesta)', () => {
  it('POSTs the Rechazo event with the default motivo to the transiciones route', async () => {
    fetchMock.mockResolvedValue(okResponse());

    const resultado = await pausarEmpresa(3);

    expect(resultado).toEqual({ ok: true, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/crm/empresas/3/transiciones');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      evento: 'Rechazo',
      motivo: MOTIVO_NEGATIVO_POR_DEFECTO,
    });
  });

  it('surfaces the API Spanish error verbatim on failure', async () => {
    fetchMock.mockResolvedValue(
      errorResponse(400, { error: 'La transición no es válida para la etapa actual' }),
    );

    const resultado = await pausarEmpresa(3);

    expect(resultado).toEqual({
      ok: false,
      error: 'La transición no es válida para la etapa actual',
    });
  });

  it('maps a network failure to "Error de red"', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const resultado = await pausarEmpresa(3);

    expect(resultado).toEqual({ ok: false, error: 'Error de red' });
  });
});
