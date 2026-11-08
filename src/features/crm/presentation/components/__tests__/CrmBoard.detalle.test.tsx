import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

// The activity panel itself is T8 land (still on the old empresa-card model);
// this suite pins the T7 wiring: the ficha opens the flow for one of its deals.
vi.mock('../RegistrarContactoPanel', async () => {
  const { createElement } = await import('react');
  return {
    RegistrarContactoPanel: () =>
      createElement('aside', { role: 'dialog', 'aria-label': 'Registrar actividad' }, createElement('h2', null, 'Registrar actividad')),
  };
});

import { CrmBoard } from '../CrmBoard';
import { LISTA, empresa, json, llamadas, mockApi, oportunidad, type Respuesta } from './crmFixtures';

const TEXTILES = 'Textiles Pacífico S.A.C.';

/** One empresa can hold several oportunidades, so several cards share its name; [0] is the first in the board. */
function tarjetasDe(nombre: string): HTMLElement[] {
  return screen
    .getAllByRole('heading', { level: 3, name: nombre })
    .map((h) => h.closest('article') as HTMLElement);
}

function tarjeta(nombre: string): HTMLElement {
  return tarjetasDe(nombre)[0]!;
}

async function cargado() {
  await screen.findByText('Constructora Andina S.A.C.');
}

/** Click on the card body (not on a button) and return the detail panel. */
function abrir(nombre: string): HTMLElement {
  fireEvent.click(within(tarjeta(nombre)).getByText(/^RUC /));
  return screen.getByRole('dialog', { name: nombre });
}

function editar(nombre: string): HTMLElement {
  const panel = abrir(nombre);
  fireEvent.click(within(panel).getByRole('button', { name: 'Editar' }));
  return panel;
}

const contactos = (panel: HTMLElement) => within(panel).getAllByRole('group', { name: /^Contacto/ });
const campo = (panel: HTMLElement, etiqueta: RegExp) => within(panel).getByLabelText(etiqueta);
const escribir = (el: HTMLElement, valor: string) => fireEvent.change(el, { target: { value: valor } });
const guardar = (panel: HTMLElement) => fireEvent.click(within(panel).getByRole('button', { name: 'Guardar cambios' }));

/** The ficha row of one dl label (e.g. "Actividad de servicios"). */
const fila = (panel: HTMLElement, etiqueta: string) =>
  within(panel).getByText(etiqueta).closest('div') as HTMLElement;

