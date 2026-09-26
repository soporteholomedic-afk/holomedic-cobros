import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ColaHoy } from '../ColaHoy';
import type { CandidatoCola } from '../../../domain/ports';

// useRouter (next/navigation) needs the FormularioNuevaEmpresa.test
// mock pattern — the toast's "Ver cartera" action pushes on click.
const pushMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

/**
 * UI contract for the /crm/cola queue (tasks pr13/WU3, spec G4;
 * kanban redesign crm-ux): five Spanish columns with action-first
 * titles — "Iniciar contacto", "Enviar hoy", "Volver a contactar",
 * "Esperan tu decisión", "Para reactivar" — every empresa card links
 * to its detail page, errors surface with a retry, and empty columns
 * say so (no auto-send anywhere: the board only links, it never fires
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

function colaVacia() {
  return {
    success: true,
    vencidasHoy: [],
    reinicios: [],
    decisionRequerida: [],
    reactivables: [],
    sinGestion: [],
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
  it('renders the five Spanish sections and routes each row to its detail page', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        success: true,
        sinGestion: [
          candidato({
            empresaId: 50,
            razonSocial: 'Recién Mía',
            etapa: 'NUEVO',
            fechaUltimoEnvio: null,
            responsable: 'jperez',
          }),
        ],
        vencidasHoy: [
          candidato({
            empresaId: 10,
            razonSocial: 'Vencida Uno',
            contactoNombre: 'María González',
            contactoCorreo: 'maria@constructora.com',
          }),
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

    expect(await screen.findByRole('heading', { name: /Iniciar contacto/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Enviar hoy/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Volver a contactar/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Esperan tu decisión/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Para reactivar/ })).toBeInTheDocument();

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
      '/crm/empresas/50',
    ]);
    expect(screen.getByText('Vencida Uno')).toBeInTheDocument();
    // The principal encargado rides the card — the "who to write".
    expect(screen.getByText(/María González · maria@constructora\.com/)).toBeInTheDocument();
    expect(screen.getByText('Agotada Fork')).toBeInTheDocument();
    expect(screen.getByText('Recién Mía')).toBeInTheDocument();
  });

  it('each empresa appears exactly once per week-cycle: a row lands in ONE section only', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        ...colaVacia(),
        vencidasHoy: [candidato({ empresaId: 10, razonSocial: 'Vencida Uno' })],
      }),
    );

    render(<ColaHoy />);

    await screen.findByText('Vencida Uno');
    expect(screen.getAllByText('Vencida Uno')).toHaveLength(1);
    // The other four columns show their empty state.
    expect(await screen.findAllByText('Sin empresas')).toHaveLength(4);
  });

  it('surfaces API errors with a retry that re-fetches', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'No autorizado', code: 'FORBIDDEN' }), { status: 403 }),
      )
      .mockResolvedValue(
        okResponse({
          ...colaVacia(),
          vencidasHoy: [candidato({ empresaId: 10, razonSocial: 'Vencida Uno' })],
        }),
      );

    render(<ColaHoy />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No autorizado');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByText('Vencida Uno')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('opens the quick-capture modal for a session user (auto-assignment entry)', async () => {
    fetchMock.mockResolvedValue(okResponse(colaVacia()));

    render(<ColaHoy usuario="u-1" nombreUsuario="Juana Perez" />);

    await userEvent.click(await screen.findByRole('button', { name: /Agregar empresa/ }));
    expect(await screen.findByRole('dialog', { name: 'Agregar empresa' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Seleccionar existente' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Crear nueva' })).toBeInTheDocument();
  });
});
