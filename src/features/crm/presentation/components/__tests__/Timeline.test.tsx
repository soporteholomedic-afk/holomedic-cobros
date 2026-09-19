import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Timeline } from '../Timeline';
import type { HandoffHistorial, TransicionHistorial } from '../../../domain/ports';

const transiciones: TransicionHistorial[] = [
  {
    id: 9,
    empresaId: 42,
    flujoPrevio: 'INBOUND',
    etapaPrevia: 'REGISTRADO',
    flujoNuevo: 'INBOUND',
    etapaNueva: 'SEGUIMIENTO',
    evento: 'CotizaciónEnviada',
    motivo: null,
    usuario: 'jperez',
    createdAt: '2026-09-02T10:30:00.000Z',
  },
  {
    id: 12,
    empresaId: 42,
    flujoPrevio: 'INBOUND',
    etapaPrevia: 'SEGUIMIENTO',
    flujoNuevo: 'INBOUND',
    etapaNueva: 'RECHAZADO',
    evento: 'Rechazo',
    motivo: 'Ya tiene proveedor',
    usuario: 'mgarcia',
    createdAt: '2026-09-10T08:00:00.000Z',
  },
];

const handoffs: HandoffHistorial[] = [
  {
    id: 4,
    empresaId: 42,
    area: 'Operaciones',
    nota: 'Coordinar entrega',
    usuario: 'jperez',
    createdAt: '2026-09-15T12:00:00.000Z',
  },
];

describe('Timeline', () => {
  it('renders each transition with who, when, from and to (spec G4 audit)', () => {
    render(<Timeline transiciones={transiciones} handoffs={[]} />);

    // Newest first, as the API orders them.
    const filaRechazo = screen.getByText('Rechazar').closest('li');
    expect(filaRechazo).toHaveTextContent('mgarcia');
    expect(filaRechazo).toHaveTextContent('10/09/2026 08:00');
    expect(filaRechazo).toHaveTextContent('Seguimiento');
    expect(filaRechazo).toHaveTextContent('Rechazado');

    const filaCotizacion = screen.getByText('Cotización enviada').closest('li');
    expect(filaCotizacion).toHaveTextContent('jperez');
    expect(filaCotizacion).toHaveTextContent('02/09/2026 10:30');
    expect(filaCotizacion).toHaveTextContent('Registrado');
    expect(filaCotizacion).toHaveTextContent('Seguimiento');
  });

  it('shows the rejection motivo next to the transition that recorded it', () => {
    render(<Timeline transiciones={transiciones} handoffs={[]} />);

    const filaRechazo = screen.getByText('Rechazar').closest('li');
    expect(filaRechazo).toHaveTextContent('Ya tiene proveedor');
  });

  it('renders each handoff with área, nota, usuario and date', () => {
    render(<Timeline transiciones={[]} handoffs={handoffs} />);

    const fila = screen.getByText('Operaciones').closest('li');
    expect(fila).toHaveTextContent('Coordinar entrega');
    expect(fila).toHaveTextContent('jperez');
    expect(fila).toHaveTextContent('15/09/2026 12:00');
  });

  it('shows explicit empty states when there is no history yet', () => {
    render(<Timeline transiciones={[]} handoffs={[]} />);

    expect(screen.getByText('Sin transiciones registradas.')).toBeInTheDocument();
    expect(screen.getByText('Sin handoffs registrados.')).toBeInTheDocument();
  });
});
