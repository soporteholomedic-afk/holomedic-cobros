import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProductividadTable } from '../ProductividadTable';
import { periodoPorDefecto, type Periodo } from '../../periodo';
import type { FilaProductividad } from '../../../application/listarProductividad';

/**
 * UI contract for the productivity table (tasks pr16/WU3, spec G6
 * "Admin dashboard"): per-user rows with activities, results and the
 * D4 event breakdown under Spanish headers; the Desde/Hasta selector
 * drives a re-fetch through the hook; empty and error states mirror
 * CarteraTable. The scope itself is the SERVER's decision — the
 * component renders whatever the API returns.
 */

const filaJperez: FilaProductividad = {
  usuario: 'jperez',
  actividades: 10,
  resultados: 3,
  porEvento: {
    CotizaciónEnviada: 2,
    PresentaciónEnviada: 0,
    AceptaciónOutbound: 0,
    ConfirmaciónPresentación: 1,
    HandoffRegistrado: 0,
    ConversiónProspectoACliente: 1,
  },
};

const filaMgarcia: FilaProductividad = {
  usuario: 'mgarcia',
  actividades: 4,
  resultados: 1,
  porEvento: {
    CotizaciónEnviada: 0,
    PresentaciónEnviada: 0,
    AceptaciónOutbound: 1,
    ConfirmaciónPresentación: 0,
    HandoffRegistrado: 0,
    ConversiónProspectoACliente: 0,
  },
};

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function productividadOk(filas: FilaProductividad[]): Response {
  return okResponse({ success: true, desde: '2026-09-01', hasta: '2026-09-30', filas });
}

const PERIODO_INICIAL: Periodo = { desde: '2026-09-01', hasta: '2026-09-30' };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(productividadOk([filaJperez, filaMgarcia]));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('periodoPorDefecto (pure — no mocks)', () => {
  it('defaults to the current month: first-of-day-month → today', () => {
    expect(periodoPorDefecto(new Date(2026, 8, 19, 14, 30))).toEqual({
      desde: '2026-09-01',
      hasta: '2026-09-19',
    });
  });

  it('handles single-digit months and days without padding mistakes', () => {
    expect(periodoPorDefecto(new Date(2026, 1, 3, 0, 0))).toEqual({
      desde: '2026-02-01',
      hasta: '2026-02-03',
    });
  });
});

describe('ProductividadTable', () => {
  it('renders one row per user with activities and results counts', async () => {
    render(<ProductividadTable periodoInicial={PERIODO_INICIAL} />);

    await waitFor(() => expect(screen.getByText('jperez')).toBeInTheDocument());
    expect(screen.getByText('mgarcia')).toBeInTheDocument();
    // jperez row: 10 actividades / 3 resultados.
    expect(screen.getByRole('row', { name: /jperez/ })).toHaveTextContent('10');
    expect(screen.getByRole('row', { name: /jperez/ })).toHaveTextContent('3');
    // mgarcia row: 4 actividades / 1 resultado.
    expect(screen.getByRole('row', { name: /mgarcia/ })).toHaveTextContent('4');
  });

  it('renders the Spanish column headers for the D4 breakdown', async () => {
    render(<ProductividadTable periodoInicial={PERIODO_INICIAL} />);
    await waitFor(() => expect(screen.getByText('jperez')).toBeInTheDocument());

    expect(screen.getByRole('columnheader', { name: 'Usuario' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actividades' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Resultados' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Cotización enviada' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Presentación enviada' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Aceptación outbound' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Confirmación de presentación' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Handoff registrado' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Conversión a cliente' })).toBeInTheDocument();
  });

  it('shows the per-event breakdown values in the user row', async () => {
    render(<ProductividadTable periodoInicial={PERIODO_INICIAL} />);
    const fila = await waitFor(() => screen.getByRole('row', { name: /jperez/ }));

    expect(fila).toHaveTextContent('2'); // Cotización enviada
    expect(fila).toHaveTextContent('1'); // Confirmación de presentación + Conversión
  });

  it('fetches the period from periodoInicial on mount', async () => {
    render(<ProductividadTable periodoInicial={PERIODO_INICIAL} />);
    await waitFor(() => expect(screen.getByText('jperez')).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/crm/productividad?desde=2026-09-01&hasta=2026-09-30',
      { method: 'GET' },
    );
  });

  it('re-fetches when the user edits the period selector', async () => {
    render(<ProductividadTable periodoInicial={PERIODO_INICIAL} />);
    await waitFor(() => expect(screen.getByText('jperez')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // jsdom date inputs only move via change events (no keystroke
    // model) — set the value the way the browser would after a pick.
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-10' } });

    await waitFor(() => expect(fetchMock.mock.calls[1]?.[0]).toContain('desde=2026-09-10'));
  });

  it('shows the Spanish empty state when the period has no data', async () => {
    fetchMock.mockResolvedValue(productividadOk([]));
    render(<ProductividadTable periodoInicial={PERIODO_INICIAL} />);

    await waitFor(() =>
      expect(screen.getByText('Sin datos de productividad en el período seleccionado.')).toBeInTheDocument(),
    );
  });

  it('surfaces API errors with a Reintentar action', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'No autenticado', code: 'UNAUTHORIZED' }), { status: 401 }),
    );
    render(<ProductividadTable periodoInicial={PERIODO_INICIAL} />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No autenticado'));
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