beforeEach(() => {
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  toastMock.info.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Detalle — abrir y cerrar', () => {
  it('opens as a floating side panel with the focus on its title and highlights the card', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    expect(panel.tagName).toBe('ASIDE');
    expect(panel.className).toMatch(/\bfixed\b/);
    expect(panel).toHaveAttribute('aria-modal', 'false');
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveFocus();
    expect(tarjeta(TEXTILES)).toHaveAttribute('aria-current', 'true');
    expect(tarjeta('Constructora Andina S.A.C.')).not.toHaveAttribute('aria-current');
  });

  it('opens with Enter and Space on the card, but not with Enter on a button inside it', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const t = tarjeta(TEXTILES);
    fireEvent.keyDown(within(t).getByRole('button', { name: /Medio: Llamada/ }), { key: 'Enter' });
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
    fireEvent.keyDown(t, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: TEXTILES })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    fireEvent.keyDown(t, { key: ' ' });
    expect(screen.getByRole('dialog', { name: TEXTILES })).toBeInTheDocument();
  });

  it('the move arrows and the medium chip of a card do not open the detail', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(within(tarjeta(TEXTILES)).getByRole('button', { name: /Medio: Llamada/ }));
    expect(screen.getByRole('dialog', { name: /Editar medio de contacto/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(within(tarjeta(TEXTILES)).getByRole('button', { name: /Mover .* a En seguimiento/ }));
    await waitFor(() =>
      expect(within(screen.getByRole('region', { name: 'En seguimiento' })).getByText(TEXTILES)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
  });

  it.each([
    ['la X', () => fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('%s closes the detail and returns the focus to the card', async (_n, cerrar) => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    abrir(TEXTILES);
    cerrar();
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
    expect(tarjeta(TEXTILES)).toHaveFocus();
    expect(tarjeta(TEXTILES)).not.toHaveAttribute('aria-current');
  });

  it('Escape closes only the medium dialog when it is open over the detail', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    fireEvent.click(within(panel).getByRole('button', { name: 'Cambiar medio' }));
    expect(screen.getByRole('dialog', { name: /Editar medio de contacto/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /Editar medio de contacto/ })).toBeNull();
    expect(screen.getByRole('dialog', { name: TEXTILES })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Cambiar medio' })).toHaveFocus();
  });

  it('clicking another card switches the detail to it', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    abrir(TEXTILES);
    abrir('Minera Los Tres Picos S.A.');
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
    expect(tarjeta('Minera Los Tres Picos S.A.')).toHaveAttribute('aria-current', 'true');
  });
});

describe('Detalle — relación (S6.3: manual, nunca derivada)', () => {
  it('shows the relación chip in the header under the title', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    const cabecera = panel.querySelector('header') as HTMLElement;
    expect(within(cabecera).getByText('Prospecto')).toBeInTheDocument();
    expect(within(cabecera).getByRole('button', { name: 'Cambiar a cliente' })).toBeInTheDocument();
  });

  it('a cliente offers the opposite toggle', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir('Agroindustrial Valle Verde S.A.C.');
    const cabecera = panel.querySelector('header') as HTMLElement;
    expect(within(cabecera).getByText('Cliente')).toBeInTheDocument();
    expect(within(cabecera).getByRole('button', { name: 'Cambiar a prospecto' })).toBeInTheDocument();
  });

  it('the toggle PATCHes /api/crm/empresas/[id]/relacion and the chip flips', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    const cabecera = panel.querySelector('header') as HTMLElement;
    fireEvent.click(within(cabecera).getByRole('button', { name: 'Cambiar a cliente' }));
    await waitFor(() => expect(within(cabecera).getByText('Cliente')).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /relacion$/)).toEqual([
      { url: '/api/crm/empresas/e-3/relacion', body: { relacion: 'cliente' } },
    ]);
    expect(within(cabecera).getByRole('button', { name: 'Cambiar a prospecto' })).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith('La empresa ahora es cliente.');
  });

  it('a failed change keeps the chip and shows the error next to it', async () => {
    mockApi({ relacion: () => ({ status: 500, body: { success: false, error: 'No se pudo guardar la relación' } }) });
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    const cabecera = panel.querySelector('header') as HTMLElement;
    fireEvent.click(within(cabecera).getByRole('button', { name: 'Cambiar a cliente' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No se pudo guardar la relación');
    expect(within(cabecera).getByText('Prospecto')).toBeInTheDocument();
  });

  it('losing an oportunidad never PATCHes the relacion: the manual change is the only path (S6.3)', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    // Move the WON deal straight to Perdida (the next column of Ganada): the ficha stays Prospecta.
    const ganada = tarjetasDe(TEXTILES).find((t) => t.textContent?.includes('Campaña de vacunación 2025')) as HTMLElement;
    fireEvent.click(within(ganada).getByRole('button', { name: /Mover .* a Perdida/ }));
    const dialogo = screen.getByRole('dialog', { name: /Motivo de la pérdida/ });
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Sin interés' }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(within(panel).getByText('Perdida')).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /relacion$/)).toHaveLength(0);
    const cabecera = panel.querySelector('header') as HTMLElement;
    expect(within(cabecera).getByText('Prospecto')).toBeInTheDocument();
  });
});

describe('Detalle — actividad de servicios (S6.6/S6.7: señal de SIGLA)', () => {
  const casos = [
    ['sin_informacion', null, 'Sin información'],
    ['pendiente_primera', null, 'Pendiente de primera atención'],
    ['reciente', '2026-11-05', 'Actividad reciente · Última atención: 05/11/2026'],
    ['sin_actividad', '2026-05-01', 'Sin actividad de servicios reciente · Última atención: 01/05/2026'],
  ] as const;

  it.each(casos)('estado %s shows «%s» and never calls the empresa inactive', async (estado, ultima, texto) => {
    const fn = mockApi({
      atencion: () => ({
        status: 200,
        body: { success: true, actividad: { ultimaAtencion: ultima, ruc: ultima ? '20556677889' : null }, estado },
      }),
    });
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    const f = fila(panel, 'Actividad de servicios');
    expect(await within(f).findByText(texto)).toBeInTheDocument();
    expect(within(panel).queryByText(/inactiva/i)).toBeNull();
    expect(llamadas(fn, 'GET', /\/atencion$/)).toHaveLength(1);
    const init = fn.mock.calls.find(([u]) => String(u).endsWith('/atencion'))?.[1] as RequestInit;
    expect(init?.cache).toBe('no-store');
  });

  it('the row explains its source in a title hint: SIGLA, not calls (S6.6)', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    expect(within(panel).getByText('Actividad de servicios').getAttribute('title')).toMatch(/SIGLA/);
  });

  it('while loading it shows a dash, and a SIGLA failure is reported without inventing inactivity', async () => {
    mockApi();
    const base = global.fetch;
    let soltar: (r: Respuesta) => void = () => undefined;
    const espera = new Promise<Respuesta>((r) => (soltar = r));
    global.fetch = vi.fn(async (u: string, i?: RequestInit) =>
      String(u).endsWith('/atencion') ? espera.then((r) => json(r)) : base(u, i),
    ) as unknown as typeof fetch;
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    const f = fila(panel, 'Actividad de servicios');
    expect(within(f).getByText('—')).toBeInTheDocument();
    soltar({ status: 503, body: { success: false, error: 'No se pudo consultar la última atención en SIGLA' } });
    expect(await within(f).findByText('No se pudo consultar en SIGLA')).toBeInTheDocument();
    expect(within(panel).queryByText(/inactiva/i)).toBeNull();
  });
});

