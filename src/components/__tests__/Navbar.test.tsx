import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Navbar from '../Navbar';

// Mock next/navigation Link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('Navbar Component', () => {
  it('debe renderizar el logo "Holomedic" y el subtítulo "Facturación & Saldos"', () => {
    render(<Navbar onReset={vi.fn()} hasData={false} />);
    expect(screen.getByText('Holomedic')).toBeInTheDocument();
    expect(screen.getByText('Facturación & Saldos')).toBeInTheDocument();
  });

  it('debe mostrar el botón para cargar nuevo Excel sólo si hay datos cargados (hasData)', () => {
    const { rerender } = render(<Navbar onReset={vi.fn()} hasData={false} />);
    expect(screen.queryByText('Cargar nuevo Excel')).not.toBeInTheDocument();

    rerender(<Navbar onReset={vi.fn()} hasData={true} />);
    expect(screen.getByText('Cargar nuevo Excel')).toBeInTheDocument();
  });

  it('debe navegar a "/" al presionar en la marca Holomedic (vía Link)', () => {
    const onReset = vi.fn();
    render(<Navbar onReset={onReset} hasData={true} />);

    // Brand link should navigate to /
    const brandLink = screen.getByText('Holomedic').closest('a');
    expect(brandLink).toHaveAttribute('href', '/');
  });

  it('debe llamar a onReset al presionar el botón "Cargar nuevo Excel"', () => {
    const onReset = vi.fn();
    render(<Navbar onReset={onReset} hasData={true} />);

    const button = screen.getByText('Cargar nuevo Excel');
    fireEvent.click(button);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
