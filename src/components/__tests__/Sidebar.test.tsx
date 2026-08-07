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
import { AuthProvider, type AuthUser } from '@/features/auth/presentation/hooks/useAuth';

const nonAdminUser: AuthUser = {
  idUsuario: 'u-cobranza',
  nombre: 'Ana Cobranza',
  area: 'Cobranza',
  permisos: ['cobranza'],
  activo: true,
};

function mockAuthMe(user: AuthUser | null): void {
  global.fetch = vi.fn().mockImplementation((url: string) =>
    url === '/api/auth/me'
      ? Promise.resolve(user
          ? { ok: true, json: () => Promise.resolve({ usuario: user }) }
          : { ok: false })
      : Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  ) as unknown as typeof fetch;
}

const renderSidebar = () =>
  render(
    <AuthProvider>
      <Sidebar />
    </AuthProvider>,
  );

describe('Sidebar Component', () => {
  beforeEach(() => {
    mockAuthMe(nonAdminUser);
  });

  it('debe mostrar la marca "Holomedic" con subtítulo "Facturación"', () => {
    renderSidebar();
    expect(screen.getByText('Holomedic')).toBeInTheDocument();
    expect(screen.getByText('Facturación')).toBeInTheDocument();
  });

  it('debe mostrar los ítems de navegación: Inicio, Cobranza, Consolidados, Valoraciones, Areas, Plantillas', () => {
    renderSidebar();
    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Cobranza')).toBeInTheDocument();
    expect(screen.getByText('Consolidados')).toBeInTheDocument();
    expect(screen.getByText('Valoraciones')).toBeInTheDocument();
    expect(screen.getByText('Areas')).toBeInTheDocument();
    expect(screen.getByText('Plantillas')).toBeInTheDocument();
  });

  it('debe enlazar Inicio a "/"', () => {
    renderSidebar();
    const link = screen.getByText('Inicio').closest('a');
    expect(link).toHaveAttribute('href', '/');
  });

  it('debe enlazar Cobranza a "/cobranza"', () => {
    renderSidebar();
    const link = screen.getByText('Cobranza').closest('a');
    expect(link).toHaveAttribute('href', '/cobranza');
  });

  it('debe enlazar Valoraciones a "/valoraciones"', () => {
    renderSidebar();
    const link = screen.getByText('Valoraciones').closest('a');
    expect(link).toHaveAttribute('href', '/valoraciones');
  });

  it('debe enlazar Consolidados a "/consolidados"', () => {
    renderSidebar();
    const link = screen.getByText('Consolidados').closest('a');
    expect(link).toHaveAttribute('href', '/consolidados');
  });

  // PR 4 — Task 4.7: "Add nav entry 'Plantillas' → /admin/plantillas/consolidados"
  it('debe enlazar Plantillas a "/admin/plantillas/consolidados"', () => {
    renderSidebar();
    const link = screen.getByText('Plantillas').closest('a');
    expect(link).toHaveAttribute('href', '/admin/plantillas/consolidados');
  });

  it('debe mostrar Consolidados entre Cobranza y Valoraciones en el orden de navegación', () => {
    renderSidebar();
    const navLinks = screen.getAllByRole('link').map((l) => l.textContent?.trim());
    const cobranzaIdx = navLinks.indexOf('Cobranza');
    const consolidadosIdx = navLinks.indexOf('Consolidados');
    const valoracionesIdx = navLinks.indexOf('Valoraciones');
    expect(cobranzaIdx).toBeLessThan(consolidadosIdx);
    expect(consolidadosIdx).toBeLessThan(valoracionesIdx);
  });

  it('debe mostrar el botón hamburguesa en mobile con aria-label', () => {
    renderSidebar();
    const button = screen.getByLabelText('Abrir menú');
    expect(button).toBeInTheDocument();
  });

  it('debe cambiar aria-label a "Cerrar menú" al hacer click en hamburguesa', () => {
    renderSidebar();
    const button = screen.getByLabelText('Abrir menú');
    fireEvent.click(button);
    expect(screen.getByLabelText('Cerrar menú')).toBeInTheDocument();
  });

  it('la marca debe enlazar a "/"', () => {
    renderSidebar();
    const brandLink = screen.getByText('Holomedic').closest('a');
    expect(brandLink).toHaveAttribute('href', '/');
  });

  describe('AreasMenuItem dropdown', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/');
    });

    it('debe mostrar el trigger "Areas" con aria-expanded=false inicialmente', () => {
      renderSidebar();
      const trigger = screen.getByRole('button', { name: /Areas/i });
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('debe mostrar los 3 sub-ítems al hacer click en el trigger', () => {
      renderSidebar();
      const trigger = screen.getByRole('button', { name: /Areas/i });
      fireEvent.click(trigger);

      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();
      expect(screen.getByText('Medicina')).toBeInTheDocument();
      expect(screen.getByText('Calidad')).toBeInTheDocument();
    });

    it('debe ocultar los sub-ítems al hacer click nuevamente en el trigger', () => {
      renderSidebar();
      const trigger = screen.getByRole('button', { name: /Areas/i });
      fireEvent.click(trigger);
      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.queryByText('MusculoEsqueletica')).not.toBeInTheDocument();
    });

    it('cada sub-ítem debe enlazar a su ruta /areas/<slug>', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));

      const musculo = screen.getByText('MusculoEsqueletica').closest('a');
      expect(musculo).toHaveAttribute('href', '/areas/musculoesqueletica');

      const medicina = screen.getByText('Medicina').closest('a');
      expect(medicina).toHaveAttribute('href', '/areas/medicina');

      const calidad = screen.getByText('Calidad').closest('a');
      expect(calidad).toHaveAttribute('href', '/areas/calidad');
    });

    it('debe cerrar el dropdown al hacer click fuera', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));
      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      expect(screen.queryByText('MusculoEsqueletica')).not.toBeInTheDocument();
    });

    it('debe cerrar el dropdown al presionar Escape', () => {
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));
      expect(screen.getByText('MusculoEsqueletica')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('MusculoEsqueletica')).not.toBeInTheDocument();
    });

    it('debe marcar como activo el sub-ítem correspondiente a la ruta actual', () => {
      mockUsePathname.mockReturnValue('/areas/medicina');
      renderSidebar();
      fireEvent.click(screen.getByRole('button', { name: /Areas/i }));

      const medicinaLink = screen.getByText('Medicina').closest('a');
      expect(medicinaLink).toHaveAttribute('href', '/areas/medicina');
      expect(screen.getByText('Medicina')).toBeInTheDocument();
    });

    it('debe cambiar aria-expanded a true al abrir el dropdown', () => {
      renderSidebar();
      const trigger = screen.getByRole('button', { name: /Areas/i });
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