describe('Detalle — contenido', () => {
  it('shows empresa, every contact with phone and email as links, the principal marked, medium and empty notes', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    expect(within(panel).getByText('Fábrica y Producción')).toBeInTheDocument();
    expect(within(panel).getByText('20556677889')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Contactos (2)' })).toBeInTheDocument();
    expect(within(panel).getByText('Principal')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: '998 201 456' })).toHaveAttribute('href', 'tel:998201456');
    expect(within(panel).getByRole('link', { name: 'renzo@tp.pe' })).toHaveAttribute('href', 'mailto:renzo@tp.pe');
    expect(within(panel).getByText('Lucía Prado')).toBeInTheDocument();
    expect(within(panel).getByText('Sin correo registrado')).toBeInTheDocument();
    expect(within(panel).getByText('Llamada')).toBeInTheDocument();
    expect(within(panel).getByText('Sin notas')).toBeInTheDocument();
    expect(within(panel).getByText('Contactado')).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Oportunidades · 2 registradas' })).toBeInTheDocument();
  });

  it('lists every oportunidad of the empresa with its etapa chip; each deal keeps its medio controls', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    const seccion = within(panel).getByRole('heading', { name: 'Oportunidades · 2 registradas' }).closest(
      'section',
    ) as HTMLElement;
    const items = within(seccion).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText('Exámenes de ingreso')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Contactado')).toBeInTheDocument();
    expect(within(items[0]!).getByRole('button', { name: 'Cambiar medio' })).toBeInTheDocument();
    expect(within(items[1]!).getByText('Campaña de vacunación 2025')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Ganada')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Sin medio registrado')).toBeInTheDocument();
    // A closed deal offers no medio buttons.
    expect(within(items[1]!).queryByRole('button', { name: /medio/i })).toBeNull();
  });

  it('the "Registrar actividad" footer is always offered, even when every deal is lost (S3/S6.4)', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir('Ferretería El Maestro S.R.L.');
    expect(within(panel).getByRole('button', { name: 'Registrar actividad' })).toBeInTheDocument();
  });

  it('"Registrar actividad" from the ficha opens the activity flow for one of its oportunidades', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    fireEvent.click(within(panel).getByRole('button', { name: 'Registrar actividad' }));
    expect(await screen.findByRole('dialog', { name: 'Registrar actividad' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
  });

  it('a single contact has no "Principal" tag, and a missing medium offers no button while in Por contactar', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir('Constructora Andina S.A.C.');
    expect(within(panel).getByRole('heading', { name: 'Contacto' })).toBeInTheDocument();
    expect(within(panel).queryByText('Principal')).toBeNull();
    const seccion = within(panel).getByRole('heading', { name: 'Oportunidades · 1 registrada' }).closest(
      'section',
    ) as HTMLElement;
    expect(within(seccion).getByText('Sin medio registrado')).toBeInTheDocument();
    expect(within(seccion).queryByRole('button', { name: /medio/i })).toBeNull();
    expect(within(panel).queryByRole('heading', { name: /Motivo/ })).toBeNull();
  });

  it('an open oportunidad without medium offers "Registrar medio"', async () => {
    mockApi({
      lista: { status: 200, body: { success: true, empresas: [empresa({ notas: 'Llegó por referido.' })] } },
      oportunidades: {
        status: 200,
        body: { success: true, oportunidades: [oportunidad({ etapa: 'en_seguimiento', medio: null })] },
      },
    });
    render(<CrmBoard />);
    await cargado();
    const panel = abrir('Constructora Andina S.A.C.');
    expect(within(panel).getByRole('button', { name: 'Registrar medio' })).toBeInTheDocument();
    expect(within(panel).getByText('Llegó por referido.')).toBeInTheDocument();
  });

  it('"Cambiar medio" from the ficha PATCHes the oportunidad /seguimiento, updates panel and card, keeps the panel open and returns the focus', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    fireEvent.click(within(panel).getByRole('button', { name: 'Cambiar medio' }));
    const dialogo = screen.getByRole('dialog', { name: /Editar medio de contacto/ });
    expect(within(dialogo).getByRole('radio', { name: /Llamada/ })).toBeChecked();
    fireEvent.click(within(dialogo).getByRole('radio', { name: /Correo/ }));
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    const item = (await within(panel).findAllByRole('listitem'))[0]!;
    expect(await within(item).findByText('Correo')).toBeInTheDocument();
    expect(llamadas(fn, 'PATCH', /seguimiento$/)).toEqual([
      { url: '/api/crm/oportunidades/o-3/seguimiento', body: { medio: 'correo' } },
    ]);
    expect(within(tarjeta(TEXTILES)).getByRole('button', { name: /Medio: Correo/ })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: TEXTILES })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Cambiar medio' })).toHaveFocus();
  });

  it('a lost oportunidad shows its reason in the ficha and "Editar motivo" updates it via /seguimiento', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir('Ferretería El Maestro S.R.L.');
    expect(within(panel).getByRole('heading', { name: 'Motivo de la pérdida' })).toBeInTheDocument();
    expect(within(panel).getByText(/Proveedor: Distribuidora Norte S\.A\.C\./)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Editar motivo' }));
    const dialogo = screen.getByRole('dialog', { name: /Motivo de la pérdida/ });
    expect(within(dialogo).getByRole('radio', { name: 'Ya tienen proveedor' })).toBeChecked();
    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Precio' }));
    escribir(within(dialogo).getByLabelText(/Precio que les ofrecimos/), 'S/ 7,000');
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(within(panel).getByText(/Ofrecimos: S\/ 7,000/)).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', /seguimiento$/)).toHaveLength(1);
    expect(llamadas(fn, 'PATCH', /seguimiento$/)[0]?.url).toBe('/api/crm/oportunidades/o-7/seguimiento');
    expect(llamadas(fn, 'PATCH', /seguimiento$/)[0]?.body).toMatchObject({ motivo: { categoria: 'precio', detalle1: 'S/ 7,000' } });
    expect(within(panel).getByRole('button', { name: 'Editar motivo' })).toHaveFocus();
  });

  it('moving an oportunidad from the board while the ficha is open updates its etapa chip in the panel', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = abrir(TEXTILES);
    fireEvent.click(within(tarjeta(TEXTILES)).getByRole('button', { name: /Mover .* a En seguimiento/ }));
    await waitFor(() => expect(within(panel).getByText('En seguimiento')).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: TEXTILES })).toBeInTheDocument();
  });
});

