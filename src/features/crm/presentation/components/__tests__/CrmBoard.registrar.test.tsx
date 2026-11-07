import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import type { Empresa, Oportunidad } from '../../../domain/entities';
import { CrmBoard } from '../CrmBoard';
import { LISTA, empresa, llamadas, mockApi, oportunidad, type Api, type Respuesta } from './crmFixtures';

const ANDINA = 'Constructora Andina S.A.C.';
const TEXTILES = 'Textiles Pacífico S.A.C.';
const VALLE = 'Agroindustrial Valle Verde S.A.C.';
const FERRETERIA = 'Ferretería El Maestro S.R.L.';
const HOY = '2026-10-31';
const LUNES = '2026-11-02';

const card = (nombre: string) => screen.getByRole('heading', { level: 3, name: nombre }).closest('article') as HTMLElement;
const columna = (nombre: string) => screen.getByRole('region', { name: nombre });
const panel = () => screen.getByRole('dialog', { name: 'Registrar actividad' });
const previa = () => screen.getByTestId('actividad-previa').textContent;

/** One deal per fixture empresa, one stage each; FERRETERIA sits in Perdida (no "Registrar actividad" there). */
const BASE_OPS: Oportunidad[] = [
  oportunidad(),
  oportunidad({ idOportunidad: 'o-3', idEmpresa: 'e-3', nombre: 'Exámenes de ingreso', etapa: 'contactado', medio: 'llamada' }),
  oportunidad({ idOportunidad: 'o-5', idEmpresa: 'e-4', nombre: 'Ergonomía para planta', etapa: 'en_seguimiento', medio: 'whatsapp' }),
  oportunidad({
    idOportunidad: 'o-7',
    idEmpresa: 'e-5',
    nombre: 'Ergonomía industrial',
    etapa: 'perdida',
    medio: 'llamada',
    motivo: { categoria: 'sin_interes', detalle1: null, detalle2: null, notas: null },
  }),
];

function montar(ops: Oportunidad[] = BASE_OPS, actividades?: (id: string, body: Record<string, unknown>) => Respuesta, extra: Api = {}) {
  return mockApi({
    lista: { status: 200, body: { success: true, empresas: LISTA } },
    oportunidades: { status: 200, body: { success: true, oportunidades: ops } },
    actividades,
    ...extra,
  });
}

/** Opens the panel from the empresa's FIRST card (an empresa may hold several, S2). */
async function abrir(nombre: string, boton = 'Registrar actividad') {
  await waitFor(() => expect(screen.getByTestId('crm-board')).toHaveAttribute('aria-busy', 'false'));
  const suTarjeta = screen
    .getAllByRole('heading', { level: 3, name: nombre })
    .map((h) => h.closest('article') as HTMLElement)[0]!;
  fireEvent.click(within(suTarjeta).getByRole('button', { name: boton }));
  return panel();
}

const radio = (p: HTMLElement, nombre: string | RegExp) => within(p).getByRole('radio', { name: nombre });
const elegir = (p: HTMLElement, nombre: string | RegExp) => fireEvent.click(radio(p, nombre));
const escribir = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const proxima = (p: HTMLElement) => within(p).getByRole('group', { name: /Próxima acción/ });
const selectorOportunidad = (p: HTMLElement) => within(p).getByRole('button', { name: /^Oportunidad/ });

function elegirOportunidad(p: HTMLElement, nombre: string | RegExp) {
  fireEvent.click(selectorOportunidad(p));
  fireEvent.click(within(p).getByRole('option', { name: nombre }));
}

function elegirAccion(p: HTMLElement, nombre: string) {
  fireEvent.click(within(proxima(p)).getByRole('button', { name: /Qué hacer/ }));
  fireEvent.click(within(proxima(p)).getByRole('option', { name: new RegExp(`^${nombre}`) }));
}
const rapida = (p: HTMLElement, nombre: string) => fireEvent.click(within(proxima(p)).getByRole('button', { name: new RegExp(`^${nombre}`) }));
const guardar = (p: HTMLElement) => fireEvent.click(within(p).getByRole('button', { name: 'Guardar actividad' }));

const ACCION = { tipo: 'llamar', fecha: LUNES };

