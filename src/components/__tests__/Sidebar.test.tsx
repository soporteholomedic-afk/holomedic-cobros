import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, onClick, ...props }: { children: React.ReactNode; href: string; onClick?: () => void }) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}));

import Sidebar from '../Sidebar';

describe('Sidebar Component', () => {
  it('debe mostrar la marca "Holomedic" con subtítulo "Facturación"', () => {
    render(<Sidebar />);
    expect(screen.getByText('Holomedic')).toBeInTheDocument();
    expect(screen.getByText('Facturación')).toBeInTheDocument();
  });

  it('debe mostrar los ítems de navegación: Inicio, Cobranza, Valoraciones', () => {
    render(<Sidebar />);
    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Cobranza')).toBeInTheDocument();
    expect(screen.getByText('Valoraciones')).toBeInTheDocument();
  });

  it('debe enlazar Inicio a "/"', () => {
    render(<Sidebar />);
    const link = screen.getByText('Inicio').closest('a');
    expect(link).toHaveAttribute('href', '/');
  });

  it('debe enlazar Cobranza a "/cobranza"', () => {
    render(<Sidebar />);
    const link = screen.getByText('Cobranza').closest('a');
    expect(link).toHaveAttribute('href', '/cobranza');
  });

  it('debe enlazar Valoraciones a "/valoraciones"', () => {
    render(<Sidebar />);
    const link = screen.getByText('Valoraciones').closest('a');
    expect(link).toHaveAttribute('href', '/valoraciones');
  });

  it('debe mostrar el botón hamburguesa en mobile con aria-label', () => {
    render(<Sidebar />);
    const button = screen.getByLabelText('Abrir menú');
    expect(button).toBeInTheDocument();
  });

  it('debe cambiar aria-label a "Cerrar menú" al hacer click en hamburguesa', () => {
    render(<Sidebar />);
    const button = screen.getByLabelText('Abrir menú');
    fireEvent.click(button);
    expect(screen.getByLabelText('Cerrar menú')).toBeInTheDocument();
  });

  it('la marca debe enlazar a "/"', () => {
    render(<Sidebar />);
    const brandLink = screen.getByText('Holomedic').closest('a');
    expect(brandLink).toHaveAttribute('href', '/');
  });
});