describe('Detalle — editar', () => {
  it('opens the form prefilled with the focus on the razón social; the ficha data (relación) is not editable there', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    expect(campo(panel, /^Razón social/)).toHaveValue(TEXTILES);
    expect(campo(panel, /^RUC/)).toHaveValue('20556677889');
    expect(campo(panel, /^Sector/)).toHaveValue('Fábrica y Producción');
    expect(campo(panel, /^Notas/)).toHaveValue('');
    expect(campo(panel, /^Razón social/)).toHaveFocus();
    expect(contactos(panel)).toHaveLength(2);
    expect(within(contactos(panel)[0]!).getByLabelText(/^Nombre/)).toHaveValue('Renzo Vargas');
    expect(within(contactos(panel)[1]!).getByLabelText(/^Correo/)).toHaveValue('');
    expect(within(panel).queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /Cambiar a / })).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it.each([
    ['la razón social vacía', () => ['^Razón social', '  '], /Falta la razón social/, /^Razón social/],
    ['un RUC de 3 dígitos', () => ['^RUC', '123'], /RUC debe tener 11 dígitos/, /^RUC/],
    ['el RUC de otra empresa', () => ['^RUC', '20601234567'], /Ya existe otra empresa con ese RUC/, /^RUC/],
  ])('rejects %s before calling the server: message, aria-invalid and focus', async (_n, cambio, mensaje, etiqueta) => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    const [campoNombre, valor] = cambio();
    escribir(campo(panel, new RegExp(campoNombre!)), valor!);
    guardar(panel);
    expect(within(panel).getByRole('alert')).toHaveTextContent(mensaje);
    const el = campo(panel, etiqueta);
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(el).toHaveFocus();
    expect(llamadas(fn, 'PATCH', /empresas\/e-3$/)).toHaveLength(0);
    escribir(el, '20556677889x'.slice(0, 11));
    expect(el).not.toHaveAttribute('aria-invalid');
  });

  it.each([
    ['nombre vacío', 'Nombre', ' ', /Contacto 2: falta el nombre/],
    ['teléfono de 5 dígitos', 'Teléfono', '99820', /Contacto 2: el teléfono debe tener 9 dígitos/],
    ['correo inválido', 'Correo', 'mal@', /Contacto 2: el correo no es válido/],
  ])('rejects a second contact with %s and focuses that field', async (_n, etiqueta, valor, mensaje) => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    const campoMalo = within(contactos(panel)[1]!).getByLabelText(new RegExp(`^${etiqueta}`));
    escribir(campoMalo, valor);
    guardar(panel);
    expect(within(panel).getByRole('alert')).toHaveTextContent(mensaje);
    expect(campoMalo).toHaveFocus();
    expect(llamadas(fn, 'PATCH', /empresas\/e-3$/)).toHaveLength(0);
  });

  it('saves with the exact body, shows the new data in the panel and the card, toasts and returns the focus to Editar', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    escribir(campo(panel, /^Razón social/), '  Textiles del Pacífico S.A.  ');
    escribir(campo(panel, /^Sector/), 'Construcción');
    escribir(campo(panel, /^Notas/), 'Prefieren WhatsApp.');
    escribir(within(contactos(panel)[0]!).getByLabelText(/^Correo/), 'nuevo@tp.pe');
    guardar(panel);
    await waitFor(() => expect(within(panel).queryByLabelText(/^Razón social/)).toBeNull());
    expect(llamadas(fn, 'PATCH', /empresas\/e-3$/)).toEqual([
      {
        url: '/api/crm/empresas/e-3',
        body: {
          razonSocial: 'Textiles del Pacífico S.A.',
          ruc: '20556677889',
          sector: 'Construcción',
          notas: 'Prefieren WhatsApp.',
          contactos: [
            { nombre: 'Renzo Vargas', telefono: '998 201 456', correo: 'nuevo@tp.pe' },
            { nombre: 'Lucía Prado', telefono: '998 220 145' },
          ],
        },
      },
    ]);
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('Textiles del Pacífico S.A.');
    expect(within(panel).getByText('Prefieren WhatsApp.')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'nuevo@tp.pe' })).toBeInTheDocument();
    expect(within(tarjeta('Textiles del Pacífico S.A.')).getByRole('heading', { level: 3, name: 'Textiles del Pacífico S.A.' })).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith('Cambios guardados');
    expect(within(panel).getByRole('button', { name: 'Editar' })).toHaveFocus();
  });

  it('Enter inside a field saves, and clearing the sector omits it from the body', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    escribir(campo(panel, /^Sector/), '');
    fireEvent.submit(panel.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(llamadas(fn, 'PATCH', /empresas\/e-3$/)).toHaveLength(1));
    expect(llamadas(fn, 'PATCH', /empresas\/e-3$/)[0]?.body).not.toHaveProperty('sector');
    expect(llamadas(fn, 'PATCH', /empresas\/e-3$/)[0]?.body).not.toHaveProperty('notas');
  });

  it('adds a contact with the focus on its name; an empty one is rejected; a filled one is saved and the card shows "+2 contactos"', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    fireEvent.click(within(panel).getByRole('button', { name: 'Agregar contacto' }));
    expect(contactos(panel)).toHaveLength(3);
    const nuevo = contactos(panel)[2]!;
    expect(within(nuevo).getByLabelText(/^Nombre/)).toHaveFocus();
    expect(within(panel).getByRole('status')).toHaveTextContent('Contacto agregado');
    guardar(panel);
    expect(within(panel).getByRole('alert')).toHaveTextContent('Contacto 3: falta el nombre');
    escribir(within(nuevo).getByLabelText(/^Nombre/), 'Mario Quispe');
    escribir(within(nuevo).getByLabelText(/^Teléfono/), '987 654 321');
    guardar(panel);
    // The board cards no longer list contacts; the ficha does (S3).
    await waitFor(() => expect(within(panel).getByRole('heading', { name: 'Contactos (3)' })).toBeInTheDocument());
    const body = llamadas(fn, 'PATCH', /empresas\/e-3$/)[0]?.body as { contactos: { nombre: string }[] };
    expect(body.contactos.map((c) => c.nombre)).toEqual(['Renzo Vargas', 'Lucía Prado', 'Mario Quispe']);
  });

  it('"Hacer principal" moves that contact first and the card shows it as the principal', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    expect(within(contactos(panel)[0]!).queryByRole('button', { name: /Hacer principal/ })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Hacer principal al contacto 2' }));
    expect(within(contactos(panel)[0]!).getByLabelText(/^Nombre/)).toHaveValue('Lucía Prado');
    expect(within(contactos(panel)[0]!).getByLabelText(/^Nombre/)).toHaveFocus();
    guardar(panel);
    // The saved order lands on the ficha's contact list: Lucía first, marked Principal.
    await waitFor(async () => {
      const vista = within(panel).getByRole('heading', { name: 'Contactos (2)' }).closest('section') as HTMLElement;
      const items = within(vista).getAllByRole('listitem');
      expect(within(items[0]!).getByText('Lucía Prado')).toBeInTheDocument();
      expect(within(items[0]!).getByText('Principal')).toBeInTheDocument();
    });
    const body = llamadas(fn, 'PATCH', /empresas\/e-3$/)[0]?.body as { contactos: { nombre: string }[] };
    expect(body.contactos.map((c) => c.nombre)).toEqual(['Lucía Prado', 'Renzo Vargas']);
    expect(within(panel).getAllByText('Principal')).toHaveLength(1);
  });

  it('removes a contact, never offers to remove the only one, and saves one contact', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    fireEvent.click(within(panel).getByRole('button', { name: 'Quitar contacto 2' }));
    expect(contactos(panel)).toHaveLength(1);
    expect(within(panel).queryByRole('button', { name: /Quitar/ })).toBeNull();
    expect(within(panel).getByRole('status')).toHaveTextContent('Contacto quitado');
    guardar(panel);
    await waitFor(() => expect(within(tarjeta(TEXTILES)).queryByText(/\+1 contacto/)).toBeNull());
    expect((llamadas(fn, 'PATCH', /empresas\/e-3$/)[0]?.body as { contactos: unknown[] }).contactos).toHaveLength(1);
  });

  it('stops offering "Agregar contacto" at 10 contacts', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar('Constructora Andina S.A.C.');
    for (let i = 0; i < 9; i++) fireEvent.click(within(panel).getByRole('button', { name: 'Agregar contacto' }));
    expect(contactos(panel)).toHaveLength(10);
    expect(within(panel).getByRole('button', { name: 'Agregar contacto' })).toBeDisabled();
  });

  it('shows the server message and keeps the form and what was typed when the RUC already exists', async () => {
    mockApi({ put: () => ({ status: 409, body: { success: false, error: 'Ya existe una empresa con el RUC: 20556677889' } }) });
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    escribir(campo(panel, /^Notas/), 'texto');
    guardar(panel);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Ya existe una empresa con el RUC');
    expect(campo(panel, /^Notas/)).toHaveValue('texto');
    expect(within(panel).getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });

  it('does not send twice while the first save is in flight', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    escribir(campo(panel, /^Notas/), 'texto');
    let liberar: (r: Response) => void = () => undefined;
    const original = fn.getMockImplementation();
    fn.mockImplementation((url: string, init?: RequestInit) =>
      (init?.method ?? 'GET') === 'PATCH'
        ? new Promise<Response>((res) => {
            liberar = res;
          })
        : original!(url, init),
    );
    guardar(panel);
    expect(within(panel).getByRole('button', { name: /Guardando/ })).toBeDisabled();
    fireEvent.submit(panel.querySelector('form') as HTMLFormElement);
    expect(llamadas(fn, 'PATCH', /empresas\/e-3$/)).toHaveLength(1);
    liberar({ ok: false, status: 409, json: async () => ({ success: false, error: 'Ya existe' }) } as Response);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Ya existe');
  });

  it('shows a generic message when the request fails', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    const original = fn.getMockImplementation();
    fn.mockImplementation(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PATCH') throw new Error('network');
      return original!(url, init);
    });
    escribir(campo(panel, /^Notas/), 'texto');
    guardar(panel);
    expect(await within(panel).findByRole('alert')).toHaveTextContent('No se pudo guardar la empresa');
  });
});

