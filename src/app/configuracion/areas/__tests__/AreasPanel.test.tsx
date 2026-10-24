import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AreasPanel } from '../AreasPanel';

// Mock useAuth — the table renders only for an admin session
// (usuarios page.test.tsx precedent). The holder lets individual
// tests flip the session's permisos.
const session = {
  permisos: ['admin'] as string[],
};

vi.mock('@/features/auth/presentation/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      idUsuario: 'admin-001',
      usuario: 'admin',
      nombre: 'Soporte Admin',
      area: 'admin',
      correo: null,
      permisos: session.permisos,
      activo: true,
    },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// One ACTIVE and one INACTIVE area — the two rendering paths.
const areas = [
  {
    idArea: 'a-1',
    nombre: 'Ventas',
    descripcion: 'Equipo comercial',
    activo: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    idArea: 'a-2',
    nombre: 'Retail',
    descripcion: null,
    activo: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function mockFetch(
  handlers: Array<(url: string, init?: RequestInit) => Response | undefined> = [],
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    for (const handler of handlers) {
      const res = handler(url, init);
      if (res) return res;
    }
    return new Response(JSON.stringify({ success: true, areas }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

function lastBody(fetchSpy: ReturnType<typeof mockFetch>, method: string): unknown {
  const call = fetchSpy.mock.calls.find(([, init]) => init?.method === method);
  return JSON.parse((call?.[1] as RequestInit).body as string);
}

beforeEach(() => {
  session.permisos = ['admin'];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AreasPanel', () => {
  it('renders the catalog with active and inactive badges', async () => {
    mockFetch();
    render(<AreasPanel />);

    await waitFor(() => {
      expect(screen.getByText('Ventas')).toBeInTheDocument();
    });
    expect(screen.getByText('Retail')).toBeInTheDocument();
    expect(screen.getByText('Equipo comercial')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Inactiva')).toBeInTheDocument();
  });

  it('filters by nombre through the search box', async () => {
    const user = userEvent.setup();
    mockFetch();
    render(<AreasPanel />);

    await waitFor(() => {
      expect(screen.getByText('Ventas')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Buscar áreas...'), 'ven');

    expect(screen.getByText('Ventas')).toBeInTheDocument();
    expect(screen.queryByText('Retail')).not.toBeInTheDocument();
  });

  it('creates an area through the modal form', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch([
      (url, init) =>
        url === '/api/areas' && init?.method === 'POST'
          ? new Response(JSON.stringify({ success: true, area: areas[0] }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            })
          : undefined,
    ]);

    render(<AreasPanel />);
    await waitFor(() => {
      expect(screen.getByText('Ventas')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /nueva área/i }));
    await user.type(screen.getByLabelText('Nombre'), 'Enfermería');
    await user.type(screen.getByLabelText(/descripción/i), 'Personal de enfermería');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/areas',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(lastBody(fetchSpy, 'POST')).toEqual({
      nombre: 'Enfermería',
      descripcion: 'Personal de enfermería',
    });
  });

  it('soft-deletes an active area after confirmation', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchSpy = mockFetch([
      (url, init) =>
        url === '/api/areas/a-1' && init?.method === 'DELETE'
          ? new Response(JSON.stringify({ success: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          : undefined,
    ]);

    render(<AreasPanel />);
    await waitFor(() => {
      expect(screen.getByText('Ventas')).toBeInTheDocument();
    });

    await user.click(screen.getByTitle('Desactivar'));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Ventas'));
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/areas/a-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('reactivates an inactive area', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetch([
      (url, init) =>
        url === '/api/areas/a-2' && init?.method === 'PUT'
          ? new Response(
              JSON.stringify({ success: true, area: { ...areas[1], activo: true } }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            )
          : undefined,
    ]);

    render(<AreasPanel />);
    await waitFor(() => {
      expect(screen.getByText('Retail')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /reactivar/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/areas/a-2',
        expect.objectContaining({ method: 'PUT' }),
      );
    });
    expect(lastBody(fetchSpy, 'PUT')).toEqual({ activo: true });
  });

  it('shows the empty state when the catalog is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, areas: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    render(<AreasPanel />);

    await waitFor(() => {
      expect(screen.getByText(/no hay áreas registradas/i)).toBeInTheDocument();
    });
  });

  it('blocks non-admin sessions', () => {
    session.permisos = ['consolidados'];
    render(<AreasPanel />);

    expect(screen.getByText('No autorizado')).toBeInTheDocument();
  });
});
