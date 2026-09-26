import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { buildEmpresasQuery, useEmpresas, type EmpresasFiltros } from '../useEmpresas';
import type { Empresa } from '../../../domain/entities';

// ---- Fixtures ----

const empresa: Empresa = {
  id: 1,
  ruc: '900123456',
  rucNormalizado: '900123456',
  razonSocial: 'Constructora X',
  tipo: 'Cliente',
  origen: 'Inbound',
  proyectoObra: null,
  destinoComun: null,
  notas: null,
  responsable: 'jperez',
  contactos: [
    {
      id: 11,
      empresaId: 1,
      nombre: 'Ana',
      telefono: '987654321',
      esPrincipal: true,
      correos: [{ id: 111, contactoId: 11, correo: 'ana@x.com' }],
    },
  ],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const SIN_FILTROS: EmpresasFiltros = { q: '', tipo: '' };

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---- buildEmpresasQuery (pure — no mocks) ----

describe('buildEmpresasQuery', () => {
  it('returns the bare path without filters', () => {
    expect(buildEmpresasQuery(SIN_FILTROS)).toBe('/api/crm/empresas');
  });

  it('trims q and omits it when blank', () => {
    expect(buildEmpresasQuery({ q: '  constructora  ', tipo: '' })).toBe(
      '/api/crm/empresas?q=constructora',
    );
    expect(buildEmpresasQuery({ q: '   ', tipo: '' })).toBe('/api/crm/empresas');
  });

  it('appends tipo only when set', () => {
    expect(buildEmpresasQuery({ q: '', tipo: 'Prospecto' })).toBe(
      '/api/crm/empresas?tipo=Prospecto',
    );
    expect(buildEmpresasQuery({ q: 'ruc-9', tipo: 'Cliente' })).toBe(
      '/api/crm/empresas?q=ruc-9&tipo=Cliente',
    );
  });
});

// ---- useEmpresas status machine ----

describe('useEmpresas', () => {
  it('goes loading → ready and exposes the fetched empresas', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, empresas: [empresa] }));

    const { result } = renderHook(() => useEmpresas(SIN_FILTROS));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.empresas).toEqual([empresa]);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/crm/empresas', { method: 'GET' });
  });

  it('surfaces the API error message on a non-OK response', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'No autorizado', code: 'FORBIDDEN' }), { status: 403 }),
    );

    const { result } = renderHook(() => useEmpresas(SIN_FILTROS));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('No autorizado');
    expect(result.current.empresas).toEqual([]);
  });

  it('reports an unexpected shape as an error', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, empresas: 'nope' }));

    const { result } = renderHook(() => useEmpresas(SIN_FILTROS));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Respuesta inesperada del servidor');
  });

  it('recovers via retry after a failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Error de red'))
      .mockResolvedValueOnce(okResponse({ success: true, empresas: [empresa] }));

    const { result } = renderHook(() => useEmpresas(SIN_FILTROS));

    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.empresas).toEqual([empresa]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refetches when the filters change', async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true, empresas: [] }));

    const { result, rerender } = renderHook((filtros: EmpresasFiltros) => useEmpresas(filtros), {
      initialProps: SIN_FILTROS,
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ q: 'constructora', tipo: 'Cliente' });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/crm/empresas?q=constructora&tipo=Cliente',
        { method: 'GET' },
      ),
    );
  });
});
