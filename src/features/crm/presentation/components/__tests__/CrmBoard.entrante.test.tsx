import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import type { Empresa } from '../../../domain/entities';
import { CrmBoard } from '../CrmBoard';
import { empresa, llamadas, mockApi, type Respuesta } from './crmFixtures';

const ANDINA = 'Constructora Andina S.A.C.';
const TEXTILES = 'Textiles Pacífico S.A.C.';
const VALLE = 'Agroindustrial Valle Verde S.A.C.';
const NUEVA = 'Clínica Santa Rosa';
const AHORA = '2026-10-31T16:00:00.000Z';
const HOY = '2026-10-31';

const BASE: Empresa[] = [
  empresa({ idEmpresa: 'e-1', razonSocial: ANDINA }),
  empresa({
    idEmpresa: 'e-3',
    razonSocial: TEXTILES,
    ruc: '20556677889',
    etapa: 'contactado',
    medio: 'llamada',
    contactos: [{ nombre: 'Renzo Vargas', telefono: '998 201 456', correo: null }],
    proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' },
  }),
  empresa({ idEmpresa: 'e-4', razonSocial: VALLE, ruc: '20534128790', etapa: 'cliente', medio: 'whatsapp' }),
];

const card = (nombre: string) => screen.getByRole('heading', { level: 3, name: nombre }).closest('article') as HTMLElement;
const columna = (nombre: string) => screen.getByRole('region', { name: nombre });
const panel = () => screen.getByRole('dialog', { name: 'Nos contactaron' });
const boton = () => screen.getByRole('button', { name: 'Nos contactaron' });

function montar(entrante?: (body: Record<string, unknown>) => Respuesta, lista: Empresa[] = BASE) {
  return mockApi({ lista: { status: 200, body: { success: true, empresas: lista } }, entrante });
}

async function abrir() {
  await screen.findByText(ANDINA);
  fireEvent.click(boton());
  return panel();
}

const escribir = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const campo = (p: HTMLElement, etiqueta: string | RegExp) => within(p).getByLabelText(etiqueta);
const proxima = (p: HTMLElement) => within(p).getByRole('group', { name: /Próxima acción/ });
const guardar = (p: HTMLElement) => fireEvent.click(within(p).getByRole('button', { name: 'Guardar' }));

function elegirOpcion(raiz: HTMLElement, boton: RegExp, opcion: string) {
  fireEvent.click(within(raiz).getByRole('button', { name: boton }));
  fireEvent.click(within(raiz).getByRole('option', { name: new RegExp(`^${opcion}`) }));
}

