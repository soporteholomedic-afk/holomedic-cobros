import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeRepFacturacion } from '../../../domain/fixtures';
import type { ValoracionesFilter } from '../../../domain/entities';
import { buildValoracionesQuery, useValoraciones } from '../useValoraciones';

const FILTRO_BASE: ValoracionesFilter = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
};

function mockFetchOnce(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildValoracionesQuery', () => {
  it('serializes required filters and omits absent or non-positive ids', () => {
    const query = buildValoracionesQuery({
      ...FILTRO_BASE,
      codCli: 15,
      codDes: 0, // <= 0 → omitted (NULL bind server-side)
    });
    const params = new URLSearchParams(query);
    expect(params.get('fecIni')).toBe('2026-01-01');
    expect(params.get('fecFin')).toBe('2026-01-31');
    expect(params.get('codMon')).toBe('1');
    expect(params.get('indFac')).toBe('0');
    expect(params.get('inFsta')).toBe('false');
    expect(params.get('ocultarCero')).toBe('false');
    expect(params.get('codCli')).toBe('15');
    expect(params.has('codDes')).toBe(false);
    expect(params.has('codPac')).toBe(false);
  });

  it('serializes the tri-state Todos as "null"', () => {
    const query = buildValoracionesQuery({ ...FILTRO_BASE, indFac: null });
    expect(new URLSearchParams(query).get('indFac')).toBe('null');
  });

  it('emits ocultarCero=true when the filter carries it (query → API contract)', () => {
    const query = buildValoracionesQuery({ ...FILTRO_BASE, ocultarCero: true });
    expect(new URLSearchParams(query).get('ocultarCero')).toBe('true');
  });
});

describe('useValoraciones', () => {
  it('starts idle with no groups and no moneda', () => {
    vi.stubGlobal('fetch', vi.fn());
    const { result } = renderHook(() => useValoraciones());

    expect(result.current.status).toBe('idle');
    expect(result.current.grupos).toEqual([]);
    expect(result.current.moneda).toBeNull();
  });

  it('queries the sigla endpoint and groups moneda-aware (VVtaMO for CodMon 2)', async () => {
    const fetchMock = mockFetchOnce({
      resultados: [
        makeRepFacturacion({
          NomCFa: 'EMPRESA MO S.A.C.',
          CodMon: 2,
          Simbol: '$',
          VVtaMN: 999, // ignored when codMon = 2
          VVtaMO: 100,
        }),
        makeRepFacturacion({
          NomCFa: 'EMPRESA MO S.A.C.',
          Pacien: 'SEGUNDO PACIENTE',
          IdAten: '000124',
          ItemEx: 2,
          CodMon: 2,
          Simbol: '$',
          VVtaMN: 1,
          VVtaMO: 50,
        }),
      ],
    });
    const { result } = renderHook(() => useValoraciones());

    act(() => {
      result.current.buscar({ ...FILTRO_BASE, codMon: 2 });
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/valoraciones/sigla?');
    expect(url).toContain('codMon=2');

    // CodMon = 2 → grouped rows show *MO amounts (spec Q-R6).
    expect(result.current.grupos).toHaveLength(1);
    const grupo = result.current.grupos[0];
    expect(grupo.empresa).toBe('EMPRESA MO S.A.C.');
    expect(grupo.cantidad).toBe(2);
    expect(grupo.subtotal).toBe(150);
    expect(grupo.simbol).toBe('$');
    expect(result.current.totalRegistros).toBe(2);
  });

  it('maps API error messages onto the error state', async () => {
    mockFetchOnce({ error: 'El período es inválido' }, false, 400);
    const { result } = renderHook(() => useValoraciones());

    act(() => {
      result.current.buscar(FILTRO_BASE);
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('El período es inválido');
    expect(result.current.grupos).toEqual([]);
    expect(result.current.moneda).toBeNull();
  });

  it('surfaces a user-safe fallback when the body has no error field', async () => {
    mockFetchOnce({}, false, 500);
    const { result } = renderHook(() => useValoraciones());

    act(() => {
      result.current.buscar(FILTRO_BASE);
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Error del servidor (500)');
  });

  it('reports network failures as connection errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    const { result } = renderHook(() => useValoraciones());

    act(() => {
      result.current.buscar(FILTRO_BASE);
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Error de conexión');
  });

  it('rejects unexpected response shapes', async () => {
    mockFetchOnce({ inesperado: true });
    const { result } = renderHook(() => useValoraciones());

    act(() => {
      result.current.buscar(FILTRO_BASE);
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Respuesta inesperada del servidor');
  });

  it('rejects a success-shaped payload whose EstCob is not an EstadoEmpresa label', async () => {
    // Raw unknown code 'X' in an otherwise valid row — the guard must not
    // let it reach state (it is built as a raw literal because the
    // EstadoEmpresa union correctly refuses to type it).
    mockFetchOnce({
      resultados: [{ ...makeRepFacturacion(), EstCob: 'X' }],
    });
    const { result } = renderHook(() => useValoraciones());

    act(() => {
      result.current.buscar(FILTRO_BASE);
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Respuesta inesperada del servidor');
    expect(result.current.grupos).toEqual([]);
  });
});
