import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PanelCrm } from './PanelCrm';
import type { DetalleEmpresa } from '../../../application/obtenerDetalleEmpresa';
import type { FilaPanelCrm } from '../../../domain/ports';

/**
 * Orchestrator contract for the operator panel (task 8.2, design D4,
 * spec OP-1..OP-3; seams wired in batch 14 — tasks 9.x closure +
 * decision 13): tested ONCE through the fetch seam (usePanelCrm's
 * ColaHoy pattern — the REAL hooks run, only global fetch and the
 * router are stubbed, URL-routed like ModalFichaEmpresa.test).
 *
 * ver_ficha / eye / empresa-name open ModalFichaEmpresa; ¿Respondió?
 * and the ficha's quick actions open ModalRespuesta (positive
 * preselect; success refreshes the panel); the send row actions POST
 * the next template through the shared accionesFila seam, "Pausar 3m"
 * rides the T14 transition, the in-flight row's buttons disable and
 * API errors surface in a panel alert. The Secuencia Completa section
 * mounts below the table and owns its preview modal. Only the alta CTA
 * remains interim navigation until ModalAltaEmpresa (task 10.2).
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

/** One row per WIRED row action (decision 13): Enviar carta (sin_carta),
 * +1 Sem (carta_enviada), Pausar 3m (seguimiento_3), Reactivar ya
 * (en_pausa_3m). */
const FILAS_ACCIONES = [
  FILAS[0],
  FILAS[1],
  fila({
    empresaId: 3,
    razonSocial: 'Retail C',
    ruc: '20699887766',
    contactoNombre: 'Marcela Soto',
    contactoCorreo: 'marcela@retail.com',
    enviosCiclo: 4,
  }),
  fila({
    empresaId: 4,
    razonSocial: 'Logística D',
    ruc: '20700112233',
    contactoNombre: 'Paola Ríos',
    contactoCorreo: 'paola@logistica.com',
    etapa: 'DESCANSO',
    descansoHasta: '2026-12-15',
    fechaCicloInicio: '2026-06-01',
    fechaUltimoEnvio: '2026-09-10',
    enviosCiclo: 4,
  }),
];

function detalle(overrides: Partial<DetalleEmpresa> = {}): DetalleEmpresa {
  return {
    empresa: {
      id: 1,
      ruc: '20489561234',
      rucNormalizado: '20489561234',
      razonSocial: 'Constructora A',
      tipo: 'Prospecto',
      origen: 'Outbound',
      proyectoObra: null,
      destinoComun: null,
      notas: null,
      responsable: null,
      sector: 'Construcción',
      cantidadTrabajadores: 45,
      contactos: [],
      createdAt: '2026-09-01T09:30:00.000Z',
      updatedAt: '2026-09-01T09:30:00.000Z',
    },
    pipeline: null,
    transiciones: [],
    handoffs: [],
    envios: [],
    ...overrides,
  };
}

/** The ficha timeline read (task 7.3) for the mounted ModalFichaEmpresa. */
const DETALLE_PANEL = detalle();

const fetchMock = vi.fn();

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status });
}

function mockPanel(filas: FilaPanelCrm[] = FILAS): void {
  fetchMock.mockResolvedValue(okResponse({ success: true, hoy: HOY, filas }));
}

interface OpcionesRutas {
  filas?: FilaPanelCrm[];
  respuestaEnvios?: () => Response | Promise<Response>;
  respuestaTransiciones?: () => Response | Promise<Response>;
}

/** URL-routed fetch mock (ModalFichaEmpresa.test precedent): the panel
 * GET rides /api/crm/panel, the ficha timeline rides .../detalle, and
 * the row actions POST .../envios | .../transiciones with their bodies
 * captured for assertions. */
