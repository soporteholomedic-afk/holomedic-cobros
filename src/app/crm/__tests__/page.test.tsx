import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import CrmPage from '../page';

/**
 * Contract for the `/crm` page (task 8.5, design D4, spec OP-1/OP-9):
 * the Server Component now RENDERS THE PANEL — a thin wrapper around
 * the client PanelCrm shell (the page owns no data, no session read;
 * the proxy gates /crm with the `crm` permission and the alta POST
 * gate relax arrives in task 10.1). The registry list this page used
 * to render disappears here; the old cola/cartera/nueva/[id] pages
 * remain until tasks 11.x retire them.
 */

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ success: true, hoy: '2026-09-15', filas: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CrmPage', () => {
  it('renders the panel shell with the header branding and the empty panel', async () => {
    render(<CrmPage />);

    expect(screen.getByRole('heading', { name: 'CRM', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Panel Sencillo')).toBeInTheDocument();
    expect(await screen.findByText('No hay empresas que mostrar')).toBeInTheDocument();
  });

  it('offers "Anotar Nueva Empresa" unconditionally (mock parity; POST gate relax = 10.1)', async () => {
    render(<CrmPage />);

    expect(
      await screen.findByRole('button', { name: 'Anotar Nueva Empresa' }),
    ).toBeInTheDocument();
  });
});