describe('Detalle — cambios sin guardar', () => {
  it('without changes, Cancelar leaves edit mode and the X closes without asking', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    let panel = editar(TEXTILES);
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancelar' }));
    expect(within(panel).queryByLabelText(/^Razón social/)).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Editar' })).toHaveFocus();
    fireEvent.click(within(panel).getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
    panel = editar(TEXTILES);
    escribir(campo(panel, /^Notas/), 'x');
    escribir(campo(panel, /^Notas/), '');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
  });

  it.each([
    ['la X', () => fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }))],
    ['Cancelar', () => fireEvent.click(within(screen.getByRole('dialog', { name: TEXTILES })).getByRole('button', { name: 'Cancelar' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['otra tarjeta', () => fireEvent.click(within(tarjeta('Minera Los Tres Picos S.A.')).getByText(/^RUC /))],
    ['Nueva empresa', () => fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }))],
  ])('with changes, %s asks first and closes nothing', async (_n, salir) => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    escribir(campo(panel, /^Notas/), 'cambio sin guardar');
    salir();
    expect(within(panel).getByRole('alert')).toHaveTextContent('Tienes cambios sin guardar');
    expect(screen.getByRole('dialog', { name: TEXTILES })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Nueva empresa/ })).toBeNull();
    expect(campo(panel, /^Notas/)).toHaveValue('cambio sin guardar');
    expect(within(panel).getByRole('button', { name: 'Seguir editando' })).toHaveFocus();
    expect(llamadas(fn, 'PATCH', /./)).toHaveLength(0);
  });

  it('"Seguir editando" hides the warning, keeps the changes and returns the focus to the field', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    escribir(campo(panel, /^Notas/), 'cambio');
    campo(panel, /^Notas/).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(campo(panel, /^Notas/)).toHaveValue('cambio');
    expect(campo(panel, /^Notas/)).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Seguir editando' }));
    guardar(panel);
    await waitFor(() => expect(within(panel).queryByLabelText(/^Notas/)).toBeNull());
  });

  it('"Descartar cambios" after the X closes the panel without saving', async () => {
    const fn = mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    escribir(campo(panel, /^Notas/), 'cambio');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
    expect(llamadas(fn, 'PATCH', /./)).toHaveLength(0);
    expect(tarjeta(TEXTILES)).toHaveFocus();
    const otra = abrir(TEXTILES);
    expect(within(otra).getByText('Sin notas')).toBeInTheDocument();
  });

  it('"Descartar cambios" after clicking another card opens that card in view mode', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    escribir(campo(panel, /^Notas/), 'cambio');
    fireEvent.click(within(tarjeta('Minera Los Tres Picos S.A.')).getByText(/^RUC /));
    fireEvent.click(within(panel).getByRole('button', { name: 'Descartar cambios' }));
    const otro = screen.getByRole('dialog', { name: 'Minera Los Tres Picos S.A.' });
    expect(within(otro).queryByLabelText(/^Razón social/)).toBeNull();
    expect(within(otro).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('"Descartar cambios" after Nueva empresa closes the detail and opens the create panel', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    const panel = editar(TEXTILES);
    escribir(campo(panel, /^Notas/), 'cambio');
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Descartar cambios' }));
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
    expect(screen.getByRole('dialog', { name: /Nueva empresa/ })).toBeInTheDocument();
  });
});