/** The 201 answer of POST /actividades: the ficha, the advanced deal and the stored row. */
function respuestaActividad(oportunidadNueva: Oportunidad, cambiosEmpresa: Partial<Empresa> = {}): Respuesta {
  const ficha = LISTA.find((e) => e.idEmpresa === oportunidadNueva.idEmpresa)!;
  return {
    status: 201,
    body: {
      success: true,
      empresa: { ...ficha, updatedAt: '2026-10-31T16:00:00.000Z', ...cambiosEmpresa },
      oportunidad: oportunidadNueva,
      interaccion: { idInteraccion: 1, idEmpresa: ficha.idEmpresa, idOportunidad: oportunidadNueva.idOportunidad },
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T16:00:00.000Z'));
  Object.values(toastMock).forEach((m) => m.mockClear());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CrmBoard — botones de la tarjeta (S4)', () => {
  it('offers "Registrar actividad" on every card except Perdida', async () => {
    montar();
    render(<CrmBoard />);
    await screen.findByText(ANDINA);
    for (const n of [ANDINA, TEXTILES, VALLE]) {
      expect(within(card(n)).getByRole('button', { name: 'Registrar actividad' })).toBeInTheDocument();
    }
    expect(within(card(FERRETERIA)).queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
    expect(within(card(FERRETERIA)).queryByRole('button', { name: 'Responder' })).toBeNull();
  });

  it('shows a primary "Responder" instead when the card waits for our reply, and opens the panel PRE-LINKED to that deal', async () => {
    montar([
      oportunidad({
        idOportunidad: 'o-8',
        idEmpresa: 'e-1',
        nombre: 'Monitoreo 2027',
        etapa: 'contactado',
        medio: 'correo',
        faltaResponderDesde: '2026-10-31T15:30:00.000Z',
      }),
    ]);
    render(<CrmBoard />);
    await screen.findByText(ANDINA);
    const c = card(ANDINA);
    expect(within(c).queryByRole('button', { name: 'Registrar actividad' })).toBeNull();
    const boton = within(c).getByRole('button', { name: 'Responder' });
    expect(boton.className).toMatch(/from-sky-600/);
    expect(boton.querySelector('svg')).not.toBeNull();
    fireEvent.click(boton);
    const p = panel();
    expect(radio(p, /^Contactamos/)).toBeChecked();
    expect(selectorOportunidad(p)).toHaveTextContent('Monitoreo 2027 · Contactado');
    expect(screen.queryByRole('dialog', { name: ANDINA })).toBeNull();
  });

  it('does not open the detail panel when the button is clicked', async () => {
    montar();
    render(<CrmBoard />);
    await abrir(ANDINA);
    expect(screen.queryByRole('dialog', { name: ANDINA })).toBeNull();
  });

  it('the detail footer "Registrar contacto" opens the flow linked to the ficha\'s first OPEN deal (S4)', async () => {
    montar();
    render(<CrmBoard />);
    await screen.findByText(ANDINA);
    fireEvent.click(within(card(FERRETERIA)).getByRole('heading', { level: 3 }));
    const detalle = screen.getByRole('dialog', { name: FERRETERIA });
    // Every deal of Ferretería is lost: the footer is still offered (S3/S6.4) and opens the flow in GENERAL mode.
    fireEvent.click(within(detalle).getByRole('button', { name: 'Registrar contacto' }));
    let p = panel();
    expect(selectorOportunidad(p)).toHaveTextContent('Actividad general (sin oportunidad)');
    fireEvent.click(within(p).getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(within(card(ANDINA)).getByRole('heading', { level: 3 }));
    const detalleAndina = screen.getByRole('dialog', { name: ANDINA });
    fireEvent.click(within(detalleAndina).getByRole('button', { name: 'Registrar contacto' }));
    p = panel();
    // Andina's only deal is open (Por contactar): the flow comes linked to it.
    expect(selectorOportunidad(p)).toHaveTextContent('Equipos de protección para obra · Por contactar');
    expect(screen.queryByRole('dialog', { name: ANDINA })).toBeNull();
  });
});

describe('CrmBoard — panel Registrar actividad (S4, S7)', () => {
  it('shows title, subtitle with the principal contact, the deal selector, tiles, default medium and result', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
    expect(p.tagName).toBe('ASIDE');
    expect(p.className).toMatch(/\bfixed\b/);
    expect(within(p).getByRole('heading', { name: 'Registrar actividad' })).toBeInTheDocument();
    expect(within(p).getByText(`${TEXTILES} · Renzo Vargas`)).toBeInTheDocument();
    // Opened from a card: pre-linked to that deal.
    expect(selectorOportunidad(p)).toHaveTextContent('Exámenes de ingreso · Contactado');
    expect(within(p).getByText('Llamamos o escribimos nosotros')).toBeInTheDocument();
    expect(within(p).getByText('La empresa nos llamó o escribió')).toBeInTheDocument();
    expect(radio(p, /^Contactamos/)).toBeChecked();
    expect(radio(p, 'Llamada')).toBeChecked();
    expect(radio(p, 'Conversamos')).toBeChecked();
    for (const m of ['Correo', 'WhatsApp', 'Otro', 'No contestó', 'Dejé mensaje']) expect(radio(p, m)).toBeInTheDocument();
    expect(within(p).getByRole('button', { name: 'Guardar actividad' })).toBeInTheDocument();
    expect(radio(p, /^Contactamos/)).toHaveFocus();
  });

  it('the selector lists the ficha\'s deals with their stage and "Actividad general" first — Perdida is never offered', async () => {
    montar([
      oportunidad({ idOportunidad: 'o-3', idEmpresa: 'e-3', nombre: 'Exámenes de ingreso', etapa: 'contactado', medio: 'llamada' }),
      oportunidad({ idOportunidad: 'o-4', idEmpresa: 'e-3', nombre: 'Campaña de vacunación', etapa: 'ganada' }),
      oportunidad({ idOportunidad: 'o-7', idEmpresa: 'e-3', nombre: 'Ergonomía industrial', etapa: 'perdida' }),
    ]);
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
    fireEvent.click(selectorOportunidad(p));
    const opciones = within(p).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual([
      expect.stringContaining('Actividad general (sin oportunidad)'),
      expect.stringContaining('Exámenes de ingreso · Contactado'),
      expect.stringContaining('Campaña de vacunación · Ganada'),
    ]);
    expect(opciones.some((t) => t?.includes('Ergonomía industrial'))).toBe(false);
  });

  it('preselects the last medium used by the DEAL, with its free text when it is "Otro"', async () => {
    montar([
      oportunidad({ idOportunidad: 'o-5', idEmpresa: 'e-4', nombre: 'Ergonomía para planta', etapa: 'en_seguimiento', medio: 'whatsapp' }),
      oportunidad({
        idOportunidad: 'o-9',
        idEmpresa: 'e-2',
        nombre: 'Audiometrías',
        etapa: 'cotizado',
        medio: 'otro',
        medioOtro: 'Feria Expomina',
      }),
    ]);
    render(<CrmBoard />);
    let p = await abrir(VALLE);
    expect(radio(p, 'WhatsApp')).toBeChecked();
    fireEvent.click(within(p).getByRole('button', { name: 'Cancelar' }));
    p = await abrir('Minera Los Tres Picos S.A.');
    expect(radio(p, 'Otro')).toBeChecked();
    expect(within(p).getByLabelText('¿Cuál?')).toHaveValue('Feria Expomina');
  });

  it('shows "¿Cuál?" only for Otro, with a 40-character limit', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    expect(within(p).queryByLabelText('¿Cuál?')).toBeNull();
    elegir(p, 'Otro');
    expect(within(p).getByLabelText('¿Cuál?')).toHaveAttribute('maxlength', '40');
    elegir(p, 'Correo');
    expect(within(p).queryByLabelText('¿Cuál?')).toBeNull();
  });

  it('switching the selector re-picks the deal\'s medium and próxima acción, keeping the direction and the typed summary', async () => {
    montar([
      oportunidad({ idOportunidad: 'o-3', idEmpresa: 'e-3', nombre: 'Exámenes de ingreso', etapa: 'contactado', medio: 'llamada' }),
      oportunidad({ idOportunidad: 'o-4', idEmpresa: 'e-3', nombre: 'Campaña de vacunación', etapa: 'cotizado', medio: 'whatsapp' }),
    ]);
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'Cotización pedida');
    elegirOportunidad(p, /^Actividad general/);
    expect(radio(p, 'Llamada')).toBeChecked(); // general has no stored medium: the default
    expect(within(p).getByLabelText('Resumen de la conversación')).toHaveValue('Cotización pedida');
    elegirOportunidad(p, /Campaña de vacunación/);
    expect(radio(p, 'WhatsApp')).toBeChecked();
    expect(selectorOportunidad(p)).toHaveTextContent('Campaña de vacunación · Cotizado');
  });

  it('inbound shows "¿Ya le respondiste?" instead of the result', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    elegir(p, /^Nos contactaron/);
    expect(within(p).queryByRole('radio', { name: 'No contestó' })).toBeNull();
    expect(within(p).getByText('¿Ya le respondiste?')).toBeInTheDocument();
    expect(radio(p, 'Sí, ya le respondí')).toBeChecked();
    expect(radio(p, 'Todavía no')).toBeInTheDocument();
  });

  it.each([
    ['Resumen de la conversación', 'saliente', 'Conversamos'],
    ['Resumen (opcional)', 'saliente', 'No contestó'],
    ['Resumen (opcional)', 'saliente', 'Dejé mensaje'],
    ['Resumen de la conversación', 'entrante', 'Sí, ya le respondí'],
    ['¿Qué necesita? (opcional)', 'entrante', 'Todavía no'],
  ])('labels the summary "%s" (%s, %s)', async (etiqueta, direccion, resultado) => {
    montar();
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    if (direccion === 'entrante') elegir(p, /^Nos contactaron/);
    elegir(p, resultado);
    expect(within(p).getByLabelText(etiqueta)).toBeInTheDocument();
  });
});

