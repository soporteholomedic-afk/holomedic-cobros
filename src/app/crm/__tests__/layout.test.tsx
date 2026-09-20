import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';

import CrmLayout from '../layout';
import { getSession } from '@/lib/auth';

/**
 * Contract for the `/crm` segment layout (post-verify UX remediation):
 * the Server Component reads the session server-side and renders the
 * section nav above EVERY /crm page (children included), passing the
 * session permisos down so the client nav can gate Importar.
 */

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

function sesion(permisos: string[]) {
  return { sub: 'u-1', nombre: 'Ana', area: 'Comercial', permisos };
}

describe('CrmLayout', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/crm');
  });

  it('renders the section nav with admin gating and the page children below it', async () => {
    vi.mocked(getSession).mockResolvedValue(sesion(['crm', 'crm_admin']));

    // The layout is an async Server Component: invoke it directly and
    // render the resolved tree (RTL cannot flush a suspended RSC).
    render(await CrmLayout({ children: <p>contenido de la pagina</p> }));

    expect(screen.getByRole('navigation', { name: 'Secciones CRM' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Importar' })).toBeInTheDocument();
    expect(screen.getByText('contenido de la pagina')).toBeInTheDocument();
  });

  it('hides Importar when the session lacks crm_admin but still renders the nav and children', async () => {
    vi.mocked(getSession).mockResolvedValue(sesion(['crm']));

    render(await CrmLayout({ children: <p>contenido de la pagina</p> }));

    expect(screen.getByRole('link', { name: 'Empresas' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Importar' })).not.toBeInTheDocument();
    expect(screen.getByText('contenido de la pagina')).toBeInTheDocument();
  });

  it('renders the plain-crm nav even without a session (proxy owns the redirect)', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    render(await CrmLayout({ children: <p>contenido de la pagina</p> }));

    expect(screen.getByRole('link', { name: 'Cola de hoy' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Importar' })).not.toBeInTheDocument();
    expect(screen.getByText('contenido de la pagina')).toBeInTheDocument();
  });
});
