import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { AlertaCrm } from '../../application/calcularAlertas';
import { CrmBoard } from '../CrmBoard';
import { empresa, mockApi } from './crmFixtures';

const ESPERA: AlertaCrm = {
  idEmpresa: 'e-2',
  razonSocial: 'Minera Los Tres Picos S.A.',
  clase: 'sin_responder',
  etapa: 'contactado',
  tipoAccion: null,
  detalle: null,
  fecha: '2026-10-30T11:00:00.000Z',
  atraso: 52,
};

afterEach(() => {
  vi.restoreAllMocks();
});

/** crm-notificaciones (S1/S5): the "Tu día" panel lives on the board and opens the detail in place. */
describe('CrmBoard — Tu día (crm-notificaciones)', () => {
  it('renders the panel above the board and opens the empresa detail from an alert', async () => {
    mockApi({
      alertas: { status: 200, body: { success: true, alertas: [ESPERA], resumen: { vencidas: 0, hoy: 0, sinResponder: 1 } } },
    });
    render(<CrmBoard />);
    await waitFor(() => expect(screen.getByTestId('crm-board')).toBeInTheDocument());

    const panel = screen.getByRole('region', { name: 'Tu día' });
    expect(within(panel).getByText('Sin respuesta')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: /Minera Los Tres Picos/ }));
    expect(await screen.findByRole('dialog', { name: 'Minera Los Tres Picos S.A.' })).toBeInTheDocument();
  });

  it('renders no panel on a clean day (fixture default: empty alerts)', async () => {
    mockApi({ lista: { status: 200, body: { success: true, empresas: [empresa({ etapa: 'contactado', medio: 'llamada' })] } } });
    render(<CrmBoard />);
    await waitFor(() => expect(screen.getByTestId('crm-board')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Tu día' })).toBeNull();
  });
});