describe('Detalle — convive con el panel de alta', () => {
  it('opening a detail hides the create panel keeping its draft; Nueva empresa brings it back and closes the detail', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    const alta = screen.getByRole('dialog', { name: /Nueva empresa/ });
    escribir(within(alta).getByLabelText(/^Razón social/), 'Borrador S.A.C.');
    abrir(TEXTILES);
    expect(screen.queryByRole('dialog', { name: /Nueva empresa/ })).toBeNull();
    expect(toastMock.info).toHaveBeenCalledWith('El borrador de “Nueva empresa” se conserva');
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
    const vuelta = screen.getByRole('dialog', { name: /Nueva empresa/ });
    expect(within(vuelta).getByLabelText(/^Razón social/)).toHaveValue('Borrador S.A.C.');
    expect(within(vuelta).getByLabelText(/^Razón social/)).toHaveFocus();
  });

  it('closing the create panel still discards its draft', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    escribir(within(screen.getByRole('dialog', { name: /Nueva empresa/ })).getByLabelText(/^Razón social/), 'Borrador');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }));
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    expect(within(screen.getByRole('dialog', { name: /Nueva empresa/ })).getByLabelText(/^Razón social/)).toHaveValue('');
  });

  it('with the detail open, Escape does not touch the hidden create panel', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    abrir(TEXTILES);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: TEXTILES })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    expect(screen.getByRole('dialog', { name: /Nueva empresa/ })).toBeInTheDocument();
  });
});

describe('Detalle — datos', () => {
  it('uses the same list the board shows: every empresa of LISTA can be opened', async () => {
    mockApi();
    render(<CrmBoard />);
    await cargado();
    for (const e of LISTA) {
      const panel = abrir(e.razonSocial);
      expect(within(panel).getByText(e.ruc ?? '')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    }
  });
});
