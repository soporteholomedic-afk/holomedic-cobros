import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsuariosPage from '../page';
// Mock useAuth — the table renders only for an admin session.
vi.mock('@/features/auth/presentation/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      idUsuario: 'admin-001',
      usuario: 'admin',
      nombre: 'Soporte Admin',
      area: 'admin',
      correo: null,
      permisos: ['admin'],
      activo: true,
    },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// One user WITH correo, one WITHOUT (NULL) — the two rendering paths.
const usuarios = [
  {
    idUsuario: 'u-1',
    usuario: 'mlopez',
    nombre: 'María López',
    area: 'cobranza',
    correo: 'maria@holomedic.com',
    permisos: ['cobranza'],
    activo: true,
  },
  {
    idUsuario: 'u-2',
    usuario: 'jdoe',
    nombre: 'John Doe',
    area: 'consolidados',
    correo: null,
    permisos: ['consolidados'],
    activo: true,
  },
];

async function renderUsuariosTable() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ success: true, usuarios }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  render(<UsuariosPage />);
  // Wait for the fetch to resolve and rows to appear.
  await waitFor(() => {
    expect(screen.getByText('María López')).toBeInTheDocument();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Feature areas-crud: the usuarios form picks the area from the
// ---- /api/areas catalog instead of free text.

const areas = [
  { idArea: 'a-1', nombre: 'Ventas', descripcion: null, activo: true, createdAt: '', updatedAt: '' },
  { idArea: 'a-2', nombre: 'Enfermería', descripcion: null, activo: true, createdAt: '', updatedAt: '' },
  { idArea: 'a-3', nombre: 'Legajos', descripcion: null, activo: false, createdAt: '', updatedAt: '' },
];

function mockFetchConCatalogo() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    void init;
    if (url === '/api/areas') {
      return new Response(JSON.stringify({ success: true, areas }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ success: true, usuarios }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

describe('UsuariosPage — dropdown de áreas (feature areas-crud)', () => {
  it('el formulario elige el área de un select alimentado por el catálogo', async () => {
    const user = userEvent.setup();
    mockFetchConCatalogo();
    render(<UsuariosPage />);
    await waitFor(() => {
      expect(screen.getByText('María López')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /nuevo usuario/i }));

    const select = screen.getByLabelText('Área');
    expect(select.tagName).toBe('SELECT');
    const opciones = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    // Only ACTIVE catalog areas are offered (soft-deleted ones are not assignable).
    expect(opciones).toEqual(['Seleccioná un área', 'Ventas', 'Enfermería']);
  });

  it('conserva el área actual del usuario aunque no esté en el catálogo', async () => {
    const user = userEvent.setup();
    mockFetchConCatalogo();
    render(<UsuariosPage />);
    await waitFor(() => {
      expect(screen.getByText('María López')).toBeInTheDocument();
    });

    // María belongs to 'cobranza', which the catalog does not list.
    await user.click(screen.getAllByTitle('Editar')[0]);

    const select = screen.getByLabelText('Área');
    const opciones = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(opciones).toContain('cobranza');
    expect(select).toHaveValue('cobranza');
  });

  it('envía el área elegida del catálogo al crear el usuario', async () => {
    const user = userEvent.setup();
    const fetchSpy = mockFetchConCatalogo();
    const { container } = render(<UsuariosPage />);
    await waitFor(() => {
      expect(screen.getByText('María López')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /nuevo usuario/i }));
    await user.type(screen.getByLabelText('Usuario'), 'nuevo1');
    await user.type(screen.getByLabelText('Nombre'), 'Nuevo Usuario');
    await user.selectOptions(screen.getByLabelText('Área'), 'Ventas');
    await user.type(container.querySelector('input[type="password"]') as HTMLInputElement, 'clave123');
    // El botón de envío exige al menos un permiso (form.permisos.length > 0).
    await user.click(container.querySelector('input[type="checkbox"]') as HTMLInputElement);
    await user.click(screen.getByRole('button', { name: /crear usuario/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/usuarios',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const createCall = fetchSpy.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    const body = JSON.parse((createCall?.[1] as RequestInit).body as string);
    expect(body.area).toBe('Ventas');
  });
});

describe('UsuariosPage — correo column', () => {
  it('renders a Correo column header', async () => {
    await renderUsuariosTable();

    expect(
      screen.getByRole('columnheader', { name: /correo/i }),
    ).toBeInTheDocument();
  });

  it('shows the correo of a user that has one', async () => {
    await renderUsuariosTable();

    expect(screen.getByText('maria@holomedic.com')).toBeInTheDocument();
  });

  it('renders the — placeholder for a NULL correo, never "undefined"/"null"', async () => {
    await renderUsuariosTable();

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });
});
