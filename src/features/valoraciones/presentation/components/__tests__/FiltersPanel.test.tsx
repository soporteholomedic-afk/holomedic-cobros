import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ValoracionesFilterAction, ValoracionesFilterState } from '../../hooks/useValoracionesFilters';
import { hoyIso } from '../../helpers/format';
import { FiltersPanel } from '../FiltersPanel';

function makeFiltros(overrides: Partial<ValoracionesFilterState> = {}): ValoracionesFilterState {
  const hoy = hoyIso();
  return {
    fecIni: hoy,
    fecFin: hoy,
    codMon: 1,
    indFac: 0,
    inFsta: false,
    consolidado: false,
    ...overrides,
  };
}

function renderPanel(filtros = makeFiltros(), onCambio = vi.fn()) {
  const props = {
    filtros,
    onCambio,
    onConsultar: vi.fn(),
    onLimpiar: vi.fn(),
    consultando: false,
    destinos: [
      { codDes: 1, desDes: 'OFICINA PRINCIPAL' },
      { codDes: 2, desDes: 'PLANTA NORTE' },
    ],
    destinosCargando: false,
    sedes: [{ codSed: 1, nomSed: 'SEDE SURQUILLO' }],
    tiposTrabajador: [
      { codTip: 620001, desTip: 'OBRERO' },
      { codTip: 620002, desTip: 'EMPLEADO' },
    ],
  };
  const utils = render(<FiltersPanel {...props} />);
  return { ...utils, props };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FiltersPanel', () => {
  it('renders the 11 controls mirroring RptFacturacionForm', () => {
    renderPanel();

    expect(screen.getByLabelText('Fecha inicio')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha fin')).toBeInTheDocument();
    expect(screen.getByLabelText('Moneda')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado de facturación')).toBeInTheDocument();
    expect(screen.getByLabelText('Cliente')).toBeInTheDocument();
    expect(screen.getByLabelText('Facturar a')).toBeInTheDocument();
    expect(screen.getByLabelText('Destino')).toBeInTheDocument();
    expect(screen.getByLabelText('Paciente')).toBeInTheDocument();
    expect(screen.getByLabelText('Sede')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de trabajador')).toBeInTheDocument();
    expect(screen.getByLabelText('Usar fecha de estado (FecSTA)')).toBeInTheDocument();
  });

  it('renders consolidado DISABLED without a client and ENABLED with one (slice 2)', () => {
    const onCambio = vi.fn();
    const sinCliente = renderPanel(makeFiltros(), onCambio);

    // No client selected → gated (spec Q-R5).
    const consolidadoOff = screen.getByLabelText('Consolidado');
    expect(consolidadoOff).toBeDisabled();
    expect((consolidadoOff as HTMLInputElement).checked).toBe(false);
    sinCliente.unmount();

    // With a client → enabled and dispatching SET_CONSOLIDADO.
    renderPanel(makeFiltros({ codCli: 10, cliNombre: 'CLIENTE A' }), onCambio);
    const consolidadoOn = screen.getByLabelText('Consolidado');
    expect(consolidadoOn).toBeEnabled();
    fireEvent.click(consolidadoOn);
    expect(onCambio).toHaveBeenCalledWith({ type: 'SET_CONSOLIDADO', consolidado: true });
  });

  it('defaults the panel: today, SOLES, No Facturados', () => {
    const hoy = hoyIso();
    renderPanel();
    expect(screen.getByLabelText('Fecha inicio')).toHaveValue(hoy);
    expect(screen.getByLabelText('Fecha fin')).toHaveValue(hoy);
    expect(screen.getByLabelText('Moneda')).toHaveValue('1');
    expect(screen.getByLabelText('Estado de facturación')).toHaveValue('0');
  });

  it('disables the destino select without a client and enables it with one', () => {
    const sinCliente = renderPanel();
    expect(sinCliente.getByLabelText('Destino')).toBeDisabled();

    sinCliente.unmount();
    const conCliente = renderPanel(makeFiltros({ codCli: 10, cliNombre: 'CLIENTE A' }));
    const destino = conCliente.getByLabelText('Destino') as HTMLSelectElement;
    expect(destino).toBeEnabled();
    expect(conCliente.getByRole('option', { name: 'OFICINA PRINCIPAL' })).toBeInTheDocument();
  });

  it('dispatches SET_PERIODO / SET_MONEDA / SET_IND_FAC on change', () => {
    const onCambio = vi.fn<(action: ValoracionesFilterAction) => void>();
    renderPanel(makeFiltros(), onCambio);

    fireEvent.change(screen.getByLabelText('Fecha inicio'), { target: { value: '2026-01-01' } });
    expect(onCambio).toHaveBeenCalledWith({ type: 'SET_PERIODO', fecIni: '2026-01-01' });

    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: '2' } });
    expect(onCambio).toHaveBeenCalledWith({ type: 'SET_MONEDA', codMon: 2 });

    fireEvent.change(screen.getByLabelText('Estado de facturación'), { target: { value: 'null' } });
    expect(onCambio).toHaveBeenCalledWith({ type: 'SET_IND_FAC', indFac: null });

    fireEvent.click(screen.getByLabelText('Usar fecha de estado (FecSTA)'));
    expect(onCambio).toHaveBeenCalledWith({ type: 'SET_MODO_FECHA', inFsta: true });
  });

  it('invokes onConsultar / onLimpiar from the action buttons', () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Consultar/ }));
    expect(props.onConsultar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Limpiar/ }));
    expect(props.onLimpiar).toHaveBeenCalledTimes(1);
  });

  it('disables the action buttons while querying', () => {
    const { rerender } = render(
      <FiltersPanel
        filtros={makeFiltros()}
        onCambio={vi.fn()}
        onConsultar={vi.fn()}
        onLimpiar={vi.fn()}
        consultando
        destinos={[]}
        destinosCargando={false}
        sedes={[]}
        tiposTrabajador={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /Consultar/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Limpiar/ })).toBeDisabled();
    rerender(
      <FiltersPanel
        filtros={makeFiltros()}
        onCambio={vi.fn()}
        onConsultar={vi.fn()}
        onLimpiar={vi.fn()}
        consultando={false}
        destinos={[]}
        destinosCargando={false}
        sedes={[]}
        tiposTrabajador={[]}
      />,
    );
    expect(screen.getByRole('button', { name: /Consultar/ })).toBeEnabled();
  });
});
