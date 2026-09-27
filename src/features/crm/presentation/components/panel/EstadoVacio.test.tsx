import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EstadoVacio } from './EstadoVacio';

/**
 * UI contract for the empty state (task 8.3, spec OP-3): when the
 * active tab + search match nothing, the panel shows the mock-verbatim
 * copy — "No hay empresas que mostrar" / "Prueba quitando los filtros
 * o registra una nueva empresa para empezar." — and the
 * "+ Anotar Empresa" CTA reports itself through onAnotar (wired by
 * PanelCrm; interim target is the alta page until 10.2's modal).
 */

describe('EstadoVacio — sin resultados', () => {
  it('renders the mock-verbatim heading and guidance copy', () => {
    render(<EstadoVacio onAnotar={() => {}} />);

    expect(screen.getByText('No hay empresas que mostrar')).toBeInTheDocument();
    expect(
      screen.getByText('Prueba quitando los filtros o registra una nueva empresa para empezar.'),
    ).toBeInTheDocument();
  });

  it('fires onAnotar from the "+ Anotar Empresa" CTA', async () => {
    const onAnotar = vi.fn();
    render(<EstadoVacio onAnotar={onAnotar} />);

    await userEvent.click(screen.getByRole('button', { name: '+ Anotar Empresa' }));
    expect(onAnotar).toHaveBeenCalledTimes(1);
  });
});
