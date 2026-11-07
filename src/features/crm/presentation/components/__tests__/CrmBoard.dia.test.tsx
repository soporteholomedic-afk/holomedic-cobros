import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { AlertaCrm } from '../../application/calcularAlertas';
import { CrmBoard } from '../CrmBoard';
import { empresa, mockApi, oportunidad } from './crmFixtures';

const ESPERA: AlertaCrm = {
  idOportunidad: 'o-2',
  nombreOportunidad: 'Monitoreo ocupacional 2026',
  idEmpresa: 'e-2',
  nombreEmpresa: 'Minera Los Tres Picos S.A.',
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

/** crm-notificaciones (S1/S5) on the deal model: an alert names deal + empresa and opens THAT deal's card. */
describe('CrmBoard — Tu día (crm-notificaciones)', () => {
  it('renders the panel above the board, names deal + empresa, and focuses the deal card from an alert', async () => {
    mockApi({
      alertas: { status: 200, body: { success: true, alertas: [ESPERA], resumen: { vencidas: 0, hoy: 0, sinResponder: 1 } } },
    });
    render(<CrmBoard />);
    await waitFor(() => expect(screen.getByTestId('crm-board')).toBeInTheDocument());

    const panel = screen.getByRole('region', { name: 'Tu día' });
    expect(within(panel).getByText('Sin respuesta')).toBeInTheDocument();
    const boton = within(panel).getByRole('button', { name: /Monitoreo ocupacional 2026.*Minera Los Tres Picos/s });
    fireEvent.click(boton);
    expect(screen.queryByRole('dialog', { name: 'Minera Los Tres Picos S.A.' })).toBeNull();
    await waitFor(() =>
      expect(document.querySelector<HTMLElement>('[data-empresa-id="o-2"]')).toHaveFocus(),
    );
  });

  it('opens the ficha instead when the alerted deal is not on the board', async () => {
    mockApi({
      oportunidades: { status: 200, body: { success: true, oportunidades: [oportunidad()] } },
      alertas: { status: 200, body: { success: true, alertas: [ESPERA], resumen: { vencidas: 0, hoy: 0, sinResponder: 1 } } },
    });
    render(<CrmBoard />);
    await waitFor(() => expect(screen.getByTestId('crm-board')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Monitoreo ocupacional 2026/ }));
    expect(await screen.findByRole('dialog', { name: 'Minera Los Tres Picos S.A.' })).toBeInTheDocument();
  });

  it('renders no panel on a clean day (fixture default: empty alerts)', async () => {
    mockApi();
    render(<CrmBoard />);
    await waitFor(() => expect(screen.getByTestId('crm-board')).toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Tu día' })).toBeNull();
  });
});
