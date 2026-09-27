import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Buscador } from './Buscador';

/**
 * UI contract for the panel search box (task 8.3, spec OP-3): a
 * labelled text input with the mock-verbatim placeholder, filtering
 * live as the operator types (every keystroke reports the new value
 * through onCambiar — the mock's oninput behavior; the actual row
 * matching lives in filtrarFilas, already pure-tested in 8.1).
 */

describe('Buscador — búsqueda en vivo', () => {
  it('renders a labelled textbox with the mock-verbatim placeholder', () => {
    render(<Buscador valor="" onCambiar={() => {}} />);

    const caja = screen.getByRole('textbox', { name: 'Buscar' });
    expect(caja).toHaveAttribute('placeholder', 'Buscar por nombre de empresa o persona...');
    expect(caja).toHaveValue('');
  });

  it('reports every keystroke through onCambiar (live filtering)', async () => {
    // Controlled-parent harness: Buscador is a controlled input, so the
    // accumulated value only exists when the parent actually stores it —
    // exactly how PanelCrm wires it (static valor="" would reset the DOM
    // value per keystroke and each call would carry a single character).
    const onCambiar = vi.fn();
    function CajaControlada() {
      const [valor, setValor] = useState('');
      return (
        <Buscador
          valor={valor}
          onCambiar={(nuevo) => {
            setValor(nuevo);
            onCambiar(nuevo);
          }}
        />
      );
    }
    render(<CajaControlada />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar' }), 'acme');
    expect(onCambiar).toHaveBeenCalledTimes(4);
    expect(onCambiar).toHaveBeenLastCalledWith('acme');
  });

  it('shows the controlled value it receives (refresh keeps the term)', () => {
    render(<Buscador valor="construcción" onCambiar={() => {}} />);

    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('construcción');
  });
});
