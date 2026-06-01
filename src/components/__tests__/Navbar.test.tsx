import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Navbar from '../Navbar';

describe('Navbar Component', () => {
  it('debe renderizar el título del logo y marca', () => {
    render(<Navbar onReset={vi.fn()} hasData={false} />);
    expect(screen.getByText('Holomedic')).toBeInTheDocument();
    expect(screen.getByText('Cobros & Saldos')).toBeInTheDocument();
  });

  it('debe mostrar el botón para cargar nuevo Excel sólo si hay datos cargados (hasData)', () => {
    const { rerender } = render(<Navbar onReset={vi.fn()} hasData={false} />);
    expect(screen.queryByText('Cargar nuevo Excel')).not.toBeInTheDocument();

    rerender(<Navbar onReset={vi.fn()} hasData={true} />);
    expect(screen.getByText('Cargar nuevo Excel')).toBeInTheDocument();
  });

  it('debe llamar a onReset al presionar en el logo o en el botón de cargar nuevo', () => {
    const onReset = vi.fn();
    render(<Navbar onReset={onReset} hasData={true} />);

    // Presionar en el título del logo
    const brand = screen.getByText('Holomedic');
    fireEvent.click(brand);
    expect(onReset).toHaveBeenCalledTimes(1);

    // Presionar en el botón "Cargar nuevo Excel"
    const button = screen.getByText('Cargar nuevo Excel');
    fireEvent.click(button);
    expect(onReset).toHaveBeenCalledTimes(2);
  });
});
