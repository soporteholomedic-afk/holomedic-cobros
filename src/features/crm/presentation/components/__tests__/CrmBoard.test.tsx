import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import type { Empresa } from '../../../domain/entities';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { CrmBoard } from '../CrmBoard';

// ---- Helpers ----

function empresa(overrides: Partial<Empresa> = {}): Empresa {
  return {
    idEmpresa: 'e-1',
    razonSocial: 'Constructora Andina S.A.C.',
    ruc: '20512345678',
    sector: 'Construcción',
    contactoNombre: 'Marcela Quispe',
    contactoTelefono: '987 654 321',
    contactoCorreo: null,
    notas: null,
    etapa: 'por_contactar',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const LISTA: Empresa[] = [
  empresa(),
  empresa({ idEmpresa: 'e-2', razonSocial: 'Minera Los Tres Picos S.A.', ruc: '20601234567', sector: 'Minería y Energía', contactoNombre: 'Jorge Salazar', contactoTelefono: '954 112 308' }),
  empresa({ idEmpresa: 'e-3', razonSocial: 'Textiles Pacífico S.A.C.', ruc: '20556677889', sector: 'Fábrica y Producción', contactoNombre: 'Renzo Vargas', contactoTelefono: '998 201 456', etapa: 'contactado' }),
  empresa({ idEmpresa: 'e-4', razonSocial: 'Agroindustrial Valle Verde S.A.C.', ruc: '20534128790', sector: null, contactoNombre: 'Ana Torres', contactoTelefono: '936 018 552', etapa: 'cliente' }),
];

type Respuesta = { status: number; body: unknown };

function json(r: Respuesta): Response {
  return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response;
}

interface Api {
  lista?: Respuesta;
  post?: (body: Record<string, unknown>) => Respuesta;
  patch?: (id: string, body: Record<string, unknown>) => Respuesta;
}

function mockApi(api: Api = {}) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (url === '/api/crm/empresas' && method === 'GET') {
      return json(api.lista ?? { status: 200, body: { success: true, empresas: LISTA } });
    }
    if (url === '/api/crm/empresas' && method === 'POST') {
      return json(api.post ? api.post(body) : { status: 201, body: { success: true, empresa: empresa({ idEmpresa: 'e-9', ...(body as Partial<Empresa>), etapa: 'por_contactar' }) } });
    }
    const m = url.match(/^\/api\/crm\/empresas\/([^/]+)\/etapa$/);
    if (m && method === 'PATCH') {
      return json(api.patch ? api.patch(m[1], body) : { status: 200, body: { success: true, empresa: empresa({ idEmpresa: m[1], etapa: body.etapa as Empresa['etapa'] }) } });
    }
    throw new Error(`unexpected request ${method} ${url}`);
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function columna(nombre: string): HTMLElement {
  return screen.getByRole('region', { name: nombre });
}

async function cargado() {
  await screen.findByText('Constructora Andina S.A.C.');
}

function abrirPanel() {
  fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
  return screen.getByRole('dialog', { name: /Nueva empresa/ });
}

function llenar(panel: HTMLElement, valores: Record<string, string>) {
  for (const [etiqueta, valor] of Object.entries(valores)) {
    fireEvent.change(within(panel).getByLabelText(new RegExp(etiqueta)), { target: { value: valor } });
  }
}

const FORM_VALIDO = {
  'Razón social': 'Ferretería Industrial Norte S.A.C.',
  RUC: '20123456789',
  Nombre: 'Elena Mendoza',
  Teléfono: '955 201 334',
};

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Board ----

describe('CrmBoard — tablero', () => {
  it('shows each empresa in its own column with the column counts', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();

    const porContactar = columna('Por contactar');
    expect(within(porContactar).getByText('Minera Los Tres Picos S.A.')).toBeInTheDocument();
    expect(within(porContactar).getAllByRole('article')).toHaveLength(2);
    expect(within(porContactar).getByText('2')).toBeInTheDocument();
    expect(within(columna('Contactado')).getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument();
    expect(within(columna('En seguimiento')).queryAllByRole('article')).toHaveLength(0);
    expect(within(columna('Cliente')).getByText('Agroindustrial Valle Verde S.A.C.')).toBeInTheDocument();
  });

  it('renders the four columns in order and a card with its RUC, sector and contact', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();

    const nombres = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(nombres).toEqual(['Por contactar', 'Contactado', 'En seguimiento', 'Cliente']);

    const tarjeta = within(columna('Por contactar')).getAllByRole('article')[0];
    expect(within(tarjeta).getByText('RUC 20512345678')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Construcción')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Marcela Quispe')).toBeInTheDocument();
    expect(within(tarjeta).getByText('987 654 321')).toBeInTheDocument();
  });

  it('shows an empty hint in a column with no empresas', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    expect(within(columna('En seguimiento')).getByText('Arrastra una empresa aquí')).toBeInTheDocument();
  });

  it('shows an error with a retry button when the list cannot be loaded', async () => {
    const fn = mockApi({ lista: { status: 500, body: { success: false, error: 'Error al listar empresas' } } });
    render(<CrmBoard />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las empresas');
    expect(screen.queryAllByRole('article')).toHaveLength(0);

    const antes = fn.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(fn.mock.calls.length).toBe(antes + 1));
  });

  it('filters the cards by empresa, RUC or contact while searching', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();

    fireEvent.change(screen.getByLabelText('Buscar empresa o contacto'), { target: { value: 'minera' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('Minera Los Tres Picos S.A.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar empresa o contacto'), { target: { value: '20556677889' } });
    expect(screen.getByText('Textiles Pacífico S.A.C.')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Buscar empresa o contacto'), { target: { value: 'ana torres' } });
    expect(screen.getByText('Agroindustrial Valle Verde S.A.C.')).toBeInTheDocument();
  });
});

// ---- Side panel ----

describe('CrmBoard — panel lateral', () => {
  it('opens the panel floating OVER the board without altering the board layout (comment pr6cscqf)', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();

    const raiz = screen.getByTestId('crm-root');
    const tablero = screen.getByTestId('crm-board');
    const clasesRaiz = raiz.className;
    const clasesTablero = tablero.className;
    const tarjetasAntes = screen.getAllByRole('article').map((a) => a.className);

    const panel = abrirPanel();

    expect(panel.className).toMatch(/\bfixed\b/);
    expect(raiz.className).toBe(clasesRaiz);
    expect(tablero.className).toBe(clasesTablero);
    expect(raiz.getAttribute('style')).toBeNull();
    expect(screen.getAllByRole('article').map((a) => a.className)).toEqual(tarjetasAntes);
    expect(raiz.contains(panel)).toBe(true);
    // the board stays reachable: it is not hidden from assistive tech nor made inert
    expect(tablero).not.toHaveAttribute('inert');
    expect(tablero).not.toHaveAttribute('aria-hidden');
  });

  it('moves the focus to the first field when it opens', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    expect(within(panel).getByLabelText(/Razón social/)).toHaveFocus();
  });

  it('closes with Escape and with Cancelar, returning the focus to the button', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const boton = screen.getByRole('button', { name: /Nueva empresa/ });

    abrirPanel();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();

    const panel = abrirPanel();
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clears what was typed when it is closed and opened again', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    let panel = abrirPanel();
    llenar(panel, { 'Razón social': 'Algo a medias' });
    fireEvent.keyDown(document, { key: 'Escape' });

    panel = abrirPanel();
    expect(within(panel).getByLabelText(/Razón social/)).toHaveValue('');
  });
});

