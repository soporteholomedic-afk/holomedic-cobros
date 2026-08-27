import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { EmpresaGrupo } from '../../../domain/entities';
import { makeRepFacturacion } from '../../../domain/fixtures';
import { EmpresaList } from '../EmpresaList';

function makeGrupo(overrides: Partial<EmpresaGrupo> = {}): EmpresaGrupo {
  return {
    empresa: 'EMPRESA DEMO S.A.C.',
    rows: [makeRepFacturacion()],
    cantidad: 1,
    subtotal: 100,
    igv: 18,
    total: 118,
    simbol: 's/.',
    ...overrides,
  };
}

function renderList(overrides: Partial<Parameters<typeof EmpresaList>[0]> = {}) {
  const props = {
    grupos: [makeGrupo(), makeGrupo({ empresa: 'OTRA EMPRESA SRL', simbol: '$', subtotal: 50, igv: 9, total: 59 })],
    status: 'ready' as const,
    error: null,
    totalRegistros: 2,
    onSelectEmpresa: vi.fn(),
    ...overrides,
  };
  const utils = render(<EmpresaList {...props} />);
  return { ...utils, props };
}

describe('EmpresaList', () => {
  it('renders idle guidance before the first query', () => {
    renderList({ status: 'idle', grupos: [] });
    expect(screen.getByText('Ingrese los filtros y presione Consultar.')).toBeInTheDocument();
  });

  it('renders a loading row while querying', () => {
    renderList({ status: 'loading', grupos: [] });
    expect(screen.getByText('Consultando valorizaciones…')).toBeInTheDocument();
  });

  it('renders the API error as an alert', () => {
    renderList({ status: 'error', error: 'Error al consultar las valorizaciones. Intente nuevamente.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Error al consultar las valorizaciones');
  });

  it('renders ready groups with moneda-aware amounts and totals (Q-R6)', () => {
    renderList();
    expect(screen.getByText('EMPRESA DEMO S.A.C.')).toBeInTheDocument();
    expect(screen.getByText('OTRA EMPRESA SRL')).toBeInTheDocument();
    // SOLES group renders its own symbol on subtotal and total.
    expect(screen.getByText('s/. 100.00')).toBeInTheDocument();
    expect(screen.getByText('s/. 118.00')).toBeInTheDocument();
    // DOLARES group: same columns, dollar symbol.
    expect(screen.getByText('$ 59.00')).toBeInTheDocument();
    expect(screen.getByText('2 registros · 2 empresas')).toBeInTheDocument();
  });

  it('reports the selected group on row click', () => {
    const onSelectEmpresa = vi.fn();
    renderList({ onSelectEmpresa });
    fireEvent.click(screen.getByText('EMPRESA DEMO S.A.C.'));
    expect(onSelectEmpresa).toHaveBeenCalledTimes(1);
    const grupo = onSelectEmpresa.mock.calls[0][0] as EmpresaGrupo;
    expect(grupo.empresa).toBe('EMPRESA DEMO S.A.C.');
  });

  it('filters groups by the search box', () => {
    renderList();
    fireEvent.change(screen.getByLabelText('Buscar empresa'), { target: { value: 'OTRA' } });
    expect(screen.getByText('OTRA EMPRESA SRL')).toBeInTheDocument();
    expect(screen.queryByText('EMPRESA DEMO S.A.C.')).not.toBeInTheDocument();
  });

  it('shows the empty state for a ready query with no rows', () => {
    renderList({ grupos: [], totalRegistros: 0 });
    expect(
      screen.getByText('No se encontraron valorizaciones para los filtros seleccionados.'),
    ).toBeInTheDocument();
  });
});
