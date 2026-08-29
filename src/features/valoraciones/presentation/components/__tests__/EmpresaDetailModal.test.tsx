import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { agruparPorEmpresa } from '../../../domain/agrupacion';
import { makeRepFacturacion } from '../../../domain/fixtures';
import { EmpresaDetailModal } from '../EmpresaDetailModal';

describe('EmpresaDetailModal', () => {
  it('renders summary cards and detail rows with SOLES amounts', () => {
    const rows = [makeRepFacturacion()];
    const [grupo] = agruparPorEmpresa(rows, 1);
    const onClose = vi.fn();
    render(<EmpresaDetailModal grupo={grupo} codMon={1} onClose={onClose} />);

    expect(screen.getByText('EMPRESA DEMO S.A.C.')).toBeInTheDocument();
    // Subtotal appears in the summary card AND the single row's Venta
    // column — assert presence, not uniqueness.
    expect(screen.getAllByText('s/. 100.00').length).toBeGreaterThan(0);
    expect(screen.getByText('s/. 18.00')).toBeInTheDocument(); // IGV 18%
    expect(screen.getByText('s/. 118.00')).toBeInTheDocument(); // total
    expect(screen.getByText('CANCINO CUEVA NOELIA ISABEL')).toBeInTheDocument();
    expect(screen.getByText('DNI 46145583')).toBeInTheDocument();
    expect(screen.getByText('PREOCUPACIONAL')).toBeInTheDocument();
    // FecAte renders dd/MM/yyyy.
    expect(screen.getByText('20/08/2026')).toBeInTheDocument();
  });

  it('renders *MO amounts when the query ran with CodMon = 2 (Q-R6)', () => {
    const rows = [
      makeRepFacturacion({ CodMon: 2, DesMon: 'DOLARES', Simbol: '$', VVtaMN: 999, VVtaMO: 200 }),
    ];
    const [grupo] = agruparPorEmpresa(rows, 2);
    render(<EmpresaDetailModal grupo={grupo} codMon={2} onClose={vi.fn()} />);

    // Subtotal from VVtaMO (200), NOT VVtaMN (999). The value shows in
    // both the summary card and the row's Venta column.
    expect(screen.getAllByText('$ 200.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('$ 999.00')).not.toBeInTheDocument();
  });

  it('closes via the close button and the Escape key', () => {
    const rows = [makeRepFacturacion()];
    const [grupo] = agruparPorEmpresa(rows, 1);
    const onClose = vi.fn();
    render(<EmpresaDetailModal grupo={grupo} codMon={1} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders the Estado cell verbatim from the entity label (R2/R6)', () => {
    const rows = [makeRepFacturacion()]; // fixture now carries 'CREDITO'
    const [grupo] = agruparPorEmpresa(rows, 1);
    render(<EmpresaDetailModal grupo={grupo} codMon={1} onClose={vi.fn()} />);

    expect(screen.getByText('CREDITO')).toBeInTheDocument();
  });

  it('still renders a fallback-estado row in position (R4 — no row dropped)', () => {
    const rows = [
      makeRepFacturacion(),
      makeRepFacturacion({
        EstCob: '\u2014', // U+2014 fallback from a NULL/unknown SP code
        Pacien: 'PACIENTE SIN DATO',
        IdAten: '000124',
        ItemEx: 2,
      }),
    ];
    const [grupo] = agruparPorEmpresa(rows, 1);
    render(<EmpresaDetailModal grupo={grupo} codMon={1} onClose={vi.fn()} />);

    expect(screen.getByText('PACIENTE SIN DATO')).toBeInTheDocument();
    expect(screen.getByText('\u2014')).toBeInTheDocument();
    // Row parity: both rows survived grouping and rendering.
    expect(grupo.rows).toHaveLength(2);
  });
});