describe('CrmBoard — vista previa (L8, por oportunidad)', () => {
  const prev = async (ops: Oportunidad[], nombre: string, pasos: (p: HTMLElement) => void = () => undefined) => {
    montar(ops);
    const { unmount } = render(<CrmBoard />);
    const p = await abrir(nombre);
    pasos(p);
    const texto = previa();
    unmount();
    return texto;
  };

  it('a general activity never touches the cards', async () => {
    expect(await prev(BASE_OPS, ANDINA, (p) => elegirOportunidad(p, /^Actividad general/))).toBe(
      'Actividad general: se guarda solo en el historial de Constructora Andina S.A.C.. Ninguna tarjeta cambia.',
    );
  });

  it('conversation from Por contactar, in Contactado and elsewhere', async () => {
    expect(await prev(BASE_OPS, ANDINA)).toBe(
      'La oportunidad «Equipos de protección para obra» pasa a «Contactado» con la etiqueta «Conversamos».',
    );
    expect(
      await prev(
        [oportunidad({ idOportunidad: 'o-3', idEmpresa: 'e-3', nombre: 'Exámenes de ingreso', etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 2 })],
        TEXTILES,
      ),
    ).toBe('La oportunidad «Exámenes de ingreso» se queda en «Contactado» y cambia a «Conversamos». El contador de intentos vuelve a cero.');
    expect(
      await prev(
        [oportunidad({ idOportunidad: 'o-5', idEmpresa: 'e-4', nombre: 'Ergonomía para planta', etapa: 'en_seguimiento', medio: 'whatsapp', intentosSinRespuesta: 1 })],
        VALLE,
      ),
    ).toBe('La oportunidad «Ergonomía para planta» se queda en «En seguimiento» y guarda la conversación en el historial. El contador de intentos vuelve a cero.');
  });

  it('failed attempt from Por contactar, in Contactado and elsewhere', async () => {
    expect(await prev(BASE_OPS, ANDINA, (p) => elegir(p, 'No contestó'))).toBe(
      'La oportunidad «Equipos de protección para obra» pasa a «Contactado» con la etiqueta «Sin respuesta · 1».',
    );
    expect(
      await prev(
        [oportunidad({ idOportunidad: 'o-3', idEmpresa: 'e-3', nombre: 'Exámenes de ingreso', etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 1 })],
        TEXTILES,
        (p) => elegir(p, 'Dejé mensaje'),
      ),
    ).toBe('La oportunidad «Exámenes de ingreso» se queda en «Contactado» como «Sin respuesta · 2».');
  });

  it('adds the Perdida hint from the third failed attempt', async () => {
    expect(
      await prev(
        [oportunidad({ idOportunidad: 'o-3', idEmpresa: 'e-3', nombre: 'Exámenes de ingreso', etapa: 'contactado', medio: 'llamada', intentosSinRespuesta: 2 })],
        TEXTILES,
        (p) => elegir(p, 'No contestó'),
      ),
    ).toBe(
      'La oportunidad «Exámenes de ingreso» se queda en «Contactado» como «Sin respuesta · 3». Como son 3 o más seguidos, te sugerirá pasarla a Perdida con el motivo «No contestan».',
    );
  });

  it('a conversation on a Ganada deal stays in Ganada', async () => {
    expect(
      await prev([oportunidad({ idOportunidad: 'o-4', idEmpresa: 'e-4', nombre: 'Campaña de vacunación', etapa: 'ganada' })], VALLE),
    ).toBe('La oportunidad «Campaña de vacunación» se queda en «Ganada» y guarda la conversación en el historial.');
  });

  it('inbound answered and not answered', async () => {
    expect(await prev(BASE_OPS, ANDINA, (p) => elegir(p, /^Nos contactaron/))).toBe(
      'La oportunidad «Equipos de protección para obra» pasa a «Contactado» con la etiqueta «Conversamos».',
    );
    expect(await prev(BASE_OPS, ANDINA, (p) => (elegir(p, /^Nos contactaron/), elegir(p, 'Todavía no')))).toBe(
      'La oportunidad «Equipos de protección para obra» pasa a «Contactado» con la etiqueta «Falta responder».',
    );
  });
});

