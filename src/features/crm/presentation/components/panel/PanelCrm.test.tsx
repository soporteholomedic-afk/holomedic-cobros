import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PanelCrm } from './PanelCrm';
import type { FilaPanelCrm } from '../../../domain/ports';

/**
 * Orchestrator contract for the operator panel (task 8.2, design D4,
 * spec OP-1..OP-3): tested ONCE through the fetch seam (usePanelCrm's
 * ColaHoy pattern — the REAL hook runs, only global fetch and the
 * router are stubbed) against the COMPLETE shell, which is exactly why
 * tasks 8.3/8.4 delivered the leaves first. PanelCrm owns the tab +
 * search state, re-runs filtrarFilas, shows the ColaHoy-pattern
 * loading spinner / error alert + Reintentar, wires ver_ficha to the
 * existing ficha page and the "+ Anotar Empresa" paths to the alta
 * page (interim until the 9.x/10.x modals).
 */

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const HOY = '2026-09-15';

function fila(overrides: Partial<FilaPanelCrm> = {}): FilaPanelCrm {
  return {
    empresaId: 1,
    razonSocial: 'Constructora A',
    ruc: '20489561234',
    tipo: 'Prospecto',
    responsable: null,
    sector: 'Construcción',
    cantidadTrabajadores: 45,
    createdAt: '2026-09-01T00:00:00.000Z',
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-09-08',
    fechaUltimoEnvio: '2026-09-08',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    contactoNombre: 'Carlos Mendoza',
    contactoCargo: 'Recursos Humanos / Seguridad',
    contactoCorreo: 'carlos@constructora.com',
    ...overrides,
  };
}

function sinPipeline(overrides: Partial<FilaPanelCrm> = {}): Partial<FilaPanelCrm> {
  return {
    flujo: null,
    etapa: null,
    ciclo: null,
    enviosCiclo: null,
    fechaCicloInicio: null,
    fechaUltimoEnvio: null,
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    ...overrides,
  };
}

/** carta_enviada (En espera) + sin_carta (Falta carta) — two tabs
 * populated, distinct contactos and RUCs so filtering is observable. */
const FILAS = [
  fila({ empresaId: 1 }),
  fila({
    empresaId: 2,
    razonSocial: 'Minera B',
    ruc: '20511223344',
    contactoNombre: 'Laura Torres',
    contactoCorreo: 'laura@minera.com',
    ...sinPipeline(),
  }),
];

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function mockPanel(filas: FilaPanelCrm[] = FILAS): void {
  fetchMock.mockResolvedValue(okResponse({ success: true, hoy: HOY, filas }));
}

beforeEach(() => {
  pushMock.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The <tr> containing the empresa name (TablaEmpresas.test precedent:
 * jsdom rows carry no accessible name of their own). */
function filaDe(nombre: string): HTMLElement {
  const tr = screen.getByText(nombre).closest('tr');
  if (tr === null) throw new Error(`La empresa ${nombre} no quedó dentro de una fila`);
  return tr;
}

describe('PanelCrm — estados del fetch', () => {
  it('starts loading (spinner, no table) until the panel payload lands', async () => {
    let resolver: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        resolver = res;
      }),
    );
    render(<PanelCrm />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando panel…');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    resolver(okResponse({ success: true, hoy: HOY, filas: FILAS }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('surfaces the API error in an alert and recovers via Reintentar', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'No autorizado', code: 'FORBIDDEN' }), {
          status: 403,
        }),
      )
      .mockResolvedValue(okResponse({ success: true, hoy: HOY, filas: FILAS }));
    render(<PanelCrm />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No autorizado');

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('PanelCrm — panel montado', () => {
  it('renders the header (current-app branding), the 6 KPIs and the tabs with live counts', async () => {
    mockPanel();
    render(<PanelCrm />);

    expect(
      await screen.findByRole('heading', { name: 'CRM', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Panel Sencillo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anotar Nueva Empresa' })).toBeInTheDocument();

    // KPIs come from derivarPanel's conteos — same source as the tabs,
    // so the KPI number and its tab count can never disagree (OP-2).
    expect(screen.getByText('0 clientes / 2 posibles')).toBeInTheDocument(); // both fixtures are Prospecto
    expect(screen.getByText('Falta carta (1)')).toBeInTheDocument(); // tab count
    const card = screen.getByText('Falta carta').closest('div');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('1')).toBeInTheDocument(); // matching KPI
    expect(screen.getByText('En espera (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todas (2)' })).toBeInTheDocument();
  });

  it('renders both derived rows with their badges', async () => {
    mockPanel();
    render(<PanelCrm />);

    expect(await screen.findByText('Carta enviada (Inicio)')).toBeInTheDocument();
    expect(screen.getByText('Falta enviar carta')).toBeInTheDocument();
  });

  it('filters the rows when a tab is selected', async () => {
    mockPanel();
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Falta carta (1)' }));

    expect(screen.getByText('Minera B')).toBeInTheDocument();
    expect(screen.queryByText('Constructora A')).not.toBeInTheDocument();
  });

  it('filters the rows by the search term (contacto name)', async () => {
    mockPanel();
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar' }), 'Mendoza');

    expect(filaDe('Constructora A')).toBeInTheDocument();
    expect(screen.queryByText('Minera B')).not.toBeInTheDocument();
  });

  it('navigates to the ficha page on ver_ficha (empresa-name affordance, spec OP-6)', async () => {
    mockPanel();
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Constructora A' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/crm/empresas/1'));
  });

  it('navigates to the alta page from the empty-state CTA when filters match nothing', async () => {
    mockPanel();
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Falta carta (1)' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar' }), 'zzz');

    expect(screen.getByText('No hay empresas que mostrar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Anotar Empresa' }));
    expect(pushMock).toHaveBeenCalledWith('/crm/empresas/nueva');
  });

  it('navigates to the alta page from the header CTA', async () => {
    mockPanel();
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Anotar Nueva Empresa' }));
    expect(pushMock).toHaveBeenCalledWith('/crm/empresas/nueva');
  });
});
