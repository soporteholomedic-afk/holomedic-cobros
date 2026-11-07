import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ConfiguracionConsultaSunatPage from '../page';

/**
 * The CONSULTA SUNAT tab page shell (crm-consulta-sunat T8, log L8):
 * a default export that renders PanelApifacturacion inside the
 * /configuracion tabs layout — the SAME panel the dedicated
 * /admin/crm/configuracion page used to render (removed in T8).
 * Proxy-level gating of /configuracion/consulta-sunat (denegado path
 * included) is pinned in routes.crm-configuracion.test.ts, exactly the
 * pattern the other per-tab pages (usuarios/areas/firma) use.
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

describe('/configuracion/consulta-sunat', () => {
  it('renders the apifacturacion panel with its state', async () => {
    render(<ConfiguracionConsultaSunatPage />);
    expect(screen.getByRole('heading', { name: 'API apifacturacion (SUNAT)' })).toBeInTheDocument();
    expect(await screen.findByText('Configurado')).toBeInTheDocument();
    expect(screen.getByLabelText('URL de la API')).toBeInTheDocument();
  });
});
