import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import NuevaEmpresaPage from '../page';
import { getSession } from '@/lib/auth';

/**
 * Contract for `/crm/empresas/nueva` (post-verify UX remediation): a
 * page — not a modal — so the 11-field creation form inherits the
 * NavCrm layout and stays addressable as the inbound flow's entry
 * point. The Server Component re-checks `crm_admin` (the proxy only
 * requires `crm` on /crm/*): without it renders the Spanish access
 * panel instead of the form; the POST remains the real gate.
 */

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function sesion(permisos: string[]) {
  return { sub: 'u-1', nombre: 'Ana', area: 'Comercial', permisos };
}

describe('NuevaEmpresaPage', () => {
  it('renders the registration form for a crm_admin session', async () => {
    vi.mocked(getSession).mockResolvedValue(sesion(['crm', 'crm_admin']));

    render(await NuevaEmpresaPage());

    expect(screen.getByRole('heading', { name: 'Nueva empresa' })).toBeInTheDocument();
    expect(screen.getByLabelText('RUC', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar empresa' })).toBeInTheDocument();
  });

  it('renders the access panel without crm_admin (form hidden)', async () => {
    vi.mocked(getSession).mockResolvedValue(sesion(['crm']));

    render(await NuevaEmpresaPage());

    expect(screen.getByRole('heading', { name: 'Nueva empresa' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Esta acción requiere el permiso crm_admin.',
    );
    expect(screen.queryByLabelText('RUC')).not.toBeInTheDocument();
  });

  it('treats a missing session like a non-admin (proxy owns the redirect)', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    render(await NuevaEmpresaPage());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Esta acción requiere el permiso crm_admin.',
    );
    expect(screen.queryByLabelText('RUC')).not.toBeInTheDocument();
  });
});