function mockRutas(opciones: OpcionesRutas = {}): {
  urlsPanel: string[];
  urlsEnvios: string[];
  cuerposEnvios: string[];
  urlsTransiciones: string[];
  cuerposTransiciones: string[];
} {
  const urlsPanel: string[] = [];
  const urlsEnvios: string[] = [];
  const cuerposEnvios: string[] = [];
  const urlsTransiciones: string[] = [];
  const cuerposTransiciones: string[] = [];
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const cuerpo = typeof init?.body === 'string' ? init.body : '';
    if (url === '/api/crm/panel') {
      urlsPanel.push(url);
      return Promise.resolve(
        okResponse({ success: true, hoy: HOY, filas: opciones.filas ?? FILAS }),
      );
    }
    if (url.endsWith('/detalle')) {
      return Promise.resolve(okResponse({ success: true, ...DETALLE_PANEL }));
    }
    if (url.endsWith('/envios') && metodo === 'POST') {
      urlsEnvios.push(url);
      cuerposEnvios.push(cuerpo);
      const responder = opciones.respuestaEnvios;
      return Promise.resolve(responder ? responder() : okResponse({ success: true }));
    }
    if (url.endsWith('/transiciones') && metodo === 'POST') {
      urlsTransiciones.push(url);
      cuerposTransiciones.push(cuerpo);
      const responder = opciones.respuestaTransiciones;
      return Promise.resolve(responder ? responder() : okResponse({ success: true }));
    }
    return Promise.reject(new Error(`URL inesperada en el test: ${url}`));
  });
  return { urlsPanel, urlsEnvios, cuerposEnvios, urlsTransiciones, cuerposTransiciones };
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

