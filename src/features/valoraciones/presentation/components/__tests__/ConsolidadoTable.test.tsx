import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ConsolidadoFila, DestinoTotal } from '../../../domain/consolidado';
import { ConsolidadoTable } from '../ConsolidadoTable';

const filas: ConsolidadoFila[] = [
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
  {
    codCli: 55,
    nomCom: 'EMPRESA DEMO',
    codDes: 101,
    desDes: 'SEDE NORTE',
    desTCh: 'EXAMEN ADICIONAL',
    canEva: 1,
    importe: 118,
    venta: 100,
  },
  {
    codCli: 55,
    nomCom: 'EMPRESA DEMO',
    codDes: 102,
    desDes: 'SEDE SUR',
    desTCh: 'PERIODICO',
    canEva: 2,
    importe: 236,
    venta: 200,
  },
];

const totales: DestinoTotal[] = [
  { nomCom: 'EMPRESA DEMO', desDes: 'SEDE NORTE', codDes: 101, subtotal: 1000, igv: 180, total: 1180 },
  { nomCom: 'EMPRESA DEMO', desDes: 'SEDE SUR', codDes: 102, subtotal: 200, igv: 36, total: 236 },
];

describe('ConsolidadoTable', () => {
  it('renders filas grouped by destino with per-destino SubTotal/IGV/Total rows', () => {
    render(
      <ConsolidadoTable filas={filas} totales={totales} status="ready" error={null} />,
    );

    // Group headers for both destinos (fila cells + totals labels repeat names).
    expect(screen.getAllByText('SEDE NORTE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SEDE SUR').length).toBeGreaterThan(0);

    // Detail rows keep the SIGLA description + moneda-aware (MN) amounts.
    expect(screen.getByText('PREOCUPACIONAL')).toBeInTheDocument();
    expect(screen.getByText('EXAMEN ADICIONAL')).toBeInTheDocument();
    expect(screen.getByText('PERIODICO')).toBeInTheDocument();

    // Totals per destino: 1000/180/1180 and 200/36/236 (formatted es-PE).
    expect(screen.getAllByText(/1,000\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/180\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,180\.00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/236\.00/).length).toBeGreaterThan(0);
  });

  it('shows the loading state while consulting', () => {
    render(<ConsolidadoTable filas={[]} totales={[]} status="loading" error={null} />);
    expect(screen.getByText(/Consultando/i)).toBeInTheDocument();
  });

  it('shows the API error message on failure', () => {
    render(
      <ConsolidadoTable filas={[]} totales={[]} status="error" error="Error al consultar" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Error al consultar');
  });

  it('shows an empty state when a ready query returns no filas', () => {
    render(<ConsolidadoTable filas={[]} totales={[]} status="ready" error={null} />);
    expect(screen.getByText(/No se encontraron/i)).toBeInTheDocument();
  });
});
