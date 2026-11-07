import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PaginaConfiguracionCrm from '../page';

/**
 * The page shell (crm-consulta-sunat T2): a default export that renders
 * PanelApifacturacion. Proxy-level gating of /admin/crm/configuracion is
 * pinned in routes.crm-configuracion.test.ts.
 */

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          configuracion: {
            configurado: true,
            tokenMascarado: '••••••••••••3456',
            url: 'https://api.apifacturacion.com',
            fuente: 'db',
          },
        }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/admin/crm/configuracion', () => {
  it('renders the apifacturacion panel with its state', async () => {
    render(<PaginaConfiguracionCrm />);
    expect(screen.getByRole('heading', { name: 'API apifacturacion (SUNAT)' })).toBeInTheDocument();
    expect(await screen.findByText('Configurado')).toBeInTheDocument();
    expect(screen.getByLabelText('URL de la API')).toBeInTheDocument();
  });
});
