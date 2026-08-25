import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
