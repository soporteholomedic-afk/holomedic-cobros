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
    onEnviarEmpresa: vi.fn(),
    onExportarExcelEmpresa: vi.fn(),
    onExportarPdfEmpresa: vi.fn(),
    empresaPdfEnCurso: null,
    empresaExcelEnCurso: null,
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

  it('renders 3 icon action buttons (Enviar, Excel, PDF) in EVERY empresa row (U6)', () => {
    renderList();
    for (const empresa of ['EMPRESA DEMO S.A.C.', 'OTRA EMPRESA SRL']) {
      expect(screen.getByLabelText(`Enviar documentos de ${empresa}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Descargar Excel de ${empresa}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`Descargar PDF de ${empresa}`)).toBeInTheDocument();
    }
  });

  it('row Excel button exports ONLY that row and does not open the detail modal (U6)', () => {
    const onExportarExcelEmpresa = vi.fn();
    const onSelectEmpresa = vi.fn();
    renderList({ onExportarExcelEmpresa, onSelectEmpresa });
    fireEvent.click(screen.getByLabelText('Descargar Excel de OTRA EMPRESA SRL'));

    expect(onExportarExcelEmpresa).toHaveBeenCalledTimes(1);
    expect((onExportarExcelEmpresa.mock.calls[0][0] as EmpresaGrupo).empresa).toBe(
      'OTRA EMPRESA SRL',
    );
    // stopPropagation: the row click (detail modal) must NOT fire.
    expect(onSelectEmpresa).not.toHaveBeenCalled();
  });

  it('row PDF button exports ONLY that row (U6)', () => {
    const onExportarPdfEmpresa = vi.fn();
    const onSelectEmpresa = vi.fn();
    renderList({ onExportarPdfEmpresa, onSelectEmpresa });
    fireEvent.click(screen.getByLabelText('Descargar PDF de EMPRESA DEMO S.A.C.'));

    expect(onExportarPdfEmpresa).toHaveBeenCalledTimes(1);
    expect((onExportarPdfEmpresa.mock.calls[0][0] as EmpresaGrupo).empresa).toBe(
      'EMPRESA DEMO S.A.C.',
    );
    expect(onSelectEmpresa).not.toHaveBeenCalled();
  });

  it('row Enviar button opens the email flow for ONLY that row (U6)', () => {
    const onEnviarEmpresa = vi.fn();
    const onSelectEmpresa = vi.fn();
    renderList({ onEnviarEmpresa, onSelectEmpresa });
    fireEvent.click(screen.getByLabelText('Enviar documentos de OTRA EMPRESA SRL'));

    expect(onEnviarEmpresa).toHaveBeenCalledTimes(1);
    expect((onEnviarEmpresa.mock.calls[0][0] as EmpresaGrupo).empresa).toBe('OTRA EMPRESA SRL');
    expect(onSelectEmpresa).not.toHaveBeenCalled();
  });

  it('scopes the Excel loading state to the clicked row only (U7)', () => {
    renderList({ empresaExcelEnCurso: 'EMPRESA DEMO S.A.C.' });
    const target = screen.getByLabelText('Descargar Excel de EMPRESA DEMO S.A.C.');
    expect(target).toBeDisabled();
    // The in-flight row swaps its icon for the spinner.
    expect(target.querySelector('svg')).toHaveClass('animate-spin');

    // Every other row stays enabled with its normal icons (no global spin).
    const otra = screen.getByLabelText('Descargar Excel de OTRA EMPRESA SRL');
    expect(otra).not.toBeDisabled();
    expect(otra.querySelector('svg')).not.toHaveClass('animate-spin');
    expect(screen.getByLabelText('Descargar PDF de EMPRESA DEMO S.A.C.')).not.toBeDisabled();
    expect(screen.getByLabelText('Descargar PDF de OTRA EMPRESA SRL')).not.toBeDisabled();
    expect(screen.getByLabelText('Descargar PDF de OTRA EMPRESA SRL').querySelector('svg')).not.toHaveClass('animate-spin');
  });

  it('scopes the PDF loading state to the clicked row only (U7)', () => {
    renderList({ empresaPdfEnCurso: 'OTRA EMPRESA SRL' });
    const target = screen.getByLabelText('Descargar PDF de OTRA EMPRESA SRL');
    expect(target).toBeDisabled();
    expect(target.querySelector('svg')).toHaveClass('animate-spin');

    const demo = screen.getByLabelText('Descargar PDF de EMPRESA DEMO S.A.C.');
    expect(demo).not.toBeDisabled();
    expect(demo.querySelector('svg')).not.toHaveClass('animate-spin');
    expect(screen.getByLabelText('Descargar Excel de EMPRESA DEMO S.A.C.')).not.toBeDisabled();
    expect(screen.getByLabelText('Descargar Excel de OTRA EMPRESA SRL')).not.toBeDisabled();
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
