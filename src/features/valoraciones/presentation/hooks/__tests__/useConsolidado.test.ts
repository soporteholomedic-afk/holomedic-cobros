import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ValoracionesFilter } from '../../../domain/entities';
import { buildConsolidadoQuery, useConsolidado } from '../useConsolidado';

const filtro: ValoracionesFilter = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
  codCli: 55,
};

describe('buildConsolidadoQuery', () => {
  it('extends the sigla query with consolidado=true', () => {
    const qs = buildConsolidadoQuery(filtro);
    const params = new URLSearchParams(qs);

    expect(params.get('consolidado')).toBe('true');
    expect(params.get('fecIni')).toBe('2026-01-01');
    expect(params.get('codMon')).toBe('1');
    expect(params.get('codCli')).toBe('55');
  });
});

describe('useConsolidado', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const filas = [
    {
      codCli: 55,
      nomCom: 'EMPRESA DEMO',
      codDes: 101,
      desDes: 'SEDE NORTE',
      desTCh: 'PREOCUPACIONAL',
      canEva: 5,
      importe: 1062,
      venta: 900,
    },
  ];
  const totales = [
    { nomCom: 'EMPRESA DEMO', desDes: 'SEDE NORTE', codDes: 101, subtotal: 1000, igv: 180, total: 1180 },
  ];

  it('fetches the consolidado endpoint and surfaces filas/totales', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ filas, totales }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConsolidado());

    act(() => result.current.buscar(filtro));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/valoraciones/sigla?');
    expect(calledUrl).toContain('consolidado=true');
    expect(result.current.filas).toEqual(filas);
    expect(result.current.totales).toEqual(totales);
    expect(result.current.error).toBeNull();
  });

  it('maps API errors to a user-visible message and clears results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Seleccione un cliente' }), { status: 400 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConsolidado());

    act(() => result.current.buscar(filtro));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Seleccione un cliente');
    expect(result.current.filas).toEqual([]);
    expect(result.current.totales).toEqual([]);
  });

  it('rejects unexpected payload shapes without crashing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ resultados: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConsolidado());

    act(() => result.current.buscar(filtro));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toContain('inesperada');
  });
});
