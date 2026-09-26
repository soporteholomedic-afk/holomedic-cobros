import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useImportacion, type VistaPreviaImport } from '../useImportacion';
import type { FilaImportCrm } from '../../../domain/importar/columnas';
import type { ResultadoEjecucionImportacion } from '../../../application/importar/ejecutarImportacion';

// ---- Fixtures ----

function fila(clave: Partial<FilaImportCrm> = {}): FilaImportCrm {
  return {
    empresa: 'Constructora X',
    ruc: '900123456',
    tipo: 'Cliente',
    origen: 'Inbound',
    proyectoObra: '',
    destinoComun: '',
    responsable: '',
    notas: '',
    encargado: 'Ana',
    correos: 'ana@x.com',
    telefono: '',
    principal: '',
    ...clave,
  };
}

const VISTA_PREVIA: VistaPreviaImport = {
  totalFilas: 2,
  filasValidas: 2,
  empresas: [
    { ruc: '900123456', razonSocial: 'Constructora X', tipo: 'Cliente', contactos: ['Ana', 'Luis'] },
  ],
  errores: [],
};

const RESULTADO: ResultadoEjecucionImportacion = {
  totalFilas: 2,
  filasValidas: 2,
  empresasCreadas: 1,
  empresasActualizadas: 0,
  contactosCreados: 2,
  contactosActualizados: 0,
  errores: [],
  fallos: [],
  advertencias: [],
  importacionId: 7,
};

const LAS_FILAS: FilaImportCrm[] = [fila(), fila({ encargado: 'Luis', correos: 'luis@x.com' })];

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function postBody(llamada: number): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[llamada] ?? [];
  return JSON.parse((init as { body: string }).body) as Record<string, unknown>;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- useImportacion state machine ----

describe('useImportacion', () => {
  it('validates rows: idle → validando → vista-previa posting raw rows', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, ...VISTA_PREVIA }));

    const { result } = renderHook(() => useImportacion());
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.validarFilas(LAS_FILAS, 'empresas.xlsx');
    });

    await waitFor(() => expect(result.current.status).toBe('vista-previa'));
    expect(result.current.vistaPrevia).toEqual(VISTA_PREVIA);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/crm/import/validar',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(postBody(0)).toEqual({ archivoNombre: 'empresas.xlsx', filas: LAS_FILAS });
  });

  it('surfaces the API error message when validar responds non-OK', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Esta acción requiere el permiso crm_admin' }), {
        status: 403,
      }),
    );

    const { result } = renderHook(() => useImportacion());
    await act(async () => {
      await result.current.validarFilas(LAS_FILAS, 'a.xlsx');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Esta acción requiere el permiso crm_admin');
    expect(result.current.vistaPrevia).toBeNull();
  });

  it('reports an unexpected validar response shape as an error', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, totalFilas: 'nope' }));

    const { result } = renderHook(() => useImportacion());
    await act(async () => {
      await result.current.validarFilas(LAS_FILAS, 'a.xlsx');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Respuesta inesperada del servidor');
  });

  it('confirms with the SAME rows it validated and lands on resultado', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ success: true, ...VISTA_PREVIA }))
      .mockResolvedValueOnce(okResponse({ success: true, resultado: RESULTADO }));

    const { result } = renderHook(() => useImportacion());
    await act(async () => {
      await result.current.validarFilas(LAS_FILAS, 'empresas.xlsx');
    });
    await waitFor(() => expect(result.current.status).toBe('vista-previa'));

    await act(async () => {
      await result.current.confirmar();
    });

    await waitFor(() => expect(result.current.status).toBe('resultado'));
    expect(result.current.resultado).toEqual(RESULTADO);
    expect(postBody(1)).toEqual({ archivoNombre: 'empresas.xlsx', filas: LAS_FILAS });
  });

  it('ignores confirmar when nothing was validated (no fetch)', async () => {
    const { result } = renderHook(() => useImportacion());

    await act(async () => {
      await result.current.confirmar();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('cancelar discards the preview and the stored rows: nothing can be confirmed after', async () => {
    // G2: cancelling writes nothing — the hook drops the payload so a
    // late confirmar is a no-op instead of re-posting stale rows.
    fetchMock.mockResolvedValue(okResponse({ success: true, ...VISTA_PREVIA }));

    const { result } = renderHook(() => useImportacion());
    await act(async () => {
      await result.current.validarFilas(LAS_FILAS, 'empresas.xlsx');
    });
    await waitFor(() => expect(result.current.status).toBe('vista-previa'));

    act(() => {
      result.current.cancelar();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.vistaPrevia).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.confirmar();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // still only the validar call
  });

  it('reintenta the failed validation', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Error de red'))
      .mockResolvedValueOnce(okResponse({ success: true, ...VISTA_PREVIA }));

    const { result } = renderHook(() => useImportacion());
    await act(async () => {
      await result.current.validarFilas(LAS_FILAS, 'empresas.xlsx');
    });
    await waitFor(() => expect(result.current.status).toBe('error'));

    await act(async () => {
      await result.current.reintentar();
    });

    await waitFor(() => expect(result.current.status).toBe('vista-previa'));
    expect(result.current.vistaPrevia).toEqual(VISTA_PREVIA);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(postBody(1)).toEqual({ archivoNombre: 'empresas.xlsx', filas: LAS_FILAS });
  });

  it('reintenta the failed confirmation against /confirmar', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ success: true, ...VISTA_PREVIA }))
      .mockRejectedValueOnce(new Error('Error de red'))
      .mockResolvedValueOnce(okResponse({ success: true, resultado: RESULTADO }));

    const { result } = renderHook(() => useImportacion());
    await act(async () => {
      await result.current.validarFilas(LAS_FILAS, 'empresas.xlsx');
    });
    await waitFor(() => expect(result.current.status).toBe('vista-previa'));

    await act(async () => {
      await result.current.confirmar();
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    // The preview survives a failed confirmation so the wizard stays on
    // the preview step (retry confirm / cancel both remain possible).
    expect(result.current.vistaPrevia).toEqual(VISTA_PREVIA);

    await act(async () => {
      await result.current.reintentar();
    });

    await waitFor(() => expect(result.current.status).toBe('resultado'));
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/crm/import/confirmar');
  });
});
