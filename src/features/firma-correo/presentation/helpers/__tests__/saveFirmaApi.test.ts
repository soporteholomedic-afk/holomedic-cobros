/**
 * Tests for `saveFirmaApi` (editor-firmas task 3.5).
 *
 * Contract with `PUT /api/plantillas/firma` (PR2 route):
 *  - 200 `{success:true, firma, firmaHtml}` → `{ok:true, ...}`
 *  - 400 `{success:false, error, code, fields?}` → `{ok:false, error, fields}`
 *  - network rejection → `{ok:false, error}` (never throws)
 *
 * `fetch` is stubbed at the global boundary (repo testing rule).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveFirmaApi } from '../saveFirmaApi';
import type { FirmaCorreo } from '../../../domain/entities';

const FIRMA: FirmaCorreo = {
  nombre: 'Dr. Juan Doe',
  area: 'Medicina',
  correo: 'juan.doe@holomedic.pe',
  telefono: '999 888 777',
  anexo: '123',
};

const SAVED_FIRMA: FirmaCorreo = {
  nombre: 'Dr. Juan Doe',
  area: 'Medicina',
  correo: 'juan.doe@holomedic.pe',
  telefono: '999888777',
  anexo: '123',
};

function jsonRes(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('saveFirmaApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('PUTs the five plain fields as JSON and returns the saved firma + server-composed html', async () => {
    fetchMock.mockResolvedValue(
      jsonRes({ success: true, firma: SAVED_FIRMA, firmaHtml: '<table>…</table>' }),
    );

    const result = await saveFirmaApi(FIRMA);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/plantillas/firma');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual(FIRMA);

    expect(result).toEqual({
      ok: true,
      firma: SAVED_FIRMA,
      firmaHtml: '<table>…</table>',
    });
  });

  it('maps a 400 VALIDATION_ERROR body with per-field errors', async () => {
    fetchMock.mockResolvedValue(
      jsonRes(
        {
          success: false,
          error: 'La firma contiene campos inválidos',
          code: 'VALIDATION_ERROR',
          fields: { correo: 'El correo no tiene un formato válido.' },
        },
        false,
        400,
      ),
    );

    const result = await saveFirmaApi({ ...FIRMA, correo: 'abc' });

    expect(result).toEqual({
      ok: false,
      error: 'La firma contiene campos inválidos',
      fields: { correo: 'El correo no tiene un formato válido.' },
    });
  });

  it('maps an error body WITHOUT fields (e.g. 401/403/500 shape)', async () => {
    fetchMock.mockResolvedValue(
      jsonRes({ success: false, error: 'No autenticado', code: 'UNAUTHORIZED' }, false, 401),
    );

    const result = await saveFirmaApi(FIRMA);

    expect(result).toEqual({ ok: false, error: 'No autenticado' });
  });

  it('maps a network rejection to a friendly connection error without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await saveFirmaApi(FIRMA);

    expect(result).toEqual({ ok: false, error: 'No se pudo conectar con el servidor' });
  });

  it('degrades an unexpected success body to a generic failure (external data is never trusted)', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true, firma: 'garbage' }));

    const result = await saveFirmaApi(FIRMA);

    expect(result).toEqual({ ok: false, error: 'Respuesta inválida del servidor' });
  });
});