function creada(cambios: Partial<Empresa> = {}, existente = false): Respuesta {
  return {
    status: 201,
    body: {
      success: true,
      existente,
      empresa: empresa({
        idEmpresa: 'e-9',
        razonSocial: NUEVA,
        ruc: null,
        sector: null,
        etapa: 'contactado',
        medio: 'whatsapp',
        contactos: [{ nombre: 'Mónica Paredes', telefono: '945 210 334', correo: null }],
        faltaResponderDesde: AHORA,
        proximaAccion: { tipo: 'responder', detalle: null, fecha: HOY },
        updatedAt: AHORA,
        ...cambios,
      }),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(AHORA));
  Object.values(toastMock).forEach((m) => m.mockClear());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CrmBoard — "Nos contactaron" (S5)', () => {
  it('adds a header button that opens a floating panel with the focus on the company', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    expect(boton()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(p.tagName).toBe('ASIDE');
    expect(p.className).toMatch(/\bfixed\b/);
    expect(p).toHaveAttribute('aria-modal', 'false');
    expect(within(p).getByRole('heading', { name: 'Nos contactaron' })).toBeInTheDocument();
    expect(campo(p, /^Empresa/)).toHaveFocus();
    expect(campo(p, /^RUC/)).toHaveAttribute('maxlength', '11');
    expect(campo(p, /^RUC/)).toHaveAttribute('inputmode', 'numeric');
    for (const t of [/^Persona/, /^Teléfono o correo/, /^¿Qué necesita\?/]) expect(campo(p, t)).toBeInTheDocument();
    expect(within(p).getByRole('radio', { name: 'WhatsApp' })).toBeChecked();
    expect(within(p).getByText('¿Por dónde llegó?')).toBeInTheDocument();
    expect(within(p).getByRole('button', { name: /¿Cómo nos conoció\?/ })).toHaveTextContent('No lo sé');
    expect(within(proxima(p)).getByRole('button', { name: /Qué hacer/ })).toHaveTextContent('Responder');
    expect(within(proxima(p)).getByRole('button', { name: /Cuándo/ })).toHaveTextContent('sábado 31 de octubre de 2026');
    expect(screen.getByTestId('crm-board')).toBeInTheDocument();
  });

  it('marks the optional fields', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    expect(within(p).getByText('RUC').parentElement).toHaveTextContent('RUC (opcional)');
    expect(within(p).getByText('Persona').parentElement).toHaveTextContent('Persona (opcional)');
    expect(within(p).getByText('¿Qué necesita?').parentElement).toHaveTextContent('¿Qué necesita? (opcional)');
    expect(within(p).getByText('¿Cómo nos conoció?').parentElement).toHaveTextContent('(opcional)');
  });

  it('lists the four origins in the custom menu', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    fireEvent.click(within(p).getByRole('button', { name: /¿Cómo nos conoció\?/ }));
    expect(within(p).getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('No lo sé'),
      expect.stringContaining('Referido por un cliente'),
      expect.stringContaining('Ya nos conocía'),
      expect.stringContaining('Búsqueda en internet'),
    ]);
  });

  it('shows "¿Cuál?" only for Otro', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    expect(within(p).queryByLabelText('¿Cuál?', { selector: '#ent-otro' })).toBeNull();
    fireEvent.click(within(p).getByRole('radio', { name: 'Otro' }));
    expect(within(p).getByLabelText('¿Cuál?', { selector: '#ent-otro' })).toHaveAttribute('maxlength', '40');
  });

  it('matches an existing empresa live, ignoring case and extra spaces, and says so', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    expect(screen.queryByTestId('entrante-coincidencia')).toBeNull();
    escribir(campo(p, /^Empresa/), '  textiles   PACÍFICO s.a.c.  ');
    expect(screen.getByTestId('entrante-coincidencia')).toHaveTextContent(
      'Ya está en el CRM: Textiles Pacífico S.A.C.. Se suma a esa tarjeta.',
    );
    expect(screen.getByTestId('entrante-previa')).toHaveTextContent(
      'Se agrega al historial de Textiles Pacífico S.A.C. y la tarjeta muestra «Falta responder».',
    );
    escribir(campo(p, /^Empresa/), 'Textiles');
    expect(screen.queryByTestId('entrante-coincidencia')).toBeNull();
  });

  it('matches by RUC when it has 11 digits', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), 'Otro nombre');
    escribir(campo(p, /^RUC/), '20534128790');
    expect(screen.getByTestId('entrante-coincidencia')).toHaveTextContent('Ya está en el CRM: Agroindustrial Valle Verde S.A.C.');
  });

  it('previews a new card with and without RUC', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    expect(screen.getByTestId('entrante-previa')).toHaveTextContent(
      'Se crea una tarjeta en «Contactado» con la etiqueta «Falta responder» y marcada «Falta RUC».',
    );
    escribir(campo(p, /^RUC/), '20111222333');
    expect(screen.getByTestId('entrante-previa')).toHaveTextContent(
      'Se crea una tarjeta en «Contactado» con la etiqueta «Falta responder».',
    );
    expect(screen.getByTestId('entrante-previa')).not.toHaveTextContent('Falta RUC');
  });

  it('counts for the calendar the actions of other open cards, and not the matched card', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    const abrirNoviembre = () => {
      fireEvent.click(within(proxima(p)).getByRole('button', { name: /Cuándo/ }));
      fireEvent.click(within(proxima(p)).getByRole('button', { name: 'Mes siguiente' }));
    };
    const dia = () => screen.getByRole('button', { name: /martes 3 de noviembre/ });
    abrirNoviembre();
    expect(dia().getAttribute('aria-label')).toMatch(/1 acción agendada/);
    fireEvent.click(within(proxima(p)).getByRole('button', { name: 'Cerrar' }));
    escribir(campo(p, /^Empresa/), TEXTILES);
    abrirNoviembre();
    expect(dia().getAttribute('aria-label')).not.toMatch(/agendada/);
  });
});

