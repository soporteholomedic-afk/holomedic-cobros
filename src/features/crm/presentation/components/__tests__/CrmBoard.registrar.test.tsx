import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import type { Empresa } from '../../../domain/entities';
import { CrmBoard } from '../CrmBoard';
import { empresa, llamadas, mockApi, type Respuesta } from './crmFixtures';

const ANDINA = 'Constructora Andina S.A.C.';
const TEXTILES = 'Textiles Pacífico S.A.C.';
const VALLE = 'Agroindustrial Valle Verde S.A.C.';
const FERRETERIA = 'Ferretería El Maestro S.R.L.';
const HOY = '2026-10-31';
const LUNES = '2026-11-02';

const card = (nombre: string) => screen.getByRole('heading', { level: 3, name: nombre }).closest('article') as HTMLElement;
const columna = (nombre: string) => screen.getByRole('region', { name: nombre });
const panel = () => screen.getByRole('dialog', { name: 'Registrar contacto' });
const previa = () => screen.getByTestId('contacto-previa').textContent;

const BASE: Empresa[] = [
  empresa({ idEmpresa: 'e-1', razonSocial: ANDINA }),
  empresa({
    idEmpresa: 'e-3',
    razonSocial: TEXTILES,
    ruc: '20556677889',
    etapa: 'contactado',
    medio: 'llamada',
    contactos: [{ nombre: 'Renzo Vargas', telefono: '998 201 456', correo: null }],
  }),
  empresa({ idEmpresa: 'e-4', razonSocial: VALLE, ruc: '20534128790', etapa: 'cliente', medio: 'whatsapp' }),
  empresa({
    idEmpresa: 'e-5',
    razonSocial: FERRETERIA,
    ruc: '20478901234',
    etapa: 'perdido',
    medio: 'llamada',
    motivo: { categoria: 'sin_interes', detalle1: null, detalle2: null, notas: null },
  }),
];

function montar(lista: Empresa[] = BASE, contacto?: (id: string, body: Record<string, unknown>) => Respuesta) {
  return mockApi({ lista: { status: 200, body: { success: true, empresas: lista } }, contacto });
}

async function abrir(nombre: string, boton = 'Registrar contacto') {
  await screen.findByText(nombre);
  fireEvent.click(within(card(nombre)).getByRole('button', { name: boton }));
  return panel();
}

const radio = (p: HTMLElement, nombre: string | RegExp) => within(p).getByRole('radio', { name: nombre });
const elegir = (p: HTMLElement, nombre: string | RegExp) => fireEvent.click(radio(p, nombre));
const escribir = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });
const proxima = (p: HTMLElement) => within(p).getByRole('group', { name: /Próxima acción/ });

function elegirAccion(p: HTMLElement, nombre: string) {
  fireEvent.click(within(proxima(p)).getByRole('button', { name: /Qué hacer/ }));
  fireEvent.click(within(proxima(p)).getByRole('option', { name: new RegExp(`^${nombre}`) }));
}
const rapida = (p: HTMLElement, nombre: string) => fireEvent.click(within(proxima(p)).getByRole('button', { name: new RegExp(`^${nombre}`) }));
const guardar = (p: HTMLElement) => fireEvent.click(within(p).getByRole('button', { name: 'Guardar contacto' }));

const ACCION = { tipo: 'llamar', fecha: LUNES };

