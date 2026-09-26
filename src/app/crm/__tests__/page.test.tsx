import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import CrmPage from '../page';
import { getSession } from '@/lib/auth';

/**
 * Contract for the `/crm` registry page (post-verify UX remediation):
 * the Server Component reads the session ONCE (cartera/page.tsx
 * precedent) and passes `esAdmin` down so the list can gate the
 * "Nueva empresa" affordance — the POST is the real crm_admin gate.
 */

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sesion(permisos: string[]) {
  return { sub: 'u-1', nombre: 'Ana', area: 'Comercial', permisos };
}

describe('CrmPage', () => {
  it('renders the CRM header with the Nueva empresa affordance for crm_admin', async () => {
    vi.mocked(getSession).mockResolvedValue(sesion(['crm', 'crm_admin']));
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, empresas: [] }), { status: 200 }),
    );

    render(await CrmPage());

    expect(screen.getByRole('heading', { name: 'CRM' })).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'Nueva empresa' }),
    ).toHaveAttribute('href', '/crm/empresas/nueva');
  });

  it('omits the Nueva empresa affordance for plain crm users', async () => {
    vi.mocked(getSession).mockResolvedValue(sesion(['crm']));
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, empresas: [] }), { status: 200 }),
    );

    render(await CrmPage());

    expect(await screen.findByText('No se encontraron empresas.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nueva empresa' })).not.toBeInTheDocument();
  });
});
