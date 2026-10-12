import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';

import { NavCrm } from '../NavCrm';

/**
 * UI contract for the CRM section navigation (rediseno-crm-panel task
 * 11.3, spec "Retirement of Superseded Views"): three entries in the
 * product owner's flow order — Empresas (the operator panel),
 * Importar, Productividad — with Spanish labels, `crm_admin` gating
 * for Importar, active-state highlighting via aria-current, and an
 * accessible nav landmark. The retired Cola de hoy / Mi cartera views
 * expose NO navigation entry (spec regression scenario).
 */

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

const LOS_PERMISOS_ADMIN = ['crm', 'crm_admin'];
const LOS_PERMISOS_VENDEDOR = ['crm'];

function hrefsEnOrden(): (string | null)[] {
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

  it('renders the three flow-order entries and NO retired links for an admin session', () => {
    render(<NavCrm permisos={LOS_PERMISOS_ADMIN} />);

    expect(hrefsEnOrden()).toEqual(['/crm', '/crm/importar', '/crm/productividad']);
    expect(screen.getByRole('link', { name: 'Empresas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Importar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Productividad' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cola de hoy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mi cartera' })).not.toBeInTheDocument();
    expect(hrefsEnOrden()).not.toContain('/crm/cola');
    expect(hrefsEnOrden()).not.toContain('/crm/cartera');
  });

  it('hides Importar from a session without crm_admin', () => {
    render(<NavCrm permisos={LOS_PERMISOS_VENDEDOR} />);

    expect(screen.queryByRole('link', { name: 'Importar' })).not.toBeInTheDocument();
    expect(hrefsEnOrden()).toEqual(['/crm', '/crm/productividad']);
  });

  it('marks the exact registry root active on /crm only', () => {
    vi.mocked(usePathname).mockReturnValue('/crm');
    render(<NavCrm permisos={LOS_PERMISOS_VENDEDOR} />);

    expect(screen.getByRole('link', { name: 'Empresas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Productividad' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('highlights Empresas with a prefix match on an empresa detail path', () => {
    vi.mocked(usePathname).mockReturnValue('/crm/empresas/7');
    render(<NavCrm permisos={LOS_PERMISOS_VENDEDOR} />);

    expect(screen.getByRole('link', { name: 'Empresas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Productividad' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('marks Importar active on its own route', () => {
    vi.mocked(usePathname).mockReturnValue('/crm/importar');
    render(<NavCrm permisos={LOS_PERMISOS_ADMIN} />);
    expect(screen.getByRole('link', { name: 'Importar' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Empresas' })).not.toHaveAttribute('aria-current');
  });

  // agente-ia-crm E4·T6: "Calidad" rides the SAME crm_conversaciones
  // gate as Conversaciones (longer-prefix route entry) and sits right
  // after it in flow order — the operator reviews what la Guía
  // answered right where the bandeja lives.
  const LOS_PERMISOS_CONVERSACIONES = ['crm', 'crm_conversaciones'];

  it('shows Calidad right after Conversaciones for a crm_conversaciones session', () => {
    render(<NavCrm permisos={LOS_PERMISOS_CONVERSACIONES} />);

    expect(screen.getByRole('link', { name: 'Calidad' })).toHaveAttribute(
      'href',
      '/crm/calidad',
    );
    expect(hrefsEnOrden()).toEqual([
      '/crm',
      '/crm/conversaciones',
      '/crm/calidad',
      '/crm/productividad',
    ]);
  });

  it('hides Calidad from a session without crm_conversaciones', () => {
    render(<NavCrm permisos={LOS_PERMISOS_VENDEDOR} />);

    expect(screen.queryByRole('link', { name: 'Calidad' })).not.toBeInTheDocument();
    expect(hrefsEnOrden()).not.toContain('/crm/calidad');
  });

  it('marks Calidad active on its own route', () => {
    vi.mocked(usePathname).mockReturnValue('/crm/calidad');
    render(<NavCrm permisos={LOS_PERMISOS_CONVERSACIONES} />);

    expect(screen.getByRole('link', { name: 'Calidad' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Conversaciones' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
