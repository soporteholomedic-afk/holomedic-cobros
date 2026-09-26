import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';

import { NavCrm } from '../NavCrm';

/**
 * UI contract for the CRM section navigation (post-verify UX
 * remediation): five entries in the product owner's flow order —
 * Empresas, Cola de hoy, Mi cartera, Importar, Productividad — with
 * Spanish labels, `crm_admin` gating for Importar, active-state
 * highlighting via aria-current, and an accessible nav landmark.
 */

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

const LOS_PERMISOS_ADMIN = ['crm', 'crm_admin'];
const LOS_PERMISOS_VENDEDOR = ['crm'];

function hrefsEnOrden(): string[] {
  return screen
    .getByRole('navigation', { name: 'Secciones CRM' })
    .querySelectorAll('a')
    .values()
    .map((a) => a.getAttribute('href'))
    .toArray();
}

describe('NavCrm', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/crm');
  });

  it('renders the five flow-order entries with Spanish labels for an admin session', () => {
    render(<NavCrm permisos={LOS_PERMISOS_ADMIN} />);

    expect(hrefsEnOrden()).toEqual([
      '/crm',
      '/crm/cola',
      '/crm/cartera',
      '/crm/importar',
      '/crm/productividad',
    ]);
    expect(screen.getByRole('link', { name: 'Empresas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cola de hoy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mi cartera' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Importar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Productividad' })).toBeInTheDocument();
  });

  it('hides Importar from a session without crm_admin', () => {
    render(<NavCrm permisos={LOS_PERMISOS_VENDEDOR} />);

    expect(screen.queryByRole('link', { name: 'Importar' })).not.toBeInTheDocument();
    expect(hrefsEnOrden()).toEqual(['/crm', '/crm/cola', '/crm/cartera', '/crm/productividad']);
  });

  it('marks the exact registry root active on /crm only', () => {
    vi.mocked(usePathname).mockReturnValue('/crm');
    render(<NavCrm permisos={LOS_PERMISOS_VENDEDOR} />);

    expect(screen.getByRole('link', { name: 'Empresas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Cola de hoy' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('highlights Empresas with a prefix match on an empresa detail page', () => {
    vi.mocked(usePathname).mockReturnValue('/crm/empresas/7');
    render(<NavCrm permisos={LOS_PERMISOS_VENDEDOR} />);

    expect(screen.getByRole('link', { name: 'Empresas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Cola de hoy' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('marks each section active on its own route', () => {
    vi.mocked(usePathname).mockReturnValue('/crm/cartera');
    const { unmount } = render(<NavCrm permisos={LOS_PERMISOS_VENDEDOR} />);
    expect(screen.getByRole('link', { name: 'Mi cartera' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Empresas' })).not.toHaveAttribute('aria-current');
    unmount();

    vi.mocked(usePathname).mockReturnValue('/crm/importar');
    render(<NavCrm permisos={LOS_PERMISOS_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Importar' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