// ---- Create ----

describe('CrmBoard — crear empresa', () => {
  it('sends the form, puts the card first in "Por contactar", closes the panel and shows a notice', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();

    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    fireEvent.change(within(panel).getByLabelText(/Sector/), { target: { value: 'Construcción' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear empresa' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const post = fn.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post?.[0]).toBe('/api/crm/empresas');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      razonSocial: 'Ferretería Industrial Norte S.A.C.',
      ruc: '20123456789',
      sector: 'Construcción',
      contactoNombre: 'Elena Mendoza',
      contactoTelefono: '955 201 334',
    });

    const tarjetas = within(columna('Por contactar')).getAllByRole('article');
    expect(tarjetas).toHaveLength(3);
    expect(within(tarjetas[0]).getByText('Ferretería Industrial Norte S.A.C.')).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith('Empresa creada en “Por contactar”');
  });

  it('keeps the panel open with the server message when the RUC already exists', async () => {
    mockApi({ post: () => ({ status: 409, body: { success: false, error: 'Ya existe una empresa con el RUC: 20123456789' } }) });
    render(<CrmBoard />);
    await cargado();

    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear empresa' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent('Ya existe una empresa con el RUC: 20123456789');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(columna('Por contactar')).getAllByRole('article')).toHaveLength(2);
    expect(within(panel).getByLabelText(/Razón social/)).toHaveValue('Ferretería Industrial Norte S.A.C.');
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('does not call the server for a malformed RUC and says why', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();

    const panel = abrirPanel();
    llenar(panel, { ...FORM_VALIDO, RUC: '1234' });
    const form = panel.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);

    expect(within(panel).getByRole('alert')).toHaveTextContent('El RUC debe tener 11 dígitos');
    expect(fn.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    expect(within(columna('Por contactar')).getAllByRole('article')).toHaveLength(2);
  });

  it('limits the RUC field to 11 characters and marks the required fields', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    expect(within(panel).getByLabelText(/RUC/)).toHaveAttribute('maxlength', '11');
    for (const etiqueta of ['Razón social', 'RUC', 'Nombre', 'Teléfono']) {
      expect(within(panel).getByLabelText(new RegExp(etiqueta))).toBeRequired();
    }
    for (const etiqueta of ['Sector', 'Correo', 'Notas']) {
      expect(within(panel).getByLabelText(new RegExp(etiqueta))).not.toBeRequired();
    }
  });

  it('disables the submit button while the request is in flight', async () => {
    let liberar: (r: Response) => void = () => {};
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return json({ status: 200, body: { success: true, empresas: LISTA } });
      void url;
      return new Promise<Response>((resolve) => { liberar = resolve; });
    });
    global.fetch = fn as unknown as typeof fetch;
    render(<CrmBoard />);
    await cargado();

    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    fireEvent.click(within(panel).getByRole('button', { name: 'Crear empresa' }));
    await waitFor(() => expect(within(panel).getByRole('button', { name: /Creando/ })).toBeDisabled());

    liberar(json({ status: 201, body: { success: true, empresa: empresa({ idEmpresa: 'e-9' }) } }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

// ---- Move ----

describe('CrmBoard — mover tarjetas', () => {
  it('moves an empresa to the next column with its button and persists it', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();

    fireEvent.click(screen.getByRole('button', { name: 'Mover Constructora Andina S.A.C. a Contactado' }));

    await waitFor(() =>
      expect(within(columna('Contactado')).getByText('Constructora Andina S.A.C.')).toBeInTheDocument(),
    );
    expect(within(columna('Por contactar')).queryByText('Constructora Andina S.A.C.')).not.toBeInTheDocument();
    const patch = fn.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe('/api/crm/empresas/e-1/etapa');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ etapa: 'contactado' });
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('puts the empresa back and warns when the move cannot be saved', async () => {
    mockApi({ patch: () => ({ status: 500, body: { success: false, error: 'Error al mover la empresa' } }) });
    render(<CrmBoard />);
    await cargado();

    fireEvent.click(screen.getByRole('button', { name: 'Mover Constructora Andina S.A.C. a Contactado' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se pudo mover la empresa'));
    expect(within(columna('Por contactar')).getByText('Constructora Andina S.A.C.')).toBeInTheDocument();
    expect(within(columna('Contactado')).queryByText('Constructora Andina S.A.C.')).not.toBeInTheDocument();
  });

  it('has no previous column for the first one and no next column for the last one', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();

    expect(screen.queryByRole('button', { name: /Mover Constructora Andina S.A.C. a .*anterior/ })).not.toBeInTheDocument();
    const primera = within(columna('Por contactar')).getAllByRole('article')[0];
    expect(within(primera).getByRole('button', { name: /a Contactado$/ })).toBeEnabled();
    expect(within(primera).getByRole('button', { name: 'Sin columna anterior' })).toBeDisabled();

    const ultima = within(columna('Cliente')).getAllByRole('article')[0];
    expect(within(ultima).getByRole('button', { name: 'Sin columna siguiente' })).toBeDisabled();
    expect(within(ultima).getByRole('button', { name: /a En seguimiento$/ })).toBeEnabled();
  });

  it('moves an empresa dragged and dropped onto another column', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => 'e-2'), effectAllowed: '', dropEffect: '' };
    const tarjeta = screen.getByText('Minera Los Tres Picos S.A.').closest('article') as HTMLElement;
    fireEvent.dragStart(tarjeta, { dataTransfer });
    fireEvent.dragOver(columna('En seguimiento'), { dataTransfer });
    fireEvent.drop(columna('En seguimiento'), { dataTransfer });

    await waitFor(() =>
      expect(within(columna('En seguimiento')).getByText('Minera Los Tres Picos S.A.')).toBeInTheDocument(),
    );
    const patch = fn.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patch?.[0]).toBe('/api/crm/empresas/e-2/etapa');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ etapa: 'en_seguimiento' });
  });

  it('does nothing when an empresa is dropped on the column it already is in', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();

    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => 'e-1'), effectAllowed: '', dropEffect: '' };
    const tarjeta = screen.getByText('Constructora Andina S.A.C.').closest('article') as HTMLElement;
    fireEvent.dragStart(tarjeta, { dataTransfer });
    fireEvent.drop(columna('Por contactar'), { dataTransfer });

    expect(fn.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
  });
});
