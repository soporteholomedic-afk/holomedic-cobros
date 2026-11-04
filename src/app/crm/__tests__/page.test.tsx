import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CrmPage from '../page';

describe('/crm page', () => {
  it('renders the CRM board with its heading and the empresas from the API', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        empresas: [
          {
            idEmpresa: 'e-1',
            razonSocial: 'Constructora Andina S.A.C.',
            ruc: '20512345678',
            sector: 'Construcción',
            contactos: [{ nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null }],
            notas: null,
            etapa: 'por_contactar',
            medio: null,
            motivo: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    })) as unknown as typeof fetch;

    render(<CrmPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'CRM' })).toBeInTheDocument();
    expect(await screen.findByText('Constructora Andina S.A.C.')).toBeInTheDocument();
    expect(screen.getByText('Marcela Quispe')).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(5);
  });
});
