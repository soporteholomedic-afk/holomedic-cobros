import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ConteosPanel } from '../../panelDerivado';
import { TabsFiltro } from './TabsFiltro';

/**
 * UI contract for the 7 filter tabs (task 8.3, spec OP-3): the labels
 * are the TABS_PANEL mock-verbatim strings (emoji prefixes included —
 * flagged for the maintainer, kept as-is), each shows the LIVE count
 * that derivarPanel tallied into conteos, the active tab is marked
 * with aria-pressed, and clicking a tab reports it via onSeleccionar.
 */

function conteos(overrides: Partial<ConteosPanel> = {}): ConteosPanel {
  return {
    todas: 12,
    enEspera: 5,
    positivos: 2,
    pausa3m: 2,
    reactivados: 1,
    sinInteres: 3,
    faltaCarta: 1,
    clientes: 8,
    posibles: 4,
    ...overrides,
  };
}

describe('TabsFiltro — 7 pestañas con conteo en vivo', () => {
  it('renders exactly the 7 mock-verbatim tabs, each with its live count', () => {
    render(<TabsFiltro conteos={conteos()} activa="todas" onSeleccionar={() => {}} />);

    const botones = screen.getAllByRole('button');
    expect(botones).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Todas (12)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'En espera (5)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '👍 Positivos (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '💤 Pausa 3 meses (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '🔔 Reactivados (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '👎 Sin interés (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Falta carta (1)' })).toBeInTheDocument();
  });

  it('marks ONLY the active tab with aria-pressed', () => {
    render(<TabsFiltro conteos={conteos()} activa="sin_interes" onSeleccionar={() => {}} />);

    expect(screen.getByRole('button', { name: '👎 Sin interés (3)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const activas = screen
      .getAllByRole('button')
      .filter((boton) => boton.getAttribute('aria-pressed') === 'true');
    expect(activas).toHaveLength(1);
  });

  it('reports the clicked tab key via onSeleccionar', async () => {
    const onSeleccionar = vi.fn();
    render(<TabsFiltro conteos={conteos()} activa="todas" onSeleccionar={onSeleccionar} />);

    await userEvent.click(screen.getByRole('button', { name: '💤 Pausa 3 meses (2)' }));
    expect(onSeleccionar).toHaveBeenCalledTimes(1);
    expect(onSeleccionar).toHaveBeenCalledWith('pausa_3m');
  });

  it('re-renders counts when a new derivation lands (silent refresh)', () => {
    const { rerender } = render(
      <TabsFiltro conteos={conteos()} activa="todas" onSeleccionar={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Todas (12)' })).toBeInTheDocument();

    rerender(<TabsFiltro conteos={conteos({ todas: 13, faltaCarta: 2 })} activa="todas" onSeleccionar={() => {}} />);
    expect(screen.getByRole('button', { name: 'Todas (13)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Falta carta (2)' })).toBeInTheDocument();
  });
});