describe('CrmBoard — guardar la actividad (S7.4)', () => {
  it('posts the exact payload linked to the deal, moves the card, closes the panel and toasts', async () => {
    const fn = montar(BASE_OPS, (_id, body) =>
      respuestaActividad({
        ...BASE_OPS[1]!,
        etapa: 'en_seguimiento',
        intentosSinRespuesta: 0,
        proximaAccion: { tipo: 'llamar', detalle: null, fecha: LUNES },
      }),
    );
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
    escribir(within(p).getByLabelText('Resumen de la conversación'), '  Pidió cotización  ');
    elegirAccion(p, 'Llamar');
    rapida(p, 'Próximo día hábil');
    guardar(p);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar actividad' })).toBeNull());
    expect(llamadas(fn, 'POST', '/api/crm/empresas/e-3/actividades')).toHaveLength(1);
    const llamada = llamadas(fn, 'POST', '/api/crm/empresas/e-3/actividades')[0]!;
    expect(llamada.body).toEqual({
      idOportunidad: 'o-3',
      direccion: 'saliente',
      medio: 'llamada',
      resultado: 'conversamos',
      resumen: 'Pidió cotización',
      proximaAccion: ACCION,
    });
    const init = fn.mock.calls.find(([u]) => u === '/api/crm/empresas/e-3/actividades')![1]!;
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    // The card advanced with its deal: it is in En seguimiento now, at the top.
    expect(within(columna('En seguimiento')).getAllByRole('heading', { level: 3 })[0]).toHaveTextContent(TEXTILES);
    expect(toastMock.success).toHaveBeenCalledWith(`Actividad guardada en «${TEXTILES} · Exámenes de ingreso».`);
    // The focus lands back on the card — the node that remounted into its new column.
    await waitFor(() => expect(document.querySelector<HTMLElement>('[data-empresa-id="o-3"]')).toHaveFocus());
  });

  it('a failed attempt from Por contactar moves the card to Contactado as "Sin respuesta · 1"', async () => {
    const fn = montar(
      BASE_OPS,
      (_id, body) =>
        respuestaActividad({
          ...BASE_OPS[0]!,
          nombre: 'Equipos de protección para obra',
          etapa: 'contactado',
          medio: body.medio as never,
          intentosSinRespuesta: 1,
          proximaAccion: { tipo: 'llamar', detalle: null, fecha: LUNES },
        }),
    );
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    elegir(p, 'Correo');
    elegir(p, 'No contestó');
    elegirAccion(p, 'Llamar');
    guardar(p);
    await waitFor(() => expect(within(columna('Contactado')).getAllByRole('heading', { level: 3 })[0]).toHaveTextContent(ANDINA));
    expect(within(columna('Contactado')).getByText('Sin respuesta · 1')).toBeInTheDocument();
    expect(llamadas(fn, 'POST', /actividades$/)[0]!.body).toEqual({
      idOportunidad: 'o-1',
      direccion: 'saliente',
      medio: 'correo',
      resultado: 'no_contesto',
      proximaAccion: ACCION,
    });
  });

  it('sends medioOtro and the free next action with its detail', async () => {
    const OPS = [oportunidad({ idOportunidad: 'o-3', idEmpresa: 'e-3', nombre: 'Exámenes de ingreso', etapa: 'contactado', medio: 'llamada' })];
    const fn = montar(
      OPS,
      (_id, body) => respuestaActividad({ ...OPS[0]!, medio: body.medio as never }),
    );
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
    elegir(p, 'Otro');
    escribir(within(p).getByLabelText('¿Cuál?', { selector: '#reg-otro' }), ' Visita en persona ');
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'Fuimos a verlos');
    elegirAccion(p, 'Otro');
    escribir(within(proxima(p)).getByLabelText('¿Cuál?'), ' Enviar el contrato ');
    rapida(p, 'Hoy');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', /actividades$/)).toHaveLength(1));
    expect(llamadas(fn, 'POST', /actividades$/)[0]!.body).toEqual({
      idOportunidad: 'o-3',
      direccion: 'saliente',
      medio: 'otro',
      medioOtro: 'Visita en persona',
      resultado: 'conversamos',
      resumen: 'Fuimos a verlos',
      proximaAccion: { tipo: 'otro', detalle: 'Enviar el contrato', fecha: HOY },
    });
  });

  it('inbound on a linked deal: "Todavía no" posts pendiente without a required summary', async () => {
    const fn = montar(BASE_OPS, (_id, body) =>
      respuestaActividad({
        ...BASE_OPS[1]!,
        etapa: 'contactado',
        faltaResponderDesde: '2026-10-31T16:00:00.000Z',
        proximaAccion: body.proximaAccion as never,
      }),
    );
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
    elegir(p, /^Nos contactaron/);
    elegir(p, 'Todavía no');
    escribir(within(p).getByLabelText('¿Qué necesita? (opcional)'), 'Precios');
    elegirAccion(p, 'Responder');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', /actividades$/)).toHaveLength(1));
    expect(llamadas(fn, 'POST', /actividades$/)[0]!.body).toEqual({
      idOportunidad: 'o-3',
      direccion: 'entrante',
      medio: 'llamada',
      resultado: 'pendiente',
      resumen: 'Precios',
      proximaAccion: { tipo: 'responder', fecha: LUNES },
    });
    await waitFor(() => expect(within(card(TEXTILES)).getByText(/^Falta responder/)).toBeInTheDocument());
    expect(within(card(TEXTILES)).getByRole('button', { name: 'Responder' })).toBeInTheDocument();
  });

  it('a GENERAL activity posts idOportunidad null and proximaAccion null (S7.4: general never requires it), and moves no card', async () => {
    const fn = montar(BASE_OPS, () => ({
      status: 201,
      body: {
        success: true,
        empresa: LISTA.find((e) => e.idEmpresa === 'e-3')!,
        oportunidad: null,
        interaccion: { idInteraccion: 1, idEmpresa: 'e-3', idOportunidad: null },
      },
    }));
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
    elegirOportunidad(p, /^Actividad general/);
    // "Sin próxima acción" comes pre-chosen and the calendar fields are hidden.
    expect(within(proxima(p)).getByRole('button', { name: /Qué hacer/ })).toHaveTextContent('Sin próxima acción');
    expect(within(proxima(p)).queryByRole('button', { name: /Cuándo/ })).toBeNull();
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'Consultó por facturación');
    guardar(p);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar actividad' })).toBeNull());
    expect(llamadas(fn, 'POST', '/api/crm/empresas/e-3/actividades')[0]!.body).toEqual({
      idOportunidad: null,
      direccion: 'saliente',
      medio: 'llamada',
      resultado: 'conversamos',
      resumen: 'Consultó por facturación',
      proximaAccion: null,
    });
    expect(toastMock.success).toHaveBeenCalledWith('Actividad guardada en el historial de «Textiles Pacífico S.A.C.».');
    // No deal advanced: the board is untouched.
    expect(within(columna('Contactado')).getByRole('heading', { level: 3, name: TEXTILES })).toBeInTheDocument();
    expect(within(columna('Por contactar')).getByRole('heading', { level: 3, name: ANDINA })).toBeInTheDocument();
  });

  it('on a Ganada deal the next action is optional: "Sin próxima acción" first and posts proximaAccion null', async () => {
    const OPS = [oportunidad({ idOportunidad: 'o-4', idEmpresa: 'e-4', nombre: 'Campaña de vacunación', etapa: 'ganada' })];
    const fn = montar(
      OPS,
      (_id, body) => respuestaActividad({ ...OPS[0]!, proximaAccion: (body.proximaAccion as never) ?? null }),
    );
    render(<CrmBoard />);
    const p = await abrir(VALLE);
    expect(within(p).getByRole('group', { name: 'Próxima acción (opcional)' })).toBeInTheDocument();
    const boton = within(proxima(p)).getByRole('button', { name: /Qué hacer/ });
    expect(boton).toHaveTextContent('Sin próxima acción');
    fireEvent.click(boton);
    expect(within(proxima(p)).getAllByRole('option')[0]).toHaveTextContent('Sin próxima acción');
    fireEvent.keyDown(within(proxima(p)).getByRole('listbox'), { key: 'Escape' });
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'Renovó');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', /actividades$/)).toHaveLength(1));
    expect(llamadas(fn, 'POST', /actividades$/)[0]!.body).toMatchObject({ idOportunidad: 'o-4', proximaAccion: null });
  });

  it('starts from the stored next action of the deal when it is not overdue, and empty when it is', async () => {
    montar([
      oportunidad({
        idOportunidad: 'o-3',
        idEmpresa: 'e-3',
        nombre: 'Exámenes de ingreso',
        etapa: 'cotizado',
        medio: 'llamada',
        proximaAccion: { tipo: 'cotizar', detalle: 'Plan anual', fecha: '2026-11-04' },
      }),
      oportunidad({
        idOportunidad: 'o-5',
        idEmpresa: 'e-4',
        nombre: 'Ergonomía para planta',
        etapa: 'en_seguimiento',
        medio: 'whatsapp',
        proximaAccion: { tipo: 'cotizar', detalle: null, fecha: '2026-10-29' },
      }),
    ]);
    render(<CrmBoard />);
    let p = await abrir(TEXTILES);
    expect(within(proxima(p)).getByRole('button', { name: /Qué hacer/ })).toHaveTextContent('Enviar cotización');
    expect(within(proxima(p)).getByLabelText('Detalle (opcional)')).toHaveValue('Plan anual');
    expect(within(proxima(p)).getByRole('button', { name: /Cuándo/ })).toHaveTextContent('miércoles 4 de noviembre de 2026');
    fireEvent.click(within(p).getByRole('button', { name: 'Cancelar' }));
    p = await abrir(VALLE);
    expect(within(proxima(p)).getByRole('button', { name: /Qué hacer/ })).toHaveTextContent('Elige una acción');
  });

  it('marks on the calendar the days with actions of OTHER empresas only', async () => {
    montar([
      oportunidad({ idOportunidad: 'o-3', idEmpresa: 'e-3', nombre: 'Exámenes de ingreso', etapa: 'contactado', medio: 'llamada', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-05' } }),
      oportunidad({ idOportunidad: 'o-5', idEmpresa: 'e-4', nombre: 'Ergonomía para planta', etapa: 'en_seguimiento', medio: 'whatsapp', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } }),
      oportunidad({ idOportunidad: 'o-6', idEmpresa: 'e-2', nombre: 'Vigilancia epidemiológica', etapa: 'cotizado', medio: 'llamada', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-06' } }),
      oportunidad({ idOportunidad: 'o-7', idEmpresa: 'e-5', nombre: 'Cerrada con acción', etapa: 'ganada', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-09' } }),
    ]);
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
    fireEvent.click(within(proxima(p)).getByRole('button', { name: /Cuándo/ }));
    const cal = within(screen.getByRole('dialog', { name: 'Elegir la fecha de la próxima acción' }));
    expect(cal.getByRole('button', { name: /martes 3 de noviembre.*1 acción agendada/ })).toBeInTheDocument();
    expect(cal.getByRole('button', { name: /viernes 6 de noviembre.*1 acción agendada/ })).toBeInTheDocument();
    // The panel's own empresa and a closed deal do not count.
    expect(cal.getByRole('button', { name: /jueves 5 de noviembre/ }).getAttribute('aria-label')).not.toMatch(/agendada/);
    expect(cal.getByRole('button', { name: /lunes 9 de noviembre/ }).getAttribute('aria-label')).not.toMatch(/agendada/);
    void p;
  });
});

describe('CrmBoard — validación (sin pedir nada al servidor)', () => {
  async function intentar(pasos: (p: HTMLElement) => void = () => undefined, ops: Oportunidad[] = BASE_OPS, nombre = ANDINA) {
    const fn = montar(ops);
    render(<CrmBoard />);
    const p = await abrir(nombre);
    pasos(p);
    guardar(p);
    expect(llamadas(fn, 'POST', /actividades$/)).toHaveLength(0);
    return p;
  }

  function enlazado(p: HTMLElement, campo: HTMLElement, mensaje: string) {
    const aviso = within(p).getByText(mensaje);
    expect(aviso).toHaveAttribute('role', 'alert');
    expect(campo.getAttribute('aria-describedby')).toContain(aviso.id);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveFocus();
  }

  it('Otro without "¿Cuál?"', async () => {
    const p = await intentar((q) => {
      elegir(q, 'Otro');
      escribir(within(q).getByLabelText('Resumen de la conversación'), 'x');
      elegirAccion(q, 'Llamar');
    });
    enlazado(p, within(p).getByLabelText('¿Cuál?', { selector: '#reg-otro' }), 'Escribe cuál fue el medio.');
  });

  it('a conversation without summary', async () => {
    const p = await intentar((q) => elegirAccion(q, 'Llamar'));
    enlazado(p, within(p).getByLabelText('Resumen de la conversación'), 'Escribe un resumen de la conversación.');
  });

  it('no next action chosen on a linked open deal', async () => {
    const p = await intentar((q) => escribir(within(q).getByLabelText('Resumen de la conversación'), 'x'));
    enlazado(p, within(proxima(p)).getByRole('button', { name: /Qué hacer/ }), 'Elige la próxima acción.');
  });

  it('next action Otro without detail', async () => {
    const p = await intentar((q) => {
      escribir(within(q).getByLabelText('Resumen de la conversación'), 'x');
      elegirAccion(q, 'Otro');
    });
    enlazado(p, within(proxima(p)).getByLabelText('¿Cuál?'), 'Escribe cuál es la próxima acción.');
  });

  it('with several errors it focuses the first one in the form', async () => {
    const p = await intentar((q) => elegir(q, 'Otro'));
    expect(within(p).getByText('Escribe cuál fue el medio.')).toBeInTheDocument();
    expect(within(p).getByText('Escribe un resumen de la conversación.')).toBeInTheDocument();
    expect(within(p).getByText('Elige la próxima acción.')).toBeInTheDocument();
    expect(within(p).getByLabelText('¿Cuál?', { selector: '#reg-otro' })).toHaveFocus();
  });
});

describe('CrmBoard — errores del servidor y cierre', () => {
  it('shows the server error as a toast and keeps the panel and what was typed', async () => {
    montar(BASE_OPS, () => ({ status: 400, body: { success: false, error: 'No se puede registrar una actividad en una oportunidad en Perdida.' } }));
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'Hablamos');
    elegirAccion(p, 'Llamar');
    guardar(p);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se puede registrar una actividad en una oportunidad en Perdida.'));
    expect(panel()).toBeInTheDocument();
    expect(within(p).getByLabelText('Resumen de la conversación')).toHaveValue('Hablamos');
    expect(within(p).getByRole('button', { name: 'Guardar actividad' })).toBeEnabled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(within(columna('Por contactar')).getByText(ANDINA)).toBeInTheDocument();
  });

  it('a network failure shows a generic error and keeps the panel', async () => {
    const base = montar();
    global.fetch = vi.fn(async (u: string, i?: RequestInit) => {
      if (/actividades$/.test(u)) throw new Error('offline');
      return base(u, i);
    }) as unknown as typeof fetch;
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'x');
    elegirAccion(p, 'Llamar');
    guardar(p);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se pudo guardar la actividad'));
    expect(panel()).toBeInTheDocument();
  });

  it('Cancelar and Escape close the panel and give the focus back to the button that opened it', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    const boton = within(card(ANDINA)).getByRole('button', { name: 'Registrar actividad' });
    fireEvent.click(within(p).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Registrar actividad' })).toBeNull();
    expect(boton).toHaveFocus();
    await abrir(ANDINA);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: 'Registrar actividad' })).toBeNull();
    expect(boton).toHaveFocus();
  });
});

