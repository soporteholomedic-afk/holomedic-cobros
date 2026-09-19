import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ColaHoy } from '../ColaHoy';
import type { CandidatoCola } from '../../../domain/ports';

/**
 * UI contract for the /crm/cola queue (tasks pr13/WU3, spec G4):
 * four Spanish sections — "Vencidas hoy", "Reinicios de cadencia",
 * "Decisión requerida", "Reactivables" — every empresa row links to
 * its detail page, errors surface with a retry, and empty sections
 * say so (no auto-send anywhere: the page only links, it never fires
 * emails).
 */

function candidato(overrides: Partial<CandidatoCola>): CandidatoCola {
  return {
    empresaId: 1,
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-05-25',
    fechaUltimoEnvio: '2026-05-25',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-05-25T00:00:00.000Z',
    razonSocial: 'Constructora X',
    responsable: null,
    ...overrides,
  };
}

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ColaHoy — "a quién le toca hoy"', () => {
  it('renders the four Spanish sections and routes each row to its detail page', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        success: true,
        vencidasHoy: [
          candidato({ empresaId: 10, razonSocial: 'Vencida Uno' }),
          candidato({ empresaId: 11, razonSocial: 'Vencida Dos', etapa: 'CADENCIA' }),
        ],
        reinicios: [
          candidato({
            empresaId: 30,
            razonSocial: 'Descanso Cumplido',
            etapa: 'DESCANSO',
            enviosCiclo: 3,
            descansoHasta: '2026-06-01',
          }),
        ],
        decisionRequerida: [
          candidato({
            empresaId: 20,
            razonSocial: 'Agotada Fork',
            flujo: 'INBOUND',
            etapa: 'SEGUIMIENTO',
            enviosCiclo: 3,
          }),
        ],
        reactivables: [
          candidato({
            empresaId: 40,
            razonSocial: 'Reactivable',
            etapa: 'RECHAZADO',
            rechazadoHasta: '2026-06-01',
            motivoRechazo: 'Sin presupuesto',
          }),
        ],
      }),
    );

    render(<ColaHoy />);

    expect(await screen.findByRole('heading', { name: /Vencidas hoy/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Reinicios de cadencia/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Decisión requerida/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Reactivables/ })).toBeInTheDocument();

    // Every row is a link to the empresa detail page (the queue never
    // sends anything by itself — it only navigates).
    const enlaces = screen.getAllByRole('link');
    const hrefs = enlaces.map((a) => a.getAttribute('href')).sort();
    expect(hrefs).toEqual([
      '/crm/empresas/10',
      '/crm/empresas/11',
      '/crm/empresas/20',
      '/crm/empresas/30',
      '/crm/empresas/40',
    ]);
    expect(screen.getByText('Vencida Uno')).toBeInTheDocument();
    expect(screen.getByText('Agotada Fork')).toBeInTheDocument();
  });

  it('each empresa appears exactly once per week-cycle: a row lands in ONE section only', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        success: true,
        vencidasHoy: [candidato({ empresaId: 10, razonSocial: 'Vencida Uno' })],
        reinicios: [],
        decisionRequerida: [],
        reactivables: [],
      }),
    );

    render(<ColaHoy />);

    await screen.findByText('Vencida Uno');
    expect(screen.getAllByText('Vencida Uno')).toHaveLength(1);
    // The other three sections show their empty state.
    expect(await screen.findAllByText('Sin empresas')).toHaveLength(3);
  });

  it('surfaces API errors with a retry that re-fetches', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'No autorizado', code: 'FORBIDDEN' }), { status: 403 }),
      )
      .mockResolvedValue(
        okResponse({
          success: true,
          vencidasHoy: [candidato({ empresaId: 10, razonSocial: 'Vencida Uno' })],
          reinicios: [],
          decisionRequerida: [],
          reactivables: [],
        }),
      );

    render(<ColaHoy />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No autorizado');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('Vencida Uno')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
