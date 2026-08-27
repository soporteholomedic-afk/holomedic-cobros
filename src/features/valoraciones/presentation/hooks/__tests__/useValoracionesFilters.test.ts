import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { hoyIso } from '../../helpers/format';
import { toFiltro, useValoracionesFilters } from '../useValoracionesFilters';

describe('useValoracionesFilters', () => {
  it('defaults: periodo today, SOLES, No Facturados, FecAte mode, consolidado off', () => {
    const { result } = renderHook(() => useValoracionesFilters());
    const hoy = hoyIso();

    expect(result.current.filtros).toEqual({
      fecIni: hoy,
      fecFin: hoy,
      codMon: 1,
      indFac: 0,
      inFsta: false,
      consolidado: false,
    });
  });

  it('switches moneda and indFac tri-state', () => {
    const { result } = renderHook(() => useValoracionesFilters());

    act(() => result.current.dispatch({ type: 'SET_MONEDA', codMon: 2 }));
    expect(result.current.filtros.codMon).toBe(2);

    act(() => result.current.dispatch({ type: 'SET_IND_FAC', indFac: null }));
    expect(result.current.filtros.indFac).toBeNull();

    act(() => result.current.dispatch({ type: 'SET_IND_FAC', indFac: 1 }));
    expect(result.current.filtros.indFac).toBe(1);

    act(() => result.current.dispatch({ type: 'SET_MODO_FECHA', inFsta: true }));
    expect(result.current.filtros.inFsta).toBe(true);
  });

  it('selecting a different client resets the destino (spec Q-R5)', () => {
    const { result } = renderHook(() => useValoracionesFilters());

    act(() => result.current.dispatch({ type: 'SET_CLIENTE', codCli: 10, nombre: 'CLIENTE A' }));
    act(() => result.current.dispatch({ type: 'SET_DESTINO', codDes: 3 }));
    expect(result.current.filtros.codCli).toBe(10);
    expect(result.current.filtros.codDes).toBe(3);

    act(() => result.current.dispatch({ type: 'SET_CLIENTE', codCli: 20, nombre: 'CLIENTE B' }));
    expect(result.current.filtros.codCli).toBe(20);
    expect(result.current.filtros.cliNombre).toBe('CLIENTE B');
    expect(result.current.filtros.codDes).toBeUndefined();
  });

  it('clearing the client resets client label and destino', () => {
    const { result } = renderHook(() => useValoracionesFilters());

    act(() => result.current.dispatch({ type: 'SET_CLIENTE', codCli: 10, nombre: 'CLIENTE A' }));
    act(() => result.current.dispatch({ type: 'SET_DESTINO', codDes: 3 }));
    act(() => result.current.dispatch({ type: 'SET_CLIENTE' }));

    expect(result.current.filtros.codCli).toBeUndefined();
    expect(result.current.filtros.cliNombre).toBeUndefined();
    expect(result.current.filtros.codDes).toBeUndefined();
  });

  it('LIMPIAR restores the defaults after changes', () => {
    const { result } = renderHook(() => useValoracionesFilters());
    const hoy = hoyIso();

    act(() => result.current.dispatch({ type: 'SET_PERIODO', fecIni: '2026-01-01', fecFin: '2026-01-31' }));
    act(() => result.current.dispatch({ type: 'SET_MONEDA', codMon: 2 }));
    act(() => result.current.dispatch({ type: 'SET_CLIENTE', codCli: 10, nombre: 'CLIENTE A' }));
    act(() => result.current.dispatch({ type: 'SET_PACIENTE', codPac: 5, nombre: 'PACIENTE X' }));
    act(() => result.current.limpiar());

    expect(result.current.filtros).toEqual({
      fecIni: hoy,
      fecFin: hoy,
      codMon: 1,
      indFac: 0,
      inFsta: false,
      consolidado: false,
    });
  });

  it('toFiltro drops labels/consolidado and omits absent optional ids', () => {
    const { result } = renderHook(() => useValoracionesFilters());
    act(() => result.current.dispatch({ type: 'SET_PERIODO', fecIni: '2026-02-01', fecFin: '2026-02-28' }));
    act(() => result.current.dispatch({ type: 'SET_FACTURAR_A', codCfa: 7, nombre: 'FACTURAR A' }));
    act(() => result.current.dispatch({ type: 'SET_SEDE', codSed: 2 }));

    const filtro = toFiltro(result.current.filtros);
    expect(filtro).toEqual({
      fecIni: '2026-02-01',
      fecFin: '2026-02-28',
      codMon: 1,
      indFac: 0,
      inFsta: false,
      codCfa: 7,
      codSed: 2,
    });
    expect('cliNombre' in filtro).toBe(false);
    expect('consolidado' in filtro).toBe(false);
  });

  // ---- Slice 2: consolidado enablement (spec Q-R5/Q-R6) ----

  it('toggles consolidado only while a client is selected', () => {
    const { result } = renderHook(() => useValoracionesFilters());

    // Without a client the toggle is a no-op (gated like SIGLA's checkbox).
    act(() => result.current.dispatch({ type: 'SET_CONSOLIDADO', consolidado: true }));
    expect(result.current.filtros.consolidado).toBe(false);

    act(() => result.current.dispatch({ type: 'SET_CLIENTE', codCli: 10, nombre: 'CLIENTE A' }));
    act(() => result.current.dispatch({ type: 'SET_CONSOLIDADO', consolidado: true }));
    expect(result.current.filtros.consolidado).toBe(true);

    act(() => result.current.dispatch({ type: 'SET_CONSOLIDADO', consolidado: false }));
    expect(result.current.filtros.consolidado).toBe(false);
  });

  it('clearing the client resets consolidado along with the destino', () => {
    const { result } = renderHook(() => useValoracionesFilters());

    act(() => result.current.dispatch({ type: 'SET_CLIENTE', codCli: 10, nombre: 'CLIENTE A' }));
    act(() => result.current.dispatch({ type: 'SET_DESTINO', codDes: 3 }));
    act(() => result.current.dispatch({ type: 'SET_CONSOLIDADO', consolidado: true }));
    act(() => result.current.dispatch({ type: 'SET_CLIENTE' }));

    expect(result.current.filtros.codDes).toBeUndefined();
    expect(result.current.filtros.consolidado).toBe(false);
  });

  it('switching to another client keeps consolidado (only clearing resets it)', () => {
    const { result } = renderHook(() => useValoracionesFilters());

    act(() => result.current.dispatch({ type: 'SET_CLIENTE', codCli: 10, nombre: 'CLIENTE A' }));
    act(() => result.current.dispatch({ type: 'SET_CONSOLIDADO', consolidado: true }));
    act(() => result.current.dispatch({ type: 'SET_CLIENTE', codCli: 20, nombre: 'CLIENTE B' }));

    // SIGLA disables the checkbox only on clear; a pick keeps the flag.
    expect(result.current.filtros.consolidado).toBe(true);

    act(() => result.current.dispatch({ type: 'SET_CLIENTE' }));
    expect(result.current.filtros.consolidado).toBe(false);
  });
});
