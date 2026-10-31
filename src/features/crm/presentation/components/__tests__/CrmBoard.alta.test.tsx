import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { CrmBoard } from '../CrmBoard';
import { llamadas, mockApi } from './crmFixtures';

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
  '^Razón social': 'Ferretería Industrial Norte S.A.C.',
  '^RUC': '20123456789',
  '^Nombre': 'Elena Mendoza',
  '^Teléfono': '955 201 334',
};

const crear = (panel: HTMLElement) => fireEvent.click(within(panel).getByRole('button', { name: /Crear empresa/ }));

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CrmBoard — panel de alta', () => {
  it('opens as a floating panel (fixed, so the board does not move) with the focus on the first field', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    expect(panel.tagName).toBe('ASIDE');
    expect(panel.className).toMatch(/\bfixed\b/);
    expect(panel).toHaveAttribute('aria-modal', 'false');
    expect(within(panel).getByLabelText(/^Razón social/)).toHaveFocus();
    expect(screen.getByTestId('crm-board')).toBeInTheDocument();
  });

  it('creates the empresa with ONE contact, lands first in Por contactar, closes, toasts and returns the focus', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    crear(panel);
    await waitFor(() => expect(within(columna('Por contactar')).getByText('Ferretería Industrial Norte S.A.C.')).toBeInTheDocument());
    expect(llamadas(fn, 'POST', '/api/crm/empresas')[0]?.body).toEqual({
      razonSocial: 'Ferretería Industrial Norte S.A.C.',
      ruc: '20123456789',
      contactos: [{ nombre: 'Elena Mendoza', telefono: '955 201 334' }],
    });
    const titulos = within(columna('Por contactar')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titulos[0]).toBe('Ferretería Industrial Norte S.A.C.');
    expect(screen.queryByRole('dialog', { name: /Nueva empresa/ })).toBeNull();
    expect(toastMock.success).toHaveBeenCalledWith('Empresa creada en “Por contactar”');
    expect(screen.getByRole('button', { name: /Nueva empresa/ })).toHaveFocus();
  });

  it('sends the optional sector, email and notes only when they are filled', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    llenar(panel, { ...FORM_VALIDO, '^Correo': 'elena@ferrenorte.pe', '^Notas': 'Llegó por referido.' });
    fireEvent.change(within(panel).getByLabelText(/^Sector/), { target: { value: 'Construcción' } });
    crear(panel);
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/empresas')[0]?.body).toEqual({
      razonSocial: 'Ferretería Industrial Norte S.A.C.',
      ruc: '20123456789',
      sector: 'Construcción',
      notas: 'Llegó por referido.',
      contactos: [{ nombre: 'Elena Mendoza', telefono: '955 201 334', correo: 'elena@ferrenorte.pe' }],
    });
  });

  it.each([
    ['la razón social', { '^Razón social': '  ' }, /Falta la razón social/, /^Razón social/],
    ['un RUC de 10 dígitos', { '^RUC': '2012345678' }, /RUC debe tener 11 dígitos/, /^RUC/],
    ['un RUC con letras', { '^RUC': '2012345678A' }, /RUC debe tener 11 dígitos/, /^RUC/],
    ['el nombre del contacto', { '^Nombre': ' ' }, /Falta el nombre del contacto/, /^Nombre/],
    ['un teléfono de 8 dígitos', { '^Teléfono': '955 201 33' }, /teléfono debe tener 9 dígitos/, /^Teléfono/],
    ['un correo inválido', { '^Correo': 'mal@' }, /correo no es válido/, /^Correo/],
  ])('rejects %s before calling the server and puts the focus on the field', async (_n, cambio, mensaje, campo) => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    llenar(panel, { ...FORM_VALIDO, ...cambio });
    crear(panel);
    expect(within(panel).getByRole('alert')).toHaveTextContent(mensaje);
    expect(within(panel).getByLabelText(campo)).toHaveFocus();
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(0);
  });

  it('shows the server message, keeps the panel open and keeps what was typed when the RUC already exists', async () => {
    mockApi({ post: () => ({ status: 409, body: { success: false, error: 'Ya existe una empresa con el RUC: 20123456789' } }) });
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    crear(panel);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Ya existe una empresa con el RUC');
    expect(within(panel).getByLabelText(/^Razón social/)).toHaveValue('Ferretería Industrial Norte S.A.C.');
    expect(screen.queryByText('Ferretería Industrial Norte S.A.C.', { selector: 'h3' })).toBeNull();
    expect(within(panel).getByRole('button', { name: /Crear empresa/ })).toBeEnabled();
  });

  it('shows a generic message when the request itself fails', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    const original = fn.getMockImplementation();
    fn.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') throw new Error('network');
      return original!(url, init);
    });
    crear(panel);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No se pudo crear la empresa');
  });

  it('does not send twice while the first request is in flight', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    let liberar: (r: Response) => void = () => undefined;
    const original = fn.getMockImplementation();
    fn.mockImplementation((url: string, init?: RequestInit) =>
      (init?.method ?? 'GET') === 'POST'
        ? new Promise<Response>((res) => {
            liberar = res;
          })
        : original!(url, init),
    );
    crear(panel);
    expect(within(panel).getByRole('button', { name: /Creando/ })).toBeDisabled();
    fireEvent.submit(panel.querySelector('form') as HTMLFormElement);
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(1);
    liberar({ ok: true, status: 201, json: async () => ({ success: true, empresa: { idEmpresa: 'e-9', razonSocial: 'X', ruc: '20123456789', sector: null, contactos: [{ nombre: 'E', telefono: '1', correo: null }], notas: null, etapa: 'por_contactar', medio: null, motivo: null, createdAt: '', updatedAt: '' } }) } as Response);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Nueva empresa/ })).toBeNull());
  });

  it.each([
    ['Cancelar', (p: HTMLElement) => fireEvent.click(within(p).getByRole('button', { name: 'Cancelar' }))],
    ['la X', (p: HTMLElement) => fireEvent.click(within(p).getByRole('button', { name: 'Cerrar panel' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('%s closes the panel, discards what was typed and returns the focus to the button', async (_n, cerrar) => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    let panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    cerrar(panel);
    expect(screen.queryByRole('dialog', { name: /Nueva empresa/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Nueva empresa/ })).toHaveFocus();
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(0);
    panel = abrirPanel();
    expect(within(panel).getByLabelText(/^Razón social/)).toHaveValue('');
  });

  it('Escape does not close the panel while a medium dialog is open over it', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    abrirPanel();
    const tarjeta = screen.getByRole('heading', { name: 'Constructora Andina S.A.C.' }).closest('article') as HTMLElement;
    fireEvent.click(within(tarjeta).getByRole('button', { name: /Mover .* a Contactado/ }));
    expect(screen.getByRole('dialog', { name: /Cómo lo contactaste/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /Cómo lo contactaste/ })).toBeNull();
    expect(screen.getByRole('dialog', { name: /Nueva empresa/ })).toBeInTheDocument();
  });
});

describe('CrmBoard — sectores', () => {
  it('lists the sectors the API returned after "Sin definir"', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    const opciones = within(within(panel).getByLabelText(/^Sector/)).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['Sin definir', 'Comercio y Tiendas', 'Construcción', 'Fábrica y Producción', 'Minería y Energía']);
  });

  it('creates a sector from the mini form, adds it to the list and selects it', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    fireEvent.click(within(panel).getByRole('button', { name: /Nuevo sector/ }));
    const entrada = within(panel).getByLabelText(/Sector nuevo/);
    expect(entrada).toHaveFocus();
    fireEvent.change(entrada, { target: { value: '  Educación  ' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Agregar sector' }));
    await waitFor(() => expect(within(within(panel).getByLabelText(/^Sector$/)).getByRole('option', { name: 'Educación' })).toBeInTheDocument());
    expect(llamadas(fn, 'POST', '/api/crm/sectores')[0]?.body).toEqual({ nombre: 'Educación' });
    expect(within(panel).getByLabelText(/^Sector$/)).toHaveValue('Educación');
    expect(within(panel).queryByLabelText(/Sector nuevo/)).toBeNull();
    llenar(panel, FORM_VALIDO);
    crear(panel);
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/empresas')[0]?.body).toMatchObject({ sector: 'Educación' });
  });

  it('rejects an empty name and a sector that already exists (any case) without calling the server', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    fireEvent.click(within(panel).getByRole('button', { name: /Nuevo sector/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Agregar sector' }));
    expect(within(panel).getByText(/Escribe el nombre del sector/)).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText(/Sector nuevo/), { target: { value: 'CONSTRUCCIÓN' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Agregar sector' }));
    expect(within(panel).getByText(/Ese sector ya existe/)).toBeInTheDocument();
    expect(llamadas(fn, 'POST', '/api/crm/sectores')).toHaveLength(0);
  });

  it('shows the server message when the sector cannot be created and keeps the mini form open', async () => {
    mockApi({ sector: () => ({ status: 409, body: { success: false, error: 'Ya existe el sector: Educación' } }) });
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    fireEvent.click(within(panel).getByRole('button', { name: /Nuevo sector/ }));
    fireEvent.change(within(panel).getByLabelText(/Sector nuevo/), { target: { value: 'Educación' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Agregar sector' }));
    expect(await within(panel).findByText(/Ya existe el sector: Educación/)).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Sector nuevo/)).toBeInTheDocument();
  });

  it('Escape inside the mini form closes only the mini form and keeps the panel and what was typed', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    fireEvent.click(within(panel).getByRole('button', { name: /Nuevo sector/ }));
    fireEvent.keyDown(within(panel).getByLabelText(/Sector nuevo/), { key: 'Escape' });
    expect(within(panel).queryByLabelText(/Sector nuevo/)).toBeNull();
    expect(screen.getByRole('dialog', { name: /Nueva empresa/ })).toBeInTheDocument();
    expect(within(panel).getByLabelText(/^Razón social/)).toHaveValue('Ferretería Industrial Norte S.A.C.');
    expect(within(panel).getByRole('button', { name: /Nuevo sector/ })).toHaveFocus();
  });

  it('keeps working with no sectors when the sectors request fails', async () => {
    const fn = mockApi({ sectores: { status: 500, body: { success: false, error: 'x' } } });
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    expect(within(within(panel).getByLabelText(/^Sector/)).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sin definir']);
    llenar(panel, FORM_VALIDO);
    crear(panel);
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(1));
  });
});
