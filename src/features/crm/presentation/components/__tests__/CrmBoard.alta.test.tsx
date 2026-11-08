import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { CrmBoard } from '../CrmBoard';
import { empresa, llamadas, mockApi, oportunidad } from './crmFixtures';

function columna(nombre: string): HTMLElement {
  return screen.getByRole('region', { name: nombre });
}

const LA_NUEVA = 'Ferretería Industrial Norte S.A.C.';
const DEAL = 'Exámenes de ingreso 2026';

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
  '^Razón social': LA_NUEVA,
  '^RUC': '20123456789',
  '^Nombre': 'Elena Mendoza',
  '^Teléfono': '955 201 334',
};

/** Enables the "Primera oportunidad (opcional)" section and fills its required name. */
function activarOportunidad(panel: HTMLElement, valores: Record<string, string> = { '^Nombre de la oportunidad': DEAL }) {
  fireEvent.click(within(panel).getByLabelText(/Crear también su primera oportunidad/));
  llenar(panel, valores);
}

const crear = (panel: HTMLElement) => fireEvent.click(within(panel).getByRole('button', { name: /Crear empresa/ }));

const dealCreado = (body: Record<string, unknown>) => ({
  status: 201,
  body: {
    success: true,
    oportunidad: oportunidad({
      idOportunidad: 'o-9',
      idEmpresa: String(body.idEmpresa),
      nombre: String(body.nombre),
      servicio: (body.servicio as string | null) ?? null,
      origen: (body.origen as never) ?? null,
      responsableNombre: (body.responsableNombre as string | null) ?? null,
      montoEstimado: (body.montoEstimado as number | null) ?? null,
    }),
  },
});

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CrmBoard — panel de alta (S7.1: la ficha sola)', () => {
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

  it('creates ONLY the ficha with ONE contact: one POST, no deal POST, no new card anywhere, closes, toasts, focus back', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    crear(panel);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Empresa creada'));
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(1);
    expect(llamadas(fn, 'POST', '/api/crm/empresas')[0]?.body).toEqual({
      razonSocial: LA_NUEVA,
      ruc: '20123456789',
      contactos: [{ nombre: 'Elena Mendoza', telefono: '955 201 334' }],
    });
    expect(llamadas(fn, 'POST', '/api/crm/oportunidades')).toHaveLength(0);
    // S2/S7.1: the new ficha has no oportunidades, so it adds no card to any column.
    expect(screen.queryByText(LA_NUEVA, { selector: 'h3' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: /Nueva empresa/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Nueva empresa/ })).toHaveFocus();
  });

  it('keeps the "Primera oportunidad" section collapsed (unchecked) until the checkbox is ticked', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    expect(within(panel).getByRole('group', { name: 'Primera oportunidad (opcional)' })).toBeInTheDocument();
    expect(within(panel).getByLabelText(/Crear también su primera oportunidad/)).not.toBeChecked();
    expect(within(panel).queryByLabelText(/^Nombre de la oportunidad/)).toBeNull();
    fireEvent.click(within(panel).getByLabelText(/Crear también su primera oportunidad/));
    expect(within(panel).getByLabelText(/^Nombre de la oportunidad/)).toBeInTheDocument();
    for (const etiqueta of [/^Servicio de interés/, /^Responsable/, /^Monto estimado/]) {
      expect(within(panel).getByLabelText(etiqueta)).toBeInTheDocument();
    }
    // Unticking hides the fields again.
    fireEvent.click(within(panel).getByLabelText(/Crear también su primera oportunidad/));
    expect(within(panel).queryByLabelText(/^Nombre de la oportunidad/)).toBeNull();
  });

  it('with the primera oportunidad enabled, POSTs the ficha and THEN the deal, and the new card lands first in Por contactar', async () => {
    const fn = mockApi({
      post: () => ({ status: 201, body: { success: true, empresa: empresa({ idEmpresa: 'e-9', razonSocial: LA_NUEVA, ruc: '20123456789' }) } }),
      nuevaOportunidad: (body) => dealCreado(body),
    });
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    activarOportunidad(panel, {
      '^Nombre de la oportunidad': ' Exámenes de ingreso 2026 ',
      '^Servicio de interés': ' Exámenes ocupacionales ',
      '^Responsable': ' Luis Cárdenas ',
      '^Monto estimado': ' 7500 ',
    });
    fireEvent.click(within(panel).getByRole('button', { name: /¿Cómo nos conoció\?/ }));
    fireEvent.click(within(panel).getByRole('option', { name: /^Referido por un cliente/ }));
    crear(panel);
    await waitFor(() => expect(within(columna('Por contactar')).getByText(DEAL)).toBeInTheDocument());
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(1);
    const deals = llamadas(fn, 'POST', '/api/crm/oportunidades');
    expect(deals).toHaveLength(1);
    expect(deals[0]!.body).toEqual({
      idEmpresa: 'e-9',
      nombre: 'Exámenes de ingreso 2026',
      servicio: 'Exámenes ocupacionales',
      origen: 'referido',
      responsableNombre: 'Luis Cárdenas',
      montoEstimado: 7500,
    });
    const titulos = within(columna('Por contactar')).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titulos[0]).toBe(LA_NUEVA);
    expect(toastMock.success).toHaveBeenCalledWith(`Oportunidad «${DEAL}» creada en «Por contactar»`);
    expect(screen.queryByRole('dialog', { name: /Nueva empresa/ })).toBeNull();
  });

  it('if the deal POST fails the FICHA stays created, the panel shows the error with a retry, and retrying sends ONLY the deal', async () => {
    let fallos = 0;
    const fn = mockApi({
      post: () => ({ status: 201, body: { success: true, empresa: empresa({ idEmpresa: 'e-9', razonSocial: LA_NUEVA, ruc: '20123456789' }) } }),
      nuevaOportunidad: (body) => {
        if (fallos === 0) {
          fallos++;
          return { status: 500, body: { success: false, error: 'Error al crear la oportunidad' } };
        }
        return dealCreado(body);
      },
    });
    render(<CrmBoard />);
    await cargado();
    const panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    activarOportunidad(panel);
    crear(panel);
    const alerta = await within(panel).findByRole('alert');
    expect(alerta).toHaveTextContent('quedó creada, pero la oportunidad no');
    expect(alerta).toHaveTextContent('Error al crear la oportunidad');
    // The ficha survived the failed second POST (batch semantics, S4).
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(1);
    expect(toastMock.success).toHaveBeenCalledWith('Empresa creada');
    expect(screen.queryByRole('dialog', { name: /Nueva empresa/ })).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Reintentar oportunidad' }));
    await waitFor(() => expect(within(columna('Por contactar')).getByText(DEAL)).toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: /Nueva empresa/ })).toBeNull();
    // The retry re-sent ONLY the deal: the ficha was never created twice.
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(1);
    expect(llamadas(fn, 'POST', '/api/crm/oportunidades')).toHaveLength(2);
    expect(toastMock.success).toHaveBeenCalledWith(`Oportunidad «${DEAL}» creada en «Por contactar»`);
  });

  it('rejects a missing deal name and a bad monto before calling anything', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    let panel = abrirPanel();
    llenar(panel, FORM_VALIDO);
    activarOportunidad(panel, { '^Nombre de la oportunidad': '   ' });
    crear(panel);
    expect(within(panel).getByRole('alert')).toHaveTextContent('Falta el nombre de la oportunidad');
    expect(within(panel).getByLabelText(/^Nombre de la oportunidad/)).toHaveFocus();
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(0);

    // The section stays open after the failed submit: fill it properly and try a bad monto.
    llenar(panel, { '^Nombre de la oportunidad': DEAL, '^Monto estimado': '0' });
    crear(panel);
    expect(within(panel).getByRole('alert')).toHaveTextContent('El monto estimado debe ser un número mayor a 0');
    expect(within(panel).getByLabelText(/^Monto estimado/)).toHaveFocus();
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(0);
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
      razonSocial: LA_NUEVA,
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
    expect(within(panel).getByLabelText(/^Razón social/)).toHaveValue(LA_NUEVA);
    expect(screen.queryByText(LA_NUEVA, { selector: 'h3' })).toBeNull();
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
    liberar({ ok: true, status: 201, json: async () => ({ success: true, empresa: { idEmpresa: 'e-9', razonSocial: 'X', ruc: '20123456789', sector: null, direccion: null, contactos: [{ nombre: 'E', telefono: '1', correo: null }], notas: null, relacion: 'prospecto', createdAt: '', updatedAt: '' } }) } as Response);
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
    expect(within(panel).getByLabelText(/^Razón social/)).toHaveValue(LA_NUEVA);
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