describe('CrmBoard — lo anterior sigue funcionando', () => {
  it('"Nueva empresa" still creates the ficha and a card still moves between columns', async () => {
    const fn = montar();
    render(<CrmBoard />);
    await screen.findByText(ANDINA);
    fireEvent.click(screen.getByRole('button', { name: /Nueva empresa/ }));
    const alta = screen.getByRole('dialog', { name: /Nueva empresa/ });
    escribir(within(alta).getByLabelText(/^Razón social/), 'Ferretería Norte S.A.C.');
    escribir(within(alta).getByLabelText(/^RUC/), '20123456789');
    escribir(within(alta).getByLabelText(/^Nombre/), 'Elena Mendoza');
    escribir(within(alta).getByLabelText(/^Teléfono/), '955 201 334');
    fireEvent.click(within(alta).getByRole('button', { name: /Crear empresa/ }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Empresa creada'));
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(1);

    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '' };
    fireEvent.dragStart(card(VALLE), { dataTransfer });
    fireEvent.dragOver(columna('Cotizado'), { dataTransfer });
    fireEvent.drop(columna('Cotizado'), { dataTransfer });
    await waitFor(() => expect(within(columna('Cotizado')).getByText(VALLE)).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', '/api/crm/oportunidades/o-5/etapa')[0]!.body).toEqual({ etapa: 'cotizado' });
  });
});
