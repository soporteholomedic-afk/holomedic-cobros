import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useAuditoriaConfig, useResumenConocimiento } from '../useAuditoriaConfig';

/**
 * Contract for useAuditoriaConfig (agente-ia-crm E5·T6): the last 20
 * audit rows for a key prefix, plus the read-only knowledge summary
 * hook behind the "Conocimiento" tab. Both are fetch-only, guard the
 * response shape and never throw into the page.
 */

const FILA = {
  id: 1,
  clave: 'agente.umbralConfianza',
  usuario: 'Juana Perez',
  valorAnterior: '0.6',
  valorNuevo: '0.75',
  esSecreto: false,
  creadoEn: '2026-10-17T10:00:00.000Z',
};

const fetchMock = vi.fn();

function responder(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAuditoriaConfig', () => {
  it('pide el prefijo con limite=20 y devuelve las filas', async () => {
    fetchMock.mockResolvedValue(responder(200, { success: true, auditoria: [FILA] }));

    const { result } = renderHook(() => useAuditoriaConfig('canal.kapso.'));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('populated'));
    expect(result.current.filas).toEqual([FILA]);
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/configuracion/auditoria?prefijo=canal.kapso.&limite=20');
  });

  it('recarga al cambiar el prefijo y con recargar()', async () => {
    fetchMock.mockImplementation(async () => responder(200, { success: true, auditoria: [] }));

    const { result, rerender } = renderHook(({ prefijo }) => useAuditoriaConfig(prefijo), {
      initialProps: { prefijo: 'agente.' },
    });
    await waitFor(() => expect(result.current.status).toBe('populated'));

    rerender({ prefijo: 'memoria.' });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('/api/crm/configuracion/auditoria?prefijo=memoria.&limite=20'),
    );

    const antes = fetchMock.mock.calls.length;
    result.current.recargar();
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(antes + 1));
  });

  it('guard: una fila con forma inválida → error', async () => {
    fetchMock.mockResolvedValue(responder(200, { success: true, auditoria: [{ ...FILA, id: 'uno' }] }));

    const { result } = renderHook(() => useAuditoriaConfig('agente.'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.filas).toEqual([]);
  });

  it('HTTP 403 y error de red → error sin tirar', async () => {
    fetchMock.mockResolvedValueOnce(responder(403, { success: false, error: 'x', code: 'FORBIDDEN' }));
    const a = renderHook(() => useAuditoriaConfig('agente.'));
    await waitFor(() => expect(a.result.current.status).toBe('error'));
    expect(a.result.current.error).toMatch(/HTTP 403/);

    fetchMock.mockRejectedValueOnce(new Error('boom'));
    const b = renderHook(() => useAuditoriaConfig('agente.'));
    await waitFor(() => expect(b.result.current.status).toBe('error'));
  });
});

describe('useResumenConocimiento', () => {
  const RESUMEN = {
    success: true,
    total: 14,
    porOrigen: { MANUAL: 4, SEMILLA: 0, SUBIDO: 10 },
    ingestasPorEstado: { PENDIENTE: 0, PROCESANDO: 0, COMPLETADA: 6, FALLIDA: 1 },
  };

  it('populated con los conteos', async () => {
    fetchMock.mockResolvedValue(responder(200, RESUMEN));

    const { result } = renderHook(() => useResumenConocimiento());

    await waitFor(() => expect(result.current.status).toBe('populated'));
    expect(result.current.resumen?.total).toBe(14);
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/configuracion/conocimiento');
  });

  it('guard y HTTP 503 → error', async () => {
    fetchMock.mockResolvedValueOnce(responder(200, { ...RESUMEN, porOrigen: { MANUAL: 'x' } }));
    const a = renderHook(() => useResumenConocimiento());
    await waitFor(() => expect(a.result.current.status).toBe('error'));
    expect(a.result.current.resumen).toBeNull();

    fetchMock.mockResolvedValueOnce(responder(503, { success: false, error: 'x', code: 'INTERNAL_ERROR' }));
    const b = renderHook(() => useResumenConocimiento());
    await waitFor(() => expect(b.result.current.status).toBe('error'));
  });
});