describe('PanelCrm — costuras de modales 9.x (batch 14)', () => {
  it('opens the ficha modal from the empresa-name affordance (replaces the interim navigation)', async () => {
    const { urlsPanel } = mockRutas();
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Constructora A' }));

    const dialogo = await screen.findByRole('dialog', { name: 'Ficha de Constructora A' });
    expect(dialogo).toBeInTheDocument();
    // The interim /crm/empresas/{id} navigation pin is gone.
    expect(pushMock).not.toHaveBeenCalledWith('/crm/empresas/1');
    // The timeline read (task 7.3) fires for the ficha.
    await waitFor(() => expect(screen.getByText('Empresa en el CRM')).toBeInTheDocument());
    expect(urlsPanel).toEqual(['/api/crm/panel']);
  });

  it('opens ModalRespuesta with the positive radio preselected from ¿Respondió? (spec OP-7)', async () => {
    mockRutas();
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(
      within(filaDe('Constructora A')).getByRole('button', { name: '¿Respondió?' }),
    );

    const dialogo = await screen.findByRole('dialog', {
      name: 'Registrar Respuesta del Cliente',
    });
    expect(dialogo).toBeInTheDocument();
    expect(within(dialogo).getByText('Constructora A')).toBeInTheDocument();
    expect(
      within(dialogo).getByRole('radio', { name: /Respuesta Positiva/ }),
    ).toBeChecked();
  });

  it('swaps the ficha for ModalRespuesta when a ficha quick action reports the intent', async () => {
    mockRutas();
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Constructora A' }));
    await screen.findByRole('dialog', { name: 'Ficha de Constructora A' });

    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Ficha de Constructora A' })).getByRole(
        'button',
        { name: 'Respuesta Positiva (Tiene interés)' },
      ),
    );

    expect(
      await screen.findByRole('dialog', { name: 'Registrar Respuesta del Cliente' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Ficha de Constructora A' })).not.toBeInTheDocument();
  });

  it('closes ModalRespuesta and refreshes the panel after a successful answer', async () => {
    const { urlsPanel, urlsTransiciones, cuerposTransiciones } = mockRutas();
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(
      within(filaDe('Constructora A')).getByRole('button', { name: '¿Respondió?' }),
    );
    await screen.findByRole('dialog', { name: 'Registrar Respuesta del Cliente' });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y Aplicar Regla' }));

    // Positive default → AceptaciónOutbound through the EXISTING endpoint.
    expect(urlsTransiciones).toEqual(['/api/crm/empresas/1/transiciones']);
    expect(JSON.parse(cuerposTransiciones[0] ?? '{}')).toEqual({
      evento: 'AceptaciónOutbound',
    });
    await waitFor(() => expect(urlsPanel.length).toBe(2)); // refresh-after
    expect(
      screen.queryByRole('dialog', { name: 'Registrar Respuesta del Cliente' }),
    ).not.toBeInTheDocument();
  });

  it('mounts the Secuencia Completa section and opens its preview modal from a card', async () => {
    mockRutas();
    render(<PanelCrm />);

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Secuencia Completa de Correos (Incluye Reactivación tras 3 Meses)',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /1\. Carta de Presentación/ }));

    const dialogo = await screen.findByRole('dialog', { name: 'Vista del Mensaje' });
    expect(dialogo).toBeInTheDocument();

    await userEvent.click(
      within(dialogo).getByRole('button', { name: 'Entendido, cerrar' }),
    );
    expect(screen.queryByRole('dialog', { name: 'Vista del Mensaje' })).not.toBeInTheDocument();
  });
});

describe('PanelCrm — acciones de fila (decisión 13, batch 14)', () => {
  it('wires "Enviar carta" to POST /envios with the carta template and refreshes the panel', async () => {
    const { urlsPanel, urlsEnvios, cuerposEnvios } = mockRutas({ filas: FILAS_ACCIONES });
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(
      within(filaDe('Minera B')).getByRole('button', { name: 'Enviar carta' }),
    );

    expect(urlsEnvios).toEqual(['/api/crm/empresas/2/envios']);
    expect(JSON.parse(cuerposEnvios[0] ?? '{}')).toEqual({ plantilla: 'carta_presentacion' });
    await waitFor(() => expect(urlsPanel.length).toBe(2)); // refresh-after (ficha pattern)
  });

  it('wires "+1 Sem" to POST /envios with the next seguimiento template', async () => {
    const { urlsEnvios, cuerposEnvios } = mockRutas({ filas: FILAS_ACCIONES });
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(
      within(filaDe('Constructora A')).getByRole('button', { name: '+1 Sem' }),
    );

    expect(urlsEnvios).toEqual(['/api/crm/empresas/1/envios']);
    expect(JSON.parse(cuerposEnvios[0] ?? '{}')).toEqual({ plantilla: 'seguimiento_1' });
  });

  it('wires "Reactivar ya" to POST /envios with the reactivación template', async () => {
    const { urlsEnvios, cuerposEnvios } = mockRutas({ filas: FILAS_ACCIONES });
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(
      within(filaDe('Logística D')).getByRole('button', { name: 'Reactivar ya' }),
    );

    expect(urlsEnvios).toEqual(['/api/crm/empresas/4/envios']);
    expect(JSON.parse(cuerposEnvios[0] ?? '{}')).toEqual({ plantilla: 'reactivacion_3m' });
  });

  it('wires "Pausar 3m" to the T14 Rechazo transition and refreshes the panel', async () => {
    const { urlsPanel, urlsTransiciones, cuerposTransiciones } = mockRutas({
      filas: FILAS_ACCIONES,
    });
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(
      within(filaDe('Retail C')).getByRole('button', { name: 'Pausar 3m' }),
    );

    expect(urlsTransiciones).toEqual(['/api/crm/empresas/3/transiciones']);
    expect(JSON.parse(cuerposTransiciones[0] ?? '{}')).toEqual({
      evento: 'Rechazo',
      motivo: 'No tiene interés',
    });
    await waitFor(() => expect(urlsPanel.length).toBe(2));
  });

  it('surfaces a row-action API error in an alert, keeps the panel and re-enables the button', async () => {
    const { urlsPanel } = mockRutas({
      filas: FILAS_ACCIONES,
      respuestaEnvios: () => errorResponse(409, { error: 'El contacto no tiene correo registrado' }),
    });
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(
      within(filaDe('Minera B')).getByRole('button', { name: 'Enviar carta' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El contacto no tiene correo registrado',
    );
    expect(urlsPanel.length).toBe(1); // no refresh after failure
    expect(
      within(filaDe('Minera B')).getByRole('button', { name: 'Enviar carta' }),
    ).toBeEnabled();
  });

  it('disables the in-flight row buttons while the action posts, re-enabling after refresh', async () => {
    // Noop-initialized resolver (estados-del-fetch precedent): the
    // callback assignment below replaces it once the POST starts.
    let liberarEnvio: (r: Response) => void = () => {};
    const { urlsPanel } = mockRutas({
      filas: FILAS_ACCIONES,
      respuestaEnvios: () =>
        new Promise<Response>((res) => {
          liberarEnvio = res;
        }),
    });
    render(<PanelCrm />);

    await screen.findByRole('table');
    await userEvent.click(
      within(filaDe('Minera B')).getByRole('button', { name: 'Enviar carta' }),
    );

    const boton = within(filaDe('Minera B')).getByRole('button', { name: 'Enviar carta' });
    await waitFor(() => expect(boton).toBeDisabled());

    liberarEnvio(okResponse({ success: true }));

    await waitFor(() => expect(urlsPanel.length).toBe(2));
    expect(
      within(filaDe('Minera B')).getByRole('button', { name: 'Enviar carta' }),
    ).toBeEnabled();
  });
});
