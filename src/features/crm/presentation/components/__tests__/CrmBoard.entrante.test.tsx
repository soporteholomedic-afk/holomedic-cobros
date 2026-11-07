import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import type { Empresa, Oportunidad } from '../../../domain/entities';
import { CrmBoard } from '../CrmBoard';
import { empresa, llamadas, mockApi, oportunidad, type Api, type Respuesta } from './crmFixtures';

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

function montar(entrante?: (body: Record<string, unknown>) => Respuesta, lista: Empresa[] = BASE, extra: Api = {}, oportunidadesResp?: Respuesta) {
  return mockApi({
    lista: { status: 200, body: { success: true, empresas: lista } },
    ...(oportunidadesResp ? { oportunidades: oportunidadesResp } : {}),
    entrante,
    ...extra,
  });
}

async function abrir(esperar = ANDINA) {
  await screen.findByText(esperar);
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

function creada(cambios: Partial<Empresa> = {}, existente = false, deal: Partial<Oportunidad> = {}): Respuesta {
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
        contactos: [{ nombre: 'Mónica Paredes', telefono: '945 210 334', correo: null }],
        updatedAt: AHORA,
        ...cambios,
      }),
      // The use case derives the deal nombre from "¿Qué necesita?" with the fallback "Negocio entrante" (S4).
      oportunidad: oportunidad({
        idOportunidad: 'o-9',
        idEmpresa: (cambios.idEmpresa as string | undefined) ?? 'e-9',
        nombre: 'Negocio entrante',
        etapa: 'contactado',
        medio: 'whatsapp',
        faltaResponderDesde: AHORA,
        proximaAccion: { tipo: 'responder', detalle: null, fecha: HOY },
        ...deal,
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

  it('matches an existing empresa live, ignoring case and extra spaces, and says a NEW deal will be created for it', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    expect(screen.queryByTestId('entrante-coincidencia')).toBeNull();
    escribir(campo(p, /^Empresa/), '  textiles   PACÍFICO s.a.c.  ');
    expect(screen.getByTestId('entrante-coincidencia')).toHaveTextContent(
      'Ya está en el CRM: Textiles Pacífico S.A.C.. Le creamos una oportunidad nueva en «Contactado».',
    );
    expect(screen.getByTestId('entrante-previa')).toHaveTextContent(
      'Se crea una oportunidad en «Contactado» para Textiles Pacífico S.A.C., con la etiqueta «Falta responder».',
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

  it('previews the first deal of a new ficha, with and without RUC', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    expect(screen.getByTestId('entrante-previa')).toHaveTextContent(
      'Se registra la empresa y su primera oportunidad en «Contactado», con la etiqueta «Falta responder» y marcada «Falta RUC».',
    );
    escribir(campo(p, /^RUC/), '20111222333');
    expect(screen.getByTestId('entrante-previa')).toHaveTextContent(
      'Se registra la empresa y su primera oportunidad en «Contactado», con la etiqueta «Falta responder».',
    );
    expect(screen.getByTestId('entrante-previa')).not.toHaveTextContent('Falta RUC');
  });

  it('counts for the calendar the actions of deals of other empresas, and not those of the matched one', async () => {
    montar(undefined, BASE, undefined, {
        status: 200,
        body: {
          success: true,
          oportunidades: [
            oportunidad({ idOportunidad: 'o-3', idEmpresa: 'e-3', nombre: 'Exámenes de ingreso', etapa: 'contactado', medio: 'llamada', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } }),
            oportunidad({ idOportunidad: 'o-5', idEmpresa: 'e-4', nombre: 'Ergonomía para planta', etapa: 'en_seguimiento', medio: 'whatsapp', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-05' } }),
          ],
        },
    });
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
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
  it('posts a new empresa with a phone, adds its primera oportunidad first in Contactado, closes, toasts and returns the focus', async () => {
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
    // The card names the deal (the "Negocio entrante" fallback) and its state (S4).
    expect(within(card(NUEVA)).getByText('Negocio entrante')).toBeInTheDocument();
    expect(within(card(NUEVA)).getByText('Falta responder · hace un momento')).toBeInTheDocument();
    expect(within(card(NUEVA)).getByText('Falta RUC')).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith(`${NUEVA} quedó registrada. Su oportunidad «Negocio entrante» está en «Contactado».`);
    expect(boton()).toHaveFocus();
  });

  it('splits an email into correo (no telefono) and sends every optional field, medioOtro and the origin', async () => {
    const fn = montar(() => creada({ ruc: '20111222333' }, false, { nombre: 'Exámenes para 25 trabajadores' }));
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
    // The deal nombre comes from "¿Qué necesita?"; the card shows it (S4).
    expect(within(card(NUEVA)).getByText('Exámenes para 25 trabajadores')).toBeInTheDocument();
  });

  it('inbound on an EXISTING ficha adds a new deal card instead of duplicating it', async () => {
    const fn = montar(() =>
      creada(
        {
          idEmpresa: 'e-3',
          razonSocial: TEXTILES,
          ruc: '20556677889',
          contactos: [{ nombre: 'Renzo Vargas', telefono: '998 201 456', correo: null }],
        },
        true,
        { nombre: 'Cotización de mallas', medio: 'llamada' },
      ),
    );
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), 'textiles pacífico s.a.c.');
    escribir(campo(p, /^Teléfono o correo/), '998 201 456');
    guardar(p);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).toMatchObject({ razonSocial: 'textiles pacífico s.a.c.' });
    // The ficha is NOT duplicated: the fixtures already hold two Textiles deals, the new one is the third card.
    expect(screen.getAllByRole('heading', { level: 3, name: TEXTILES })).toHaveLength(3);
    const nueva = within(columna('Contactado')).getByText('Cotización de mallas').closest('article') as HTMLElement;
    expect(within(nueva).getByText('Falta responder · hace un momento')).toBeInTheDocument();
    expect(within(nueva).getByRole('button', { name: 'Responder' })).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith(`${TEXTILES} ya estaba en el CRM. Su nueva oportunidad «Cotización de mallas» está en «Contactado».`);
  });

  it('the new deal of an existing ficha travels into Contactado', async () => {
    montar(() => creada({ idEmpresa: 'e-1', razonSocial: ANDINA, ruc: '20512345678' }, true, { nombre: 'Nuevo negocio', medio: 'whatsapp' }));
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), ANDINA);
    escribir(campo(p, /^Teléfono o correo/), '987 654 321');
    guardar(p);
    await waitFor(() => expect(within(columna('Contactado')).getByText('Nuevo negocio')).toBeInTheDocument());
    // Andina's own deal stays in Por contactar; the new card is the new deal's.
    expect(within(columna('Por contactar')).getByText('Equipos de protección para obra')).toBeInTheDocument();
  });

  it('on a matched Cliente the próxima acción is still required (the new deal waits for our reply)', async () => {
    const fn = montar(() => creada({ idEmpresa: 'e-4', razonSocial: VALLE }, true, { nombre: 'Campaña nueva', medio: 'whatsapp' }));
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), VALLE);
    expect(within(p).queryByRole('group', { name: 'Próxima acción (opcional)' })).toBeNull();
    escribir(campo(p, /^Teléfono o correo/), '936 018 552');
    guardar(p);
    // The new deal always waits for our reply: the required action goes with it.
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).toMatchObject({
      razonSocial: VALLE,
      proximaAccion: { tipo: 'responder', fecha: HOY },
    });
    await waitFor(() => expect(within(columna('Contactado')).getByText('Campaña nueva')).toBeInTheDocument());
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

  it('opening a card detail or "Registrar actividad" replaces the panel', async () => {
    montar();
    render(<CrmBoard />);
    await abrir();
    // Textiles holds two deals (S2): the button lives on its Contactado card.
    const contacto = screen.getByRole('region', { name: 'Contactado' });
    const suTarjeta = within(contacto).getByRole('heading', { level: 3, name: TEXTILES }).closest('article') as HTMLElement;
    fireEvent.click(within(suTarjeta).getByRole('button', { name: 'Registrar actividad' }));
    expect(screen.queryByRole('dialog', { name: 'Nos contactaron' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Registrar actividad' })).toBeInTheDocument();
    fireEvent.click(boton());
    expect(screen.queryByRole('dialog', { name: 'Registrar actividad' })).toBeNull();
    expect(panel()).toBeInTheDocument();
  });
});

describe('CrmBoard — sector en "Nos contactaron" (S12)', () => {
  const menuSector = (p: HTMLElement) => within(p).getByRole('button', { name: /^Sector/ });
  const abrirMenu = (p: HTMLElement) => fireEvent.click(menuSector(p));
  const caja = (p: HTMLElement) => within(p).getByRole('group', { name: 'Nuevo sector' });
  const nombre = (p: HTMLElement) => within(caja(p)).getByLabelText('Nombre');
  const agregar = (p: HTMLElement) => fireEvent.click(within(caja(p)).getByRole('button', { name: 'Agregar sector' }));
  const abrirCaja = (p: HTMLElement) => {
    abrirMenu(p);
    fireEvent.click(within(p).getByRole('option', { name: /^Crear otro sector/ }));
  };

  it('puts the optional Sector menu below the RUC, "Sin definir" by default, with the stored sectors and "Crear otro sector" last', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    expect(p.querySelector('#ent-sector-l')).toHaveTextContent('Sector(opcional)');
    expect(menuSector(p)).toHaveTextContent('Sin definir');
    const ruc = campo(p, /^RUC/);
    expect(ruc.compareDocumentPosition(menuSector(p)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    abrirMenu(p);
    const opciones = within(p).getAllByRole('option');
    expect(opciones.map((o) => o.textContent)).toEqual([
      expect.stringContaining('Sin definir'),
      expect.stringContaining('Comercio y Tiendas'),
      expect.stringContaining('Construcción'),
      expect.stringContaining('Fábrica y Producción'),
      expect.stringContaining('Minería y Energía'),
      expect.stringContaining('Crear otro sector'),
    ]);
    expect(opciones[0]).toHaveTextContent('Se completa después');
    expect(opciones[5]).toHaveTextContent('Elige su nombre y su ícono');
    expect(opciones[5]?.className).toMatch(/border-t/);
    // every option carries an icon (the sector's own, or the neutral tag)
    for (const o of opciones) expect(o.querySelector('svg')).not.toBeNull();
    expect(opciones[1]?.querySelector('svg')?.getAttribute('class')).toMatch(/lucide-store/);
    expect(opciones[4]?.querySelector('svg')?.getAttribute('class')).toMatch(/lucide-tag/);
    expect(opciones[0]?.querySelector('svg')?.getAttribute('class')).toMatch(/lucide-info/);
    expect(opciones[5]?.querySelector('svg')?.getAttribute('class')).toMatch(/lucide-plus/);
  });

  it('sends the chosen sector in POST /api/crm/entrantes, and none when it stays "Sin definir"', async () => {
    const fn = montar(() => creada());
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), NUEVA);
    escribir(campo(p, /^Teléfono o correo/), '945 210 334');
    elegirOpcion(p, /^Sector/, 'Construcción');
    expect(menuSector(p)).toHaveTextContent('Construcción');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).toMatchObject({ razonSocial: NUEVA, sector: 'Construcción' });
  });

  it('does not send a sector while it is "Sin definir" (also after going back to it)', async () => {
    const fn = montar(() => creada());
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), NUEVA);
    escribir(campo(p, /^Teléfono o correo/), '945 210 334');
    elegirOpcion(p, /^Sector/, 'Construcción');
    elegirOpcion(p, /^Sector/, 'Sin definir');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).not.toHaveProperty('sector');
  });

  it('hides the menu while the name or RUC is already in the CRM, and sends no sector', async () => {
    const fn = montar(() => creada({ idEmpresa: 'e-3', razonSocial: TEXTILES, medio: 'llamada' }, true));
    render(<CrmBoard />);
    const p = await abrir();
    elegirOpcion(p, /^Sector/, 'Construcción');
    escribir(campo(p, /^Empresa/), TEXTILES);
    expect(within(p).queryByRole('button', { name: /^Sector/ })).toBeNull();
    escribir(campo(p, /^Teléfono o correo/), '998 201 456');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).not.toHaveProperty('sector');
    // and it comes back, with its choice, when the name no longer matches
  });

  it('the menu comes back with its choice when the typed name stops matching', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    elegirOpcion(p, /^Sector/, 'Construcción');
    escribir(campo(p, /^Empresa/), TEXTILES);
    expect(within(p).queryByRole('button', { name: /^Sector/ })).toBeNull();
    escribir(campo(p, /^Empresa/), 'Otra');
    expect(menuSector(p)).toHaveTextContent('Construcción');
  });

  it('hides it when the RUC matches too', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^RUC/), '20534128790');
    expect(within(p).queryByRole('button', { name: /^Sector/ })).toBeNull();
  });

  it('"Crear otro sector" opens the "Nuevo sector" box: Nombre (max 50, focused), 12 icons (first checked), note, buttons', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    expect(within(p).queryByRole('group', { name: 'Nuevo sector' })).toBeNull();
    abrirCaja(p);
    const c = caja(p);
    expect(menuSector(p)).toHaveTextContent('Crear otro sector');
    expect(nombre(p)).toHaveAttribute('maxlength', '50');
    expect(nombre(p)).toHaveFocus();
    const grupo = within(c).getByRole('radiogroup', { name: 'Ícono' });
    const radios = within(grupo).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Edificio', 'Casco de obra', 'Pico', 'Fábrica', 'Camión', 'Tienda', 'Maletín', 'Salud', 'Agro', 'Educación', 'Tecnología', 'Alimentos',
    ]);
    expect(radios.map((r) => (r as HTMLInputElement).type)).toEqual(Array(12).fill('radio'));
    expect(radios[0]).toBeChecked();
    expect(radios.filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Salud' }));
    expect(within(grupo).getByRole('radio', { name: 'Salud' })).toBeChecked();
    expect(within(grupo).getByRole('radio', { name: 'Edificio' })).not.toBeChecked();
    expect(within(grupo).getByRole('radio', { name: 'Salud' }).closest('label')?.className).toMatch(/from-sky-600/);
    expect(within(grupo).getByRole('radio', { name: 'Edificio' }).closest('label')?.className).not.toMatch(/from-sky-600/);
    expect(within(c).getByText('Queda disponible para todas las empresas.')).toBeInTheDocument();
    expect(within(c).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(within(c).getByRole('button', { name: 'Agregar sector' })).toBeInTheDocument();
  });

  it('"Agregar sector" posts {nombre, icono}, adds it to the list, selects it, toasts and closes the box', async () => {
    const fn = montar(() => creada({ sector: 'Clínicas y Salud' }));
    render(<CrmBoard />);
    const p = await abrir();
    abrirCaja(p);
    escribir(nombre(p), '  Clínicas   y Salud ');
    fireEvent.click(within(caja(p)).getByRole('radio', { name: 'Salud' }));
    agregar(p);
    await waitFor(() => expect(within(p).queryByRole('group', { name: 'Nuevo sector' })).toBeNull());
    expect(llamadas(fn, 'POST', '/api/crm/sectores')[0]!.body).toEqual({ nombre: 'Clínicas y Salud', icono: 'salud' });
    expect(menuSector(p)).toHaveTextContent('Clínicas y Salud');
    expect(toastMock.success).toHaveBeenCalledWith('Sector «Clínicas y Salud» creado y elegido.');
    abrirMenu(p);
    const opciones = within(p).getAllByRole('option').map((o) => o.textContent);
    expect(opciones.some((t) => t?.includes('Clínicas y Salud'))).toBe(true);
    expect(opciones[opciones.length - 1]).toContain('Crear otro sector');
    fireEvent.keyDown(within(p).getByRole('listbox'), { key: 'Escape' });
    escribir(campo(p, /^Empresa/), NUEVA);
    escribir(campo(p, /^Teléfono o correo/), '945 210 334');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).toMatchObject({ sector: 'Clínicas y Salud' });
  });

  it('Enter in Nombre adds the sector (and does not submit the panel)', async () => {
    const fn = montar(() => creada());
    render(<CrmBoard />);
    const p = await abrir();
    abrirCaja(p);
    escribir(nombre(p), 'Educación privada');
    fireEvent.keyDown(nombre(p), { key: 'Enter' });
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/sectores')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/sectores')[0]!.body).toEqual({ nombre: 'Educación privada', icono: 'edificio' });
    await waitFor(() => expect(menuSector(p)).toHaveTextContent('Educación privada'));
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(0);
  });

  it('an empty name shows "Escribe el nombre del sector." on Nombre, focuses it and calls nothing; typing clears it', async () => {
    const fn = montar();
    render(<CrmBoard />);
    const p = await abrir();
    abrirCaja(p);
    agregar(p);
    const aviso = within(caja(p)).getByText('Escribe el nombre del sector.');
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(nombre(p)).toHaveAttribute('aria-invalid', 'true');
    expect(nombre(p).getAttribute('aria-describedby')).toContain(aviso.id);
    expect(nombre(p)).toHaveFocus();
    expect(llamadas(fn, 'POST', '/api/crm/sectores')).toHaveLength(0);
    escribir(nombre(p), 'E');
    expect(within(caja(p)).queryByText('Escribe el nombre del sector.')).toBeNull();
    expect(nombre(p)).not.toHaveAttribute('aria-invalid');
  });

  it('a name that exists in any case answers with the stored name, from the local list, without calling the server', async () => {
    const fn = montar();
    render(<CrmBoard />);
    const p = await abrir();
    abrirCaja(p);
    escribir(nombre(p), 'CONSTRUCCIÓN');
    agregar(p);
    expect(within(caja(p)).getByText('«Construcción» ya existe. Elígelo en la lista.')).toHaveAttribute('role', 'alert');
    expect(nombre(p)).toHaveFocus();
    expect(llamadas(fn, 'POST', '/api/crm/sectores')).toHaveLength(0);
    escribir(nombre(p), 'CONSTRUCCIÓN ');
    expect(within(caja(p)).queryByText(/ya existe/)).toBeNull();
  });

  it('a server 409 shows the same "ya existe" message and keeps the box open', async () => {
    montar(undefined, BASE, { sector: () => ({ status: 409, body: { success: false, error: 'Ya existe el sector: Logística' } }) });
    render(<CrmBoard />);
    const p = await abrir();
    abrirCaja(p);
    escribir(nombre(p), 'Logística');
    agregar(p);
    expect(await within(caja(p)).findByText('«Logística» ya existe. Elígelo en la lista.')).toBeInTheDocument();
    expect(nombre(p)).toHaveFocus();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('shows another server error as is and keeps the box', async () => {
    montar(undefined, BASE, { sector: () => ({ status: 500, body: { success: false, error: 'Error al crear el sector' } }) });
    render(<CrmBoard />);
    const p = await abrir();
    abrirCaja(p);
    escribir(nombre(p), 'Logística');
    agregar(p);
    expect(await within(caja(p)).findByText('Error al crear el sector')).toBeInTheDocument();
  });

  it('saving the panel with the box open shows "Agrega el sector nuevo o cancélalo." on Nombre, focuses it and sends nothing', async () => {
    const fn = montar(() => creada());
    render(<CrmBoard />);
    const p = await abrir();
    escribir(campo(p, /^Empresa/), NUEVA);
    escribir(campo(p, /^Teléfono o correo/), '945 210 334');
    abrirCaja(p);
    guardar(p);
    const aviso = within(caja(p)).getByText('Agrega el sector nuevo o cancélalo.');
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(nombre(p)).toHaveAttribute('aria-invalid', 'true');
    expect(nombre(p)).toHaveFocus();
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(0);
    escribir(nombre(p), 'x');
    expect(within(caja(p)).queryByText('Agrega el sector nuevo o cancélalo.')).toBeNull();
  });

  it('Cancelar closes the box and goes back to the previous choice', async () => {
    const fn = montar(() => creada());
    render(<CrmBoard />);
    const p = await abrir();
    elegirOpcion(p, /^Sector/, 'Construcción');
    abrirCaja(p);
    expect(menuSector(p)).toHaveTextContent('Crear otro sector');
    fireEvent.click(within(caja(p)).getByRole('button', { name: 'Cancelar' }));
    expect(within(p).queryByRole('group', { name: 'Nuevo sector' })).toBeNull();
    expect(menuSector(p)).toHaveTextContent('Construcción');
    expect(menuSector(p)).toHaveFocus();
    escribir(campo(p, /^Empresa/), NUEVA);
    escribir(campo(p, /^Teléfono o correo/), '945 210 334');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/entrantes')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/entrantes')[0]!.body).toMatchObject({ sector: 'Construcción' });
    expect(llamadas(fn, 'POST', '/api/crm/sectores')).toHaveLength(0);
  });

  it('Cancelar from "Sin definir" goes back to "Sin definir"', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    abrirCaja(p);
    fireEvent.click(within(caja(p)).getByRole('button', { name: 'Cancelar' }));
    expect(menuSector(p)).toHaveTextContent('Sin definir');
  });

  it('Escape in the box cancels it and keeps the panel open', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    elegirOpcion(p, /^Sector/, 'Construcción');
    abrirCaja(p);
    escribir(campo(p, /^Empresa/), NUEVA);
    fireEvent.keyDown(nombre(p), { key: 'Escape' });
    expect(within(p).queryByRole('group', { name: 'Nuevo sector' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Nos contactaron' })).toBeInTheDocument();
    expect(campo(p, /^Empresa/)).toHaveValue(NUEVA);
    expect(menuSector(p)).toHaveTextContent('Construcción');
  });

  it('choosing "Crear otro sector" twice does not duplicate the box, and picking a sector closes an open box', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir();
    abrirCaja(p);
    abrirCaja(p);
    expect(within(p).getAllByRole('group', { name: 'Nuevo sector' })).toHaveLength(1);
    elegirOpcion(p, /^Sector/, 'Construcción');
    expect(within(p).queryByRole('group', { name: 'Nuevo sector' })).toBeNull();
    expect(menuSector(p)).toHaveTextContent('Construcción');
  });

  it('the sector of the empresa form ("Nuevo sector", name only) still posts only the name', async () => {
    const fn = montar();
    render(<CrmBoard />);
    await screen.findByText(ANDINA);
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    const alta = screen.getByRole('dialog', { name: /Nueva empresa/ });
    fireEvent.click(within(alta).getByRole('button', { name: /Nuevo sector/ }));
    fireEvent.change(within(alta).getByLabelText(/Sector nuevo/), { target: { value: 'Pesca' } });
    fireEvent.click(within(alta).getByRole('button', { name: 'Agregar sector' }));
    await waitFor(() => expect(llamadas(fn, 'POST', '/api/crm/sectores')).toHaveLength(1));
    expect(llamadas(fn, 'POST', '/api/crm/sectores')[0]!.body).toEqual({ nombre: 'Pesca' });
    expect(llamadas(fn, 'POST', '/api/crm/sectores')[0]!.body).not.toHaveProperty('icono');
  });
});