describe('CrmBoard — guardar un contacto entrante', () => {
  it('posts a new empresa with a phone, adds the card first in Contactado, closes, toasts and returns the focus', async () => {
    const fn = montar(() => creada());
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), `  ${NUEVA}  `);
    escribir(campo(p, /^Teléfono o correo/), ' 945 210 334 ');
    guardar(p);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nos contactaron' })).toBeNull());
    const init = fn.mock.calls.find(([u]) => u === '/api/crm/entrantes')![1]!;
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).toEqual({
      razonSocial: NUEVA,
      medio: 'whatsapp',
      telefono: '945 210 334',
      origen: 'nose',
      proximaAccion: { tipo: 'responder', fecha: HOY },
    });
    const contactado = columna('Contactado');
    const titulos = within(contactado).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titulos[0]).toBe(NUEVA);
    expect(within(card(NUEVA)).getByText('Falta responder · hace un momento')).toBeInTheDocument();
    expect(within(card(NUEVA)).getByText('Falta RUC')).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith(`${NUEVA} quedó en «Contactado» como «Falta responder».`);
    expect(boton()).toHaveFocus();
  });

  it('splits an email into correo (no telefono) and sends every optional field, medioOtro and the origin', async () => {
    const fn = montar(() => creada({ ruc: '20111222333' }));
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), NUEVA);
    escribir(campo(p, /^RUC/), '20111222333');
    fireEvent.click(within(p).getByRole('radio', { name: 'Otro' }));
    escribir(within(p).getByLabelText('¿Cuál?', { selector: '#ent-otro' }), ' Feria Expomina ');
    escribir(campo(p, /^Persona/), ' Mónica Paredes ');
    escribir(campo(p, /^Teléfono o correo/), ' compras@santarosa.pe ');
    escribir(campo(p, /^¿Qué necesita\?/), ' Exámenes para 25 trabajadores ');
    elegirOpcion(p, /¿Cómo nos conoció\?/, 'Referido por un cliente');
    elegirOpcion(proxima(p), /Qué hacer/, 'Enviar cotización');
    escribir(within(proxima(p)).getByLabelText('Detalle (opcional)'), ' Plan anual ');
    fireEvent.click(within(proxima(p)).getByRole('button', { name: /^Próximo día hábil/ }));
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).toEqual({
      razonSocial: NUEVA,
      ruc: '20111222333',
      medio: 'otro',
      medioOtro: 'Feria Expomina',
      persona: 'Mónica Paredes',
      correo: 'compras@santarosa.pe',
      necesita: 'Exámenes para 25 trabajadores',
      origen: 'referido',
      proximaAccion: { tipo: 'cotizar', detalle: 'Plan anual', fecha: '2026-11-02' },
    });
  });

  it('inbound on an existing card updates that card instead of adding another', async () => {
    const fn = montar(() =>
      creada(
        {
          idEmpresa: 'e-3',
          razonSocial: TEXTILES,
          ruc: '20556677889',
          medio: 'llamada',
          contactos: [{ nombre: 'Renzo Vargas', telefono: '998 201 456', correo: null }],
        },
        true,
      ),
    );
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), 'textiles pacífico s.a.c.');
    escribir(campo(p, /^Teléfono o correo/), '998 201 456');
    guardar(p);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).toMatchObject({ razonSocial: 'textiles pacífico s.a.c.' });
    expect(screen.getAllByRole('heading', { level: 3, name: TEXTILES })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(BASE.length);
    expect(within(card(TEXTILES)).getByText('Falta responder · hace un momento')).toBeInTheDocument();
    expect(within(card(TEXTILES)).getByRole('button', { name: 'Responder' })).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith(`${TEXTILES} quedó en «Contactado» como «Falta responder».`);
  });

  it('an existing card that changes column travels to the new one', async () => {
    montar(() => creada({ idEmpresa: 'e-1', razonSocial: ANDINA, ruc: '20512345678', medio: 'whatsapp' }, true));
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), ANDINA);
    escribir(campo(p, /^Teléfono o correo/), '987 654 321');
    guardar(p);
    await waitFor(() => expect(within(columna('Contactado')).getByText(ANDINA)).toBeInTheDocument());
    expect(within(columna('Por contactar')).queryByText(ANDINA)).toBeNull();
  });

  it('on a matched Cliente the next action is optional and goes as null', async () => {
    const fn = montar(() => creada({ idEmpresa: 'e-4', razonSocial: VALLE, etapa: 'cliente', proximaAccion: null }, true));
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), VALLE);
    expect(within(p).getByRole('group', { name: 'Próxima acción (opcional)' })).toBeInTheDocument();
    fireEvent.click(within(proxima(p)).getByRole('button', { name: /Qué hacer/ }));
    expect(within(proxima(p)).getAllByRole('option')[0]).toHaveTextContent('Sin próxima acción');
    fireEvent.click(within(proxima(p)).getAllByRole('option')[0]!);
    escribir(campo(p, /^Teléfono o correo/), '936 018 552');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).toMatchObject({ proximaAccion: null });
  });
});