function conRespuesta(base: Empresa, cambios: Partial<Empresa>): Respuesta {
  return { status: 201, body: { success: true, empresa: { ...base, updatedAt: '2026-10-31T16:00:00.000Z', ...cambios }, interaccion: {} } };
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
  it('offers "Registrar contacto" on every card except Perdido', async () => {
    montar();
    render(<CrmBoard />);
    await screen.findByText(ANDINA);
    for (const n of [ANDINA, TEXTILES, VALLE]) {
      expect(within(card(n)).getByRole('button', { name: 'Registrar contacto' })).toBeInTheDocument();
    }
    expect(within(card(FERRETERIA)).queryByRole('button', { name: 'Registrar contacto' })).toBeNull();
    expect(within(card(FERRETERIA)).queryByRole('button', { name: 'Responder' })).toBeNull();
  });

  it('shows a primary "Responder" instead when the card says "Falta responder", and it opens the panel with "Contactamos"', async () => {
    montar([empresa({ idEmpresa: 'e-1', razonSocial: ANDINA, etapa: 'contactado', medio: 'correo', faltaResponderDesde: '2026-10-31T15:30:00.000Z' })]);
    render(<CrmBoard />);
    await screen.findByText(ANDINA);
    const c = card(ANDINA);
    expect(within(c).queryByRole('button', { name: 'Registrar contacto' })).toBeNull();
    const boton = within(c).getByRole('button', { name: 'Responder' });
    expect(boton.className).toMatch(/from-sky-600/);
    expect(boton.querySelector('svg')).not.toBeNull();
    fireEvent.click(boton);
    expect(radio(panel(), /^Contactamos/)).toBeChecked();
    expect(screen.queryByRole('dialog', { name: ANDINA })).toBeNull();
  });

  it('does not open the detail panel when the button is clicked', async () => {
    montar();
    render(<CrmBoard />);
    await abrir(ANDINA);
    expect(screen.queryByRole('dialog', { name: ANDINA })).toBeNull();
  });

  it('the detail footer offers "Registrar contacto" (not for Perdido) and opens the panel', async () => {
    montar();
    render(<CrmBoard />);
    await screen.findByText(ANDINA);
    fireEvent.click(within(card(FERRETERIA)).getByRole('heading', { level: 3 }));
    expect(within(screen.getByRole('dialog', { name: FERRETERIA })).queryByRole('button', { name: 'Registrar contacto' })).toBeNull();
    fireEvent.click(within(card(ANDINA)).getByRole('heading', { level: 3 }));
    const detalle = screen.getByRole('dialog', { name: ANDINA });
    fireEvent.click(within(detalle).getByRole('button', { name: 'Registrar contacto' }));
    expect(panel()).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: ANDINA })).toBeNull();
  });
});

