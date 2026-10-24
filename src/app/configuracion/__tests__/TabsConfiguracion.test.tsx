import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Tests for the `/configuracion` tab bar (feature `configuracion-tabs`).
 *
 * The bar is a pure projection of the session permisos onto the three
 * tab routes: `admin` → Usuarios + Áreas, `firma_correo` → Mi Firma.
 * Active state follows the pathname with a trailing-slash-safe prefix
 * match.
 */

const mockUsePathname = vi.hoisted(() => vi.fn(() => '/configuracion/usuarios'));
const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

vi.mock('@/features/auth/presentation/hooks/useAuth', () => ({
  useAuth: mockUseAuth,
}));

import TabsConfiguracion from '../TabsConfiguracion';

function mockSesion(permisos: string[]) {
  mockUseAuth.mockReturnValue({ user: { permisos }, loading: false });
}

describe('TabsConfiguracion — visibilidad por permiso', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/configuracion/usuarios');
  });

  it('muestra Usuarios y Áreas — y NO Mi Firma — para una sesión admin', () => {
    mockSesion(['admin']);
    render(<TabsConfiguracion />);
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
    expect(screen.getByText('Áreas')).toBeInTheDocument();
    expect(screen.queryByText('Mi Firma')).not.toBeInTheDocument();
  });

  it('muestra SOLO Mi Firma para una sesión firma_correo sin admin', () => {
    mockSesion(['firma_correo']);
    render(<TabsConfiguracion />);
    expect(screen.getByText('Mi Firma')).toBeInTheDocument();
    expect(screen.queryByText('Usuarios')).not.toBeInTheDocument();
    expect(screen.queryByText('Áreas')).not.toBeInTheDocument();
  });

  it('muestra las tres tabs con admin + firma_correo', () => {
    mockSesion(['admin', 'firma_correo']);
    render(<TabsConfiguracion />);
    expect(screen.getByText('Usuarios')).toBeInTheDocument();
    expect(screen.getByText('Áreas')).toBeInTheDocument();
    expect(screen.getByText('Mi Firma')).toBeInTheDocument();
  });

  it('no renderiza nada sin permisos de tab', () => {
    mockSesion([]);
    const { container } = render(<TabsConfiguracion />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TabsConfiguracion — enlaces y estado activo', () => {
  beforeEach(() => {
    mockSesion(['admin', 'firma_correo']);
  });

  it('cada tab enlaza a su sub-ruta con su propio permiso', () => {
    render(<TabsConfiguracion />);
    expect(screen.getByText('Usuarios').closest('a')).toHaveAttribute(
      'href',
      '/configuracion/usuarios',
    );
    expect(screen.getByText('Áreas').closest('a')).toHaveAttribute(
      'href',
      '/configuracion/areas',
    );
    expect(screen.getByText('Mi Firma').closest('a')).toHaveAttribute(
      'href',
      '/configuracion/firma',
    );
  });

  it('marca como activa la tab de la ruta actual (aria-current)', () => {
    mockUsePathname.mockReturnValue('/configuracion/firma');
    render(<TabsConfiguracion />);
    expect(screen.getByText('Mi Firma').closest('a')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText('Usuarios').closest('a')).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('marca la tab activa también en sub-rutas (prefijo con borde)', () => {
    mockUsePathname.mockReturnValue('/configuracion/usuarios/otra-cosa');
    render(<TabsConfiguracion />);
    expect(screen.getByText('Usuarios').closest('a')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('no marca ninguna tab en rutas que solo comparten prefijo textual', () => {
    mockUsePathname.mockReturnValue('/configuracion-otra');
    render(<TabsConfiguracion />);
    for (const label of ['Usuarios', 'Áreas', 'Mi Firma']) {
      expect(screen.getByText(label).closest('a')).not.toHaveAttribute('aria-current');
    }
  });
});
