/**
 * Smoke test for the ÁREAS tab entry (feature `areas-crud`): the page
 * mounts the full AreasPanel CRUD (it was an empty placeholder under
 * feature `configuracion-tabs`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

import ConfiguracionAreasPage from '../page';

describe('/configuracion/areas page — AreasPanel CRUD', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza el catálogo con el título y las áreas del repositorio', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          areas: [
            {
              idArea: 'a-1',
              nombre: 'Ventas',
              descripcion: null,
              activo: true,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(<ConfiguracionAreasPage />);

    expect(
      screen.getByRole('heading', { name: 'Áreas' }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Ventas')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /nueva área/i }),
    ).toBeInTheDocument();
  });
});