describe('CrmBoard — validación del panel "Nos contactaron" (sin pedir nada al servidor)', () => {
  async function intentar(pasos: (p: HTMLElement) => void) {
    const fn = montar(() => creada());
    render(<CrmBoard />);
    const p = await abrir();
    pasos(p);
    guardar(p);
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(0);
    return p;
  }

  function enlazado(p: HTMLElement, el: HTMLElement, mensaje: string) {
    const aviso = within(p).getByText(mensaje);
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(el.getAttribute('aria-describedby')).toContain(aviso.id);
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(el).toHaveFocus();
  }

  it('company name missing', async () => {
    const p = await intentar((q) => escribir(campo(q, /^Teléfono o correo/), '945 210 334'));
    enlazado(p, campo(p, /^Empresa/), 'La razón social es obligatoria');
  });

  it('RUC that is not 11 digits', async () => {
    const p = await intentar((q) => {
      escribir(campo(q, /^Empresa/), NUEVA);
      escribir(campo(q, /^RUC/), '2011122');
      escribir(campo(q, /^Teléfono o correo/), '945 210 334');
    });
    enlazado(p, campo(p, /^RUC/), 'El RUC debe tener 11 dígitos.');
  });

  it('Otro without "¿Cuál?"', async () => {
    const p = await intentar((q) => {
      escribir(campo(q, /^Empresa/), NUEVA);
      fireEvent.click(within(q).getByRole('radio', { name: 'Otro' }));
      escribir(campo(q, /^Teléfono o correo/), '945 210 334');
    });
    enlazado(p, within(p).getByLabelText('¿Cuál?', { selector: '#ent-otro' }), 'Escribe cuál fue el medio.');
  });

  it('neither phone nor email', async () => {
    const p = await intentar((q) => escribir(campo(q, /^Empresa/), NUEVA));
    enlazado(p, campo(p, /^Teléfono o correo/), 'Escribe un teléfono o un correo para poder responder.');
  });

  it('a phone that is not 9 digits', async () => {
    const p = await intentar((q) => {
      escribir(campo(q, /^Empresa/), NUEVA);
      escribir(campo(q, /^Teléfono o correo/), '945 210');
    });
    enlazado(p, campo(p, /^Teléfono o correo/), 'El teléfono debe tener 9 dígitos.');
  });

  it('anything with "@" is an email, and an invalid one is rejected', async () => {
    const p = await intentar((q) => {
      escribir(campo(q, /^Empresa/), NUEVA);
      escribir(campo(q, /^Teléfono o correo/), 'compras@santarosa');
    });
    enlazado(p, campo(p, /^Teléfono o correo/), 'El correo no es válido.');
  });

  it('next action Otro without detail', async () => {
    const p = await intentar((q) => {
      escribir(campo(q, /^Empresa/), NUEVA);
      escribir(campo(q, /^Teléfono o correo/), '945 210 334');
      elegirOpcion(proxima(q), /Qué hacer/, 'Otro');
    });
    enlazado(p, within(proxima(p)).getByLabelText('¿Cuál?'), 'Escribe cuál es la próxima acción.');
  });

  it('with several errors it shows them all and focuses the first one in the form', async () => {
    const p = await intentar((q) => escribir(campo(q, /^RUC/), '12'));
    expect(within(p).getByText('La razón social es obligatoria')).toBeInTheDocument();
    expect(within(p).getByText('El RUC debe tener 11 dígitos.')).toBeInTheDocument();
    expect(within(p).getByText('Escribe un teléfono o un correo para poder responder.')).toBeInTheDocument();
    expect(campo(p, /^Empresa/)).toHaveFocus();
  });

  it('typing again clears the errors', async () => {
    const p = await intentar(() => undefined);
    escribir(campo(p, /^Empresa/), 'C');
    expect(within(p).queryByRole('alert')).toBeNull();
    expect(campo(p, /^Empresa/)).not.toHaveAttribute('aria-invalid');
  });
});

