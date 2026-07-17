import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockUsePathname = vi.hoisted(() => vi.fn().mockReturnValue('/'));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
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

  it('debe mostrar los ítems de navegación: Inicio, Cobranza, Consolidados, Valoraciones, Areas, Plantillas', () => {
    render(<Sidebar />);
    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Cobranza')).toBeInTheDocument();
    expect(screen.getByText('Consolidados')).toBeInTheDocument();
    expect(screen.getByText('Valoraciones')).toBeInTheDocument();
    expect(screen.getByText('Areas')).toBeInTheDocument();
    expect(screen.getByText('Plantillas')).toBeInTheDocument();
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

  it('debe enlazar Consolidados a "/consolidados"', () => {
    render(<Sidebar />);
    const link = screen.getByText('Consolidados').closest('a');
    expect(link).toHaveAttribute('href', '/consolidados');
  });

  // PR 4 — Task 4.7: "Add nav entry 'Plantillas' → /admin/plantillas/consolidados"
  it('debe enlazar Plantillas a "/admin/plantillas/consolidados"', () => {
    render(<Sidebar />);
    const link = screen.getByText('Plantillas').closest('a');
    expect(link).toHaveAttribute('href', '/admin/plantillas/consolidados');
  });

  it('debe mostrar Consolidados entre Cobranza y Valoraciones en el orden de navegación', () => {
    render(<Sidebar />);
    const navLinks = screen.getAllByRole('link').map((l) => l.textContent?.trim());
    const cobranzaIdx = navLinks.indexOf('Cobranza');
    const consolidadosIdx = navLinks.indexOf('Consolidados');
    const valoracionesIdx = navLinks.indexOf('Valoraciones');
    expect(cobranzaIdx).toBeLessThan(consolidadosIdx);
    expect(consolidadosIdx).toBeLessThan(valoracionesIdx);
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

  describe('AreasMenuItem dropdown', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/');
    });

    it('debe mostrar el trigger "Areas" con aria-expanded=false inicialmente', () => {
      render(<Sidebar />);
      const trigger = screen.getByRole('button', { name: /Areas/i });
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('debe mostrar los 3 sub-ítems al hacer click en el trigger', () => {
      render(<Sidebar />);
      const trigger = screen.getByRole('button', { name: /Areas/i });
      fireEvent.click(trigger);

      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();
      expect(screen.getByText('Medicina')).toBeInTheDocument();
      expect(screen.getByText('Calidad')).toBeInTheDocument();
    });

    it('debe ocultar los sub-ítems al hacer click nuevamente en el trigger', () => {
      render(<Sidebar />);
      const trigger = screen.getByRole('button', { name: /Areas/i });
      fireEvent.click(trigger);
      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.queryByText('MusculoEsqueletica')).not.toBeInTheDocument();
    });

    it('cada sub-ítem debe enlazar a su ruta /areas/<slug>', () => {
      render(<Sidebar />);
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));

      const musculo = screen.getByText('MusculoEsqueletica').closest('a');
      expect(musculo).toHaveAttribute('href', '/areas/musculoesqueletica');

      const medicina = screen.getByText('Medicina').closest('a');
      expect(medicina).toHaveAttribute('href', '/areas/medicina');

      const calidad = screen.getByText('Calidad').closest('a');
      expect(calidad).toHaveAttribute('href', '/areas/calidad');
    });

    it('debe cerrar el dropdown al hacer click fuera', () => {
      render(<Sidebar />);
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));
      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      expect(screen.queryByText('MusculoEsqueletica')).not.toBeInTheDocument();
    });

    it('debe cerrar el dropdown al presionar Escape', () => {
      render(<Sidebar />);
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));
      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('MusculoEsqueletica')).not.toBeInTheDocument();
    });

    it('debe marcar como activo el sub-ítem correspondiente a la ruta actual', () => {
      mockUsePathname.mockReturnValue('/areas/medicina');
      render(<Sidebar />);
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));

      const medicinaLink = screen.getByText('Medicina').closest('a');
      expect(medicinaLink).toHaveAttribute('href', '/areas/medicina');
      expect(screen.getByText('Medicina')).toBeInTheDocument();
    });

    it('debe cambiar aria-expanded a true al abrir el dropdown', () => {
      render(<Sidebar />);
      const trigger = screen.getByRole('button', { name: /Areas/i });
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
