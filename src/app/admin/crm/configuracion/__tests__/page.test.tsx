import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Shell contract for /admin/crm/configuracion (agente-ia-crm E5·T6):
 * Server Component header + the client panel (mocked at the module
 * boundary — it has its own suite).
 */

vi.mock('@/features/crm/presentation/components/configuracion/PanelConfiguracion', () => ({
  PanelConfiguracion: () => <div data-testid="panel-configuracion" />,
}));

import ConfiguracionPage from '../page';

describe('ConfiguracionPage', () => {
  it('renderiza el encabezado y monta el panel', () => {
    render(<ConfiguracionPage />);

    expect(screen.getByRole('heading', { name: 'Configuración del agente', level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('panel-configuracion')).toBeInTheDocument();
  });
});