describe('CrmBoard — errores del servidor y cierre del panel "Nos contactaron"', () => {
  async function lleno() {
    const p = await abrir();
    escribir(campo(p, /^Empresa/), NUEVA);
    escribir(campo(p, /^Teléfono o correo/), '945 210 334');
    return p;
  }

  it('shows the server error as a toast and keeps the panel with what was typed', async () => {
    montar(() => ({ status: 400, body: { success: false, error: 'No se puede registrar un contacto en una empresa en Perdido.' } }));
    render(<CrmBoard />);
    const p = await lleno();
    guardar(p);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se puede registrar un contacto en una empresa en Perdido.'));
    expect(panel()).toBeInTheDocument();
    expect(campo(p, /^Empresa/)).toHaveValue(NUEVA);
    expect(within(p).getByRole('button', { name: 'Guardar' })).toBeEnabled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { level: 3, name: NUEVA })).toBeNull();
  });

  it('a network failure shows a generic error and keeps the panel', async () => {
    const base = montar();
    global.fetch = vi.fn(async (u: string, i?: RequestInit) => {
      if (u === '/api/crm/entrantes') throw new Error('offline');
      return base(u, i);
    }) as unknown as typeof fetch;
    render(<CrmBoard />);
    const p = await lleno();
    guardar(p);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se pudo guardar el contacto'));
    expect(panel()).toBeInTheDocument();
  });

  it('Cancelar and Escape close the panel and give the focus back to the header button', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    fireEvent.click(within(p).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Nos contactaron' })).toBeNull();
    expect(boton()).toHaveFocus();
    fireEvent.click(boton());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Nos contactaron' })).toBeNull();
    expect(boton()).toHaveFocus();
  });

  it('opening a card detail or "Registrar contacto" replaces the panel', async () => {
    montar();
    render(<CrmBoard />);
    await abrir();
    fireEvent.click(within(card(TEXTILES)).getByRole('button', { name: 'Registrar contacto' }));
    expect(screen.queryByRole('dialog', { name: 'Nos contactaron' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Registrar contacto' })).toBeInTheDocument();
    fireEvent.click(boton());
    expect(screen.queryByRole('dialog', { name: 'Registrar contacto' })).toBeNull();
    expect(panel()).toBeInTheDocument();
  });
});