describe('CrmBoard — panel Registrar contacto (S7, S8)', () => {
  it('shows title, subtitle with the principal contact, tiles, default medium and result', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    expect(p.tagName).toBe('ASIDE');
    expect(p.className).toMatch(/\bfixed\b/);
    expect(within(p).getByRole('heading', { name: 'Registrar contacto' })).toBeInTheDocument();
    expect(within(p).getByText(`${ANDINA} · Marcela Quispe`)).toBeInTheDocument();
    expect(within(p).getByText('Llamamos o escribimos nosotros')).toBeInTheDocument();
    expect(within(p).getByText('La empresa nos llamó o escribió')).toBeInTheDocument();
    expect(radio(p, /^Contactamos/)).toBeChecked();
    expect(radio(p, 'Llamada')).toBeChecked();
    expect(radio(p, 'Conversamos')).toBeChecked();
    for (const m of ['Correo', 'WhatsApp', 'Otro', 'No contestó', 'Dejé mensaje']) expect(radio(p, m)).toBeInTheDocument();
    expect(radio(p, /^Contactamos/)).toHaveFocus();
  });

  it('preselects the last medium used by the card, with its free text when it is "Otro"', async () => {
    montar([
      empresa({ idEmpresa: 'e-4', razonSocial: VALLE, etapa: 'cliente', medio: 'whatsapp' }),
      empresa({ idEmpresa: 'e-7', razonSocial: 'Otra S.A.', ruc: '20000000007', etapa: 'contactado', medio: 'otro', medioOtro: 'Feria Expomina' }),
    ]);
    render(<CrmBoard />);
    let p = await abrir(VALLE);
    expect(radio(p, 'WhatsApp')).toBeChecked();
    fireEvent.click(within(p).getByRole('button', { name: 'Cancelar' }));
    p = await abrir('Otra S.A.');
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

describe('CrmBoard — vista previa (L8)', () => {
  const prev = async (lista: Empresa[], nombre: string, pasos: (p: HTMLElement) => void = () => undefined) => {
    montar(lista);
    const { unmount } = render(<CrmBoard />);
    const p = await abrir(nombre);
    pasos(p);
    const texto = previa();
    unmount();
    return texto;
  };
  const con = (cambios: Partial<Empresa>) => [empresa({ idEmpresa: 'e-1', razonSocial: ANDINA, ...cambios })];

  it('conversation from Por contactar', async () => {
    expect(await prev(con({}), ANDINA)).toBe('La tarjeta pasa a «Contactado» con la etiqueta «Conversamos».');
  });
  it('conversation in Contactado, and the counter reset', async () => {
    expect(await prev(con({ etapa: 'contactado' }), ANDINA)).toBe('La tarjeta se queda en «Contactado» y cambia a «Conversamos».');
    expect(await prev(con({ etapa: 'contactado', intentosSinRespuesta: 2 }), ANDINA)).toBe(
      'La tarjeta se queda en «Contactado» y cambia a «Conversamos». El contador de intentos vuelve a cero.',
    );
  });
  it('conversation in another column', async () => {
    expect(await prev(con({ etapa: 'en_seguimiento', intentosSinRespuesta: 1 }), ANDINA)).toBe(
      'La tarjeta se queda en «En seguimiento» y guarda la conversación en el historial. El contador de intentos vuelve a cero.',
    );
  });
  it('failed attempt from Por contactar, in Contactado and elsewhere', async () => {
    expect(await prev(con({}), ANDINA, (p) => elegir(p, 'No contestó'))).toBe(
      'La tarjeta pasa a «Contactado» con la etiqueta «Sin respuesta · 1».',
    );
    expect(await prev(con({ etapa: 'contactado', intentosSinRespuesta: 1 }), ANDINA, (p) => elegir(p, 'Dejé mensaje'))).toBe(
      'La tarjeta se queda en «Contactado» como «Sin respuesta · 2».',
    );
    expect(await prev(con({ etapa: 'cliente', intentosSinRespuesta: 1 }), ANDINA, (p) => elegir(p, 'No contestó'))).toBe(
      'La tarjeta se queda en «Cliente» y suma el intento 2 sin respuesta.',
    );
  });
  it('adds the Perdido hint from the third failed attempt', async () => {
    expect(await prev(con({ etapa: 'contactado', intentosSinRespuesta: 2 }), ANDINA, (p) => elegir(p, 'No contestó'))).toBe(
      'La tarjeta se queda en «Contactado» como «Sin respuesta · 3». Como son 3 o más seguidos, te sugerirá pasarla a Perdido con el motivo «No contestan».',
    );
  });
  it('inbound answered and not answered', async () => {
    expect(await prev(con({}), ANDINA, (p) => elegir(p, /^Nos contactaron/))).toBe(
      'La tarjeta pasa a «Contactado» con la etiqueta «Conversamos».',
    );
    expect(await prev(con({}), ANDINA, (p) => (elegir(p, /^Nos contactaron/), elegir(p, 'Todavía no')))).toBe(
      'La tarjeta pasa a «Contactado» con la etiqueta «Falta responder».',
    );
    expect(await prev(con({ etapa: 'en_seguimiento' }), ANDINA, (p) => (elegir(p, /^Nos contactaron/), elegir(p, 'Todavía no')))).toBe(
      'La tarjeta se queda en «En seguimiento» con la etiqueta «Falta responder».',
    );
  });
});

describe('CrmBoard — guardar el contacto', () => {
  it('posts the exact payload, moves the card to Contactado, closes the panel and toasts', async () => {
    const fn = montar(BASE, () => conRespuesta(BASE[0]!, { etapa: 'contactado', medio: 'llamada', proximaAccion: { tipo: 'llamar', detalle: null, fecha: LUNES } }));
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    escribir(within(p).getByLabelText('Resumen de la conversación'), '  Pidió cotización  ');
    elegirAccion(p, 'Llamar');
    rapida(p, 'Próximo día hábil');
    guardar(p);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar contacto' })).toBeNull());
    const [llamada] = llamadas(fn, 'POST', '/api/crm/empresas/e-1/contactos');
    expect(llamada!.body).toEqual({
      direccion: 'saliente',
      medio: 'llamada',
      resultado: 'conversamos',
      resumen: 'Pidió cotización',
      proximaAccion: ACCION,
    });
    const init = fn.mock.calls.find(([u]) => u === '/api/crm/empresas/e-1/contactos')![1]!;
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(within(columna('Contactado')).getByText(ANDINA)).toBeInTheDocument();
    expect(within(columna('Por contactar')).queryByText(ANDINA)).toBeNull();
    expect(toastMock.success).toHaveBeenCalledWith(`Contacto guardado en «${ANDINA}». Está en «Contactado» · Conversamos.`);
  });

  it('a failed attempt from Por contactar leaves the card in Contactado as "Sin respuesta · 1"', async () => {
    const fn = montar(BASE, () =>
      conRespuesta(BASE[0]!, { etapa: 'contactado', medio: 'correo', intentosSinRespuesta: 1, proximaAccion: { tipo: 'llamar', detalle: null, fecha: LUNES } }),
    );
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    elegir(p, 'Correo');
    elegir(p, 'No contestó');
    elegirAccion(p, 'Llamar');
    guardar(p);
    await waitFor(() => expect(within(columna('Contactado')).getByText('Sin respuesta · 1')).toBeInTheDocument());
    expect(llamadas(fn, 'POST', /contactos$/)[0]!.body).toEqual({
      direccion: 'saliente',
      medio: 'correo',
      resultado: 'no_contesto',
      proximaAccion: ACCION,
    });
    expect(toastMock.success).toHaveBeenCalledWith(`Contacto guardado en «${ANDINA}». Está en «Contactado» · Sin respuesta · 1.`);
  });

  it('sends medioOtro and the free next action with its detail', async () => {
    const fn = montar(BASE, () => conRespuesta(BASE[0]!, { etapa: 'contactado', medio: 'otro', medioOtro: 'Visita' }));
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    elegir(p, 'Otro');
    escribir(within(p).getByLabelText('¿Cuál?', { selector: '#reg-otro' }), ' Visita en persona ');
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'Fuimos a verlos');
    elegirAccion(p, 'Otro');
    escribir(within(proxima(p)).getByLabelText('¿Cuál?'), ' Enviar el contrato ');
    rapida(p, 'Hoy');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', /contactos$/)).toHaveLength(1));
    expect(llamadas(fn, 'POST', /contactos$/)[0]!.body).toEqual({
      direccion: 'saliente',
      medio: 'otro',
      medioOtro: 'Visita en persona',
      resultado: 'conversamos',
      resumen: 'Fuimos a verlos',
      proximaAccion: { tipo: 'otro', detalle: 'Enviar el contrato', fecha: HOY },
    });
  });

  it('inbound on an existing card: "Todavía no" posts pendiente without a required summary', async () => {
    const fn = montar(BASE, () => conRespuesta(BASE[1]!, { faltaResponderDesde: '2026-10-31T16:00:00.000Z' }));
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
    elegir(p, /^Nos contactaron/);
    elegir(p, 'Todavía no');
    escribir(within(p).getByLabelText('¿Qué necesita? (opcional)'), 'Precios');
    elegirAccion(p, 'Responder');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', /contactos$/)).toHaveLength(1));
    expect(llamadas(fn, 'POST', /contactos$/)[0]!.body).toEqual({
      direccion: 'entrante',
      medio: 'llamada',
      resultado: 'pendiente',
      resumen: 'Precios',
      proximaAccion: { tipo: 'responder', fecha: LUNES },
    });
    await waitFor(() => expect(within(card(TEXTILES)).getByText(/^Falta responder/)).toBeInTheDocument());
    expect(within(card(TEXTILES)).getByRole('button', { name: 'Responder' })).toBeInTheDocument();
  });

  it('inbound already answered posts respondido', async () => {
    const fn = montar(BASE, () => conRespuesta(BASE[1]!, {}));
    render(<CrmBoard />);
    const p = await abrir(TEXTILES);
    elegir(p, /^Nos contactaron/);
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'Ya hablamos');
    elegirAccion(p, 'Enviar cotización');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', /contactos$/)).toHaveLength(1));
    expect(llamadas(fn, 'POST', /contactos$/)[0]!.body).toMatchObject({ direccion: 'entrante', resultado: 'respondido' });
  });

  it('in Cliente the first option is "Sin próxima acción", chosen by default, and posts proximaAccion null', async () => {
    const fn = montar(BASE, () => conRespuesta(BASE[2]!, {}));
    render(<CrmBoard />);
    const p = await abrir(VALLE);
    expect(within(p).getByRole('group', { name: 'Próxima acción (opcional)' })).toBeInTheDocument();
    const boton = within(proxima(p)).getByRole('button', { name: /Qué hacer/ });
    expect(boton).toHaveTextContent('Sin próxima acción');
    expect(within(proxima(p)).queryByRole('button', { name: /Cuándo/ })).toBeNull();
    fireEvent.click(boton);
    expect(within(proxima(p)).getAllByRole('option')[0]).toHaveTextContent('Sin próxima acción');
    fireEvent.keyDown(within(proxima(p)).getByRole('listbox'), { key: 'Escape' });
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'Renovó');
    guardar(p);
    await waitFor(() => expect(llamadas(fn, 'POST', /contactos$/)).toHaveLength(1));
    expect(llamadas(fn, 'POST', /contactos$/)[0]!.body).toEqual({
      direccion: 'saliente',
      medio: 'whatsapp',
      resultado: 'conversamos',
      resumen: 'Renovó',
      proximaAccion: null,
    });
  });

  it('starts from the stored next action when it is not overdue, and empty when it is', async () => {
    montar([
      empresa({ idEmpresa: 'e-1', razonSocial: ANDINA, proximaAccion: { tipo: 'cotizar', detalle: 'Plan anual', fecha: '2026-11-04' } }),
      empresa({ idEmpresa: 'e-2', razonSocial: 'Vencida S.A.', ruc: '20000000002', proximaAccion: { tipo: 'cotizar', detalle: null, fecha: '2026-10-29' } }),
    ]);
    render(<CrmBoard />);
    let p = await abrir(ANDINA);
    expect(within(proxima(p)).getByRole('button', { name: /Qué hacer/ })).toHaveTextContent('Enviar cotización');
    expect(within(proxima(p)).getByLabelText('Detalle (opcional)')).toHaveValue('Plan anual');
    expect(within(proxima(p)).getByRole('button', { name: /Cuándo/ })).toHaveTextContent('miércoles 4 de noviembre de 2026');
    fireEvent.click(within(p).getByRole('button', { name: 'Cancelar' }));
    p = await abrir('Vencida S.A.');
    expect(within(proxima(p)).getByRole('button', { name: /Qué hacer/ })).toHaveTextContent('Elige una acción');
  });

  it('marks on the calendar the days with actions of OTHER open cards only', async () => {
    montar([
      empresa({ idEmpresa: 'e-1', razonSocial: ANDINA, proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-05' } }),
      empresa({ idEmpresa: 'e-2', razonSocial: 'Otra S.A.', ruc: '20000000002', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } }),
      empresa({ idEmpresa: 'e-3', razonSocial: 'Cliente S.A.', ruc: '20000000003', etapa: 'cliente', medio: 'llamada', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-06' } }),
    ]);
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    fireEvent.click(within(proxima(p)).getByRole('button', { name: /Cuándo/ }));
    const cal = within(screen.getByRole('dialog', { name: 'Elegir la fecha de la próxima acción' }));
    expect(cal.getByRole('button', { name: /martes 3 de noviembre.*1 acción agendada/ })).toBeInTheDocument();
    expect(cal.getByRole('button', { name: /jueves 5 de noviembre/ }).getAttribute('aria-label')).not.toMatch(/agendada/);
    expect(cal.getByRole('button', { name: /viernes 6 de noviembre/ }).getAttribute('aria-label')).not.toMatch(/agendada/);
  });
});

describe('CrmBoard — validación (sin pedir nada al servidor)', () => {
  async function intentar(pasos: (p: HTMLElement) => void = () => undefined, lista: Empresa[] = BASE, nombre = ANDINA) {
    const fn = montar(lista);
    render(<CrmBoard />);
    const p = await abrir(nombre);
    pasos(p);
    guardar(p);
    expect(llamadas(fn, 'POST', /contactos$/)).toHaveLength(0);
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

  it('no next action chosen', async () => {
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
    montar(BASE, () => ({ status: 400, body: { success: false, error: 'No se puede registrar un contacto en una empresa en Perdido.' } }));
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'Hablamos');
    elegirAccion(p, 'Llamar');
    guardar(p);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se puede registrar un contacto en una empresa en Perdido.'));
    expect(panel()).toBeInTheDocument();
    expect(within(p).getByLabelText('Resumen de la conversación')).toHaveValue('Hablamos');
    expect(within(p).getByRole('button', { name: 'Guardar contacto' })).toBeEnabled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(within(columna('Por contactar')).getByText(ANDINA)).toBeInTheDocument();
  });

  it('a network failure shows a generic error and keeps the panel', async () => {
    const base = montar();
    global.fetch = vi.fn(async (u: string, i?: RequestInit) => {
      if (/contactos$/.test(u)) throw new Error('offline');
      return base(u, i);
    }) as unknown as typeof fetch;
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    escribir(within(p).getByLabelText('Resumen de la conversación'), 'x');
    elegirAccion(p, 'Llamar');
    guardar(p);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('No se pudo guardar el contacto'));
    expect(panel()).toBeInTheDocument();
  });

  it('Cancelar and Escape close the panel and give the focus back to the button that opened it', async () => {
    montar();
    render(<CrmBoard />);
    const p = await abrir(ANDINA);
    const boton = within(card(ANDINA)).getByRole('button', { name: 'Registrar contacto' });
    fireEvent.click(within(p).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Registrar contacto' })).toBeNull();
    expect(boton).toHaveFocus();
    await abrir(ANDINA);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: 'Registrar contacto' })).toBeNull();
    expect(boton).toHaveFocus();
  });
});

describe('CrmBoard — lo anterior sigue funcionando', () => {
  it('"Nueva empresa" still creates an empresa and a card still moves between columns', async () => {
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
    await waitFor(() => expect(within(columna('Por contactar')).getByText('Ferretería Norte S.A.C.')).toBeInTheDocument());
    expect(llamadas(fn, 'POST', '/api/crm/empresas')).toHaveLength(1);

    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', effectAllowed: '' };
    fireEvent.dragStart(card(VALLE), { dataTransfer });
    fireEvent.dragOver(columna('En seguimiento'), { dataTransfer });
    fireEvent.drop(columna('En seguimiento'), { dataTransfer });
    await waitFor(() => expect(within(columna('En seguimiento')).getByText(VALLE)).toBeInTheDocument());
    expect(llamadas(fn, 'PATCH', '/api/crm/empresas/e-4/etapa')[0]!.body).toEqual({ etapa: 'en_seguimiento' });
  });
});
