import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HiloConversacion } from '../HiloConversacion';
import type { ConversacionListada, MensajeCrm } from '../../../../domain/entities';
import { TEXTO_CONFIRMACION_CIERRE } from '../../../../domain/textosCierreAgente';

/**
 * Render contract for the IA additions of HiloConversacion (E2·T6):
 * OUT+IA messages render distinctly — indigo tint + '🤖 La Guía'
 * label, score chip ('confianza 0.80', toFixed(2)), 'Fuentes (N)'
 * popover listing each titulo (defensive JSON parse: garbage hides
 * the affordance, never crashes), and a PENDIENTE estadoEnvio shows
 * 'enviando…' instead of the time line. OUT+HUMANO keeps the teal
 * bubble. The hilo body crosses esHiloConversacion → the PENDIENTE
 * acceptance of esMensajeCrm is a precondition of these renders.
 */

const FUENTES_JSON = JSON.stringify([
  { id: 1, tipo: 'KB', titulo: 'Horarios de atención' },
  { id: 2, tipo: 'KB', titulo: 'Formas de pago' },
]);

const fila: ConversacionListada = {
  id: 7,
  empresaId: 1,
  contactoId: 11,
  canal: 'WHATSAPP',
  telefono: '+595981234567',
  identificadorCanal: null,
  estado: 'TOMADA_HUMANO',
  asignadaA: 'jperez',
  modo: 'HUMANO',
  ultimoMensajeEn: '2026-10-11T14:02:00.000Z',
  noLeidos: 0,
  creadoEn: '2026-10-11T10:00:00.000Z',
  actualizadoEn: '2026-10-11T14:02:00.000Z',
  razonSocial: 'Comercio Central',
  nombreContacto: 'Luis Medina',
};

function mensaje(overrides: Partial<MensajeCrm>): MensajeCrm {
  return {
    id: 1,
    conversacionId: 7,
    direccion: 'IN',
    emisor: 'CLIENTE',
    cuerpo: 'Hola, quiero info',
    tipo: 'TEXTO',
    canal: 'WHATSAPP',
    wamid: null,
    idempotenciaKey: null,
    estadoEnvio: null,
    fuentes: null,
    score: null,
    modelo: null,
    creadoEn: '2026-10-11T10:00:00Z',
    ...overrides,
  };
}

function okHilo(mensajes: MensajeCrm[]): Response {
  const conversacion = {
    id: fila.id,
    empresaId: fila.empresaId,
    contactoId: fila.contactoId,
    canal: fila.canal,
    telefono: fila.telefono,
    identificadorCanal: fila.identificadorCanal,
    estado: fila.estado,
    asignadaA: fila.asignadaA,
    modo: fila.modo,
    ultimoMensajeEn: fila.ultimoMensajeEn,
    noLeidos: fila.noLeidos,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
  return new Response(JSON.stringify({ success: true, conversacion, mensajes }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function montar(mensajes: MensajeCrm[]): void {
  fetchMock.mockResolvedValue(okHilo(mensajes));
  render(
    <HiloConversacion fila={fila} onVolver={() => {}} onCambio={() => {}} />,
  );
}

const user = userEvent.setup();

describe('HiloConversacion burbuja IA (E2·T6)', () => {
  it('renderiza etiqueta 🤖 La Guía + chip de confianza + fuentes titulos', async () => {
    montar([
      mensaje({
        id: 2,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'Te confirmo el turno para el viernes a las 9:00',
        estadoEnvio: 'ENVIADO',
        score: 0.8,
        modelo: 'gpt-probe',
        fuentes: FUENTES_JSON,
        creadoEn: '2026-10-11T10:05:00Z',
      }),
    ]);

    await waitFor(() => expect(screen.getByLabelText('Mensajes')).toBeInTheDocument());
    expect(await screen.findByText('🤖 La Guía')).toBeInTheDocument();
    expect(screen.getByText('confianza 0.80')).toBeInTheDocument();
    // El popover: cerrado muestra el resumen, al abrirlo lista los titulos.
    const resumen = screen.getByText('Fuentes (2)');
    await user.click(resumen);
    expect(screen.getByText('Horarios de atención')).toBeInTheDocument();
    expect(screen.getByText('Formas de pago')).toBeInTheDocument();
  });

  it('score null no renderiza el chip; fuentes garbage esconde el affordance sin crashear', async () => {
    montar([
      mensaje({
        id: 2,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'Respuesta sin score ni fuentes válidas',
        estadoEnvio: 'ENVIADO',
        score: null,
        fuentes: '{no json',
      }),
    ]);

    await waitFor(() =>
      expect(screen.getByText('Respuesta sin score ni fuentes válidas')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/confianza/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fuentes \(/)).not.toBeInTheDocument();
  });

  it('PENDIENTE muestra «enviando…» en vez de la línea de hora', async () => {
    montar([
      mensaje({
        id: 2,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'Respuesta en vuelo',
        estadoEnvio: 'PENDIENTE',
        wamid: null,
      }),
    ]);

    await waitFor(() => expect(screen.getByText('Respuesta en vuelo')).toBeInTheDocument());
    expect(screen.getByText('enviando…')).toBeInTheDocument();
  });

  it('FALLIDO mantiene el marcado de envío fallido; ENVIADO muestra la hora', async () => {
    montar([
      mensaje({
        id: 2,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo: 'Reintento fallido',
        estadoEnvio: 'FALLIDO',
      }),
      mensaje({
        id: 3,
        direccion: 'OUT',
        emisor: 'HUMANO',
        cuerpo: 'Buenas, en qué te ayudo',
        estadoEnvio: 'ENVIADO',
        creadoEn: '2026-10-11T10:09:00Z',
      }),
    ]);

    await waitFor(() => expect(screen.getByText('Reintento fallido')).toBeInTheDocument());
    expect(screen.getByText(/envío fallido/)).toBeInTheDocument();
    // OUT+HUMANO sin cambios: etiqueta Operador (sin glifo IA), y la
    // burbuja IA fallida SÍ lleva su etiqueta — coexisten sin conflicto.
    expect(screen.getByText('Operador')).toBeInTheDocument();
    expect(screen.getByText('🤖 La Guía')).toBeInTheDocument();
  });
});

describe('HiloConversacion patrón de ayuda (E3·T5)', () => {
  const SOLICITUD_AYUDA = {
    id: 9,
    conversacionId: fila.id,
    mensajeId: 1,
    consulta: '¿facturan con crédito fiscal a 30 días?',
    terminosBuscados: ['crédito', 'facturación'],
    score: 0.29,
    estado: 'PENDIENTE',
    indicacion: null,
    resueltaPor: null,
    creadoEn: '2026-10-11T14:03:00.000Z',
    resueltaEn: null,
  };

  const FICHA_BODY = {
    success: true,
    conversacionId: fila.id,
    contacto: { id: 11, nombre: 'Luis Medina', telefono: '+595981234567', cargo: null },
    empresa: { id: 1, razonSocial: 'Comercio Central', cantidadTrabajadores: null },
    datos: {
      cargo: { valor: 'Gerente', origen: 'IA', confirmado: false },
      trabajadores: { valor: null, origen: 'IA', confirmado: false },
      sedes: { valor: null, origen: 'IA', confirmado: false },
    },
  };

  const MEMORIAS_BODY = {
    success: true,
    empresaId: 1,
    memorias: [
      {
        id: 101,
        nivel: 'empresa',
        tipo: 'acuerdo',
        titulo: 'Cronograma',
        contenido: 'Pidió propuesta formal',
        pineada: true,
        creadoEn: '2026-06-10T10:00:00.000Z',
      },
    ],
  };

  const AJUSTES_BODY = {
    success: true,
    estado: fila.estado,
    modo: fila.modo,
    asignadaA: fila.asignadaA,
    memoriaActiva: true,
    config: { umbralConfianza: 0.6, maxIntercambios: 6, horarioDesde: 8, horarioHasta: 18 },
  };

  interface Escena {
    estado: string;
    solicitud: unknown;
  }

  /** Router fetch: hilo + laterales + POSTs de acción. */
  function montarEscena(escena: Escena): { posts: Array<{ clave: string; cuerpo: unknown }> } {
    const posts: Array<{ clave: string; cuerpo: unknown }> = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const clave = `${init?.method ?? 'GET'} ${url.replace('http://localhost', '')}`;
      const rutas: Record<string, unknown> = {
        [`GET /api/crm/conversaciones/${fila.id}`]: () =>
          okHiloCuerpo(escena.estado, escena.solicitud),
        [`GET /api/crm/conversaciones/${fila.id}/ficha`]: FICHA_BODY,
        [`GET /api/crm/conversaciones/${fila.id}/memorias`]: MEMORIAS_BODY,
        [`GET /api/crm/conversaciones/${fila.id}/ajustes`]: AJUSTES_BODY,
      };
      if (init?.method === 'POST') {
        posts.push({ clave, cuerpo: JSON.parse(String(init.body ?? '{}')) });
        return new Response(JSON.stringify({ success: true, ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      const ruta = rutas[clave];
      const json = typeof ruta === 'function' ? (ruta as () => unknown)() : ruta;
      return new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    render(<HiloConversacion fila={fila} onVolver={() => {}} onCambio={() => {}} />);
    return { posts };
  }

  function okHiloCuerpo(estado: string, solicitud: unknown): unknown {
    const conversacion = {
      id: fila.id,
      empresaId: fila.empresaId,
      contactoId: fila.contactoId,
      canal: fila.canal,
      telefono: fila.telefono,
      identificadorCanal: fila.identificadorCanal,
      estado,
      asignadaA: estado === 'TOMADA_HUMANO' ? 'jperez' : null,
      modo: estado === 'TOMADA_HUMANO' ? 'HUMANO' : 'IA',
      ultimoMensajeEn: fila.ultimoMensajeEn,
      noLeidos: fila.noLeidos,
      creadoEn: fila.creadoEn,
      actualizadoEn: fila.actualizadoEn,
    };
    return { success: true, conversacion, mensajes: [], solicitudAyuda: solicitud };
  }

  it('la tarjeta de ayuda SOLO aparece con solicitudAyuda pendiente', async () => {
    montarEscena({ estado: 'REQUIERE_HUMANO', solicitud: SOLICITUD_AYUDA });
    expect(await screen.findByText('🤖 La Guía pregunta: ¿cómo sigo?')).toBeInTheDocument();
    expect(screen.getByText('score 0.29')).toBeInTheDocument();
  });

  it('sin solicitudAyuda no hay tarjeta (aunque el estado sea REQUIERE_HUMANO)', async () => {
    montarEscena({ estado: 'REQUIERE_HUMANO', solicitud: null });
    await waitFor(() => expect(screen.getByLabelText('Mensajes')).toBeInTheDocument());
    expect(screen.queryByText('🤖 La Guía pregunta: ¿cómo sigo?')).not.toBeInTheDocument();
  });

  it('encabezado REQUIERE_HUMANO → chip «⚠ NECESITA TU AYUDA»', async () => {
    montarEscena({ estado: 'REQUIERE_HUMANO', solicitud: SOLICITUD_AYUDA });
    expect(await screen.findByText('⚠ NECESITA TU AYUDA')).toBeInTheDocument();
  });

  it('ACTIVA_IA → «↩ Tomar la conversación» (sin devolver/escalar)', async () => {
    const activa = montarEscena({ estado: 'ACTIVA_IA', solicitud: null });
    expect(await screen.findByRole('button', { name: '↩ Tomar la conversación' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Devolver a la Guía' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Escalar a…' })).not.toBeInTheDocument();
    expect(activa.posts).toEqual([]);
  });

  it('TOMADA_HUMANO → «Devolver a la Guía» + «Escalar a…» (sin tomar)', async () => {
    const tomada = montarEscena({ estado: 'TOMADA_HUMANO', solicitud: null });
    expect(await screen.findByRole('button', { name: 'Devolver a la Guía' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Escalar a…' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '↩ Tomar la conversación' })).not.toBeInTheDocument();
    expect(tomada.posts).toEqual([]);
  });

  it('el borrador del composer SOBREVIVE a: tarjeta, indicación enviada y cambio de estado', async () => {
    // Escenario: REQUIERE_HUMANO con solicitud → se escribe en el
    // composer Y en la tarjeta → se envía la indicación (éxito) → la
    // tarjeta se limpia y muestra el ✓, el composer INTACTO.
    let solicitud: unknown = SOLICITUD_AYUDA;
    let estadoActual = 'REQUIERE_HUMANO';
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const clave = `${init?.method ?? 'GET'} ${url.replace('http://localhost', '')}`;
      if (clave === `POST /api/crm/conversaciones/${fila.id}/indicacion`) {
        solicitud = null; // el refetch ya no la ve
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (clave === `POST /api/crm/conversaciones/${fila.id}/tomar`) {
        estadoActual = 'TOMADA_HUMANO';
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      const rutas: Record<string, unknown> = {
        [`GET /api/crm/conversaciones/${fila.id}`]: () => okHiloCuerpo(estadoActual, solicitud),
        [`GET /api/crm/conversaciones/${fila.id}/ficha`]: FICHA_BODY,
        [`GET /api/crm/conversaciones/${fila.id}/memorias`]: MEMORIAS_BODY,
        [`GET /api/crm/conversaciones/${fila.id}/ajustes`]: AJUSTES_BODY,
      };
      const ruta = rutas[clave];
      const json = typeof ruta === 'function' ? (ruta as () => unknown)() : ruta;
      return new Response(JSON.stringify(json), { status: 200 });
    });
    render(<HiloConversacion fila={fila} onVolver={() => {}} onCambio={() => {}} />);

    const composer = await screen.findByLabelText('Mensaje a enviar');
    await user.type(composer, 'mi borrador sobrevive');
    const tarjeta = await screen.findByPlaceholderText('Tu indicación para la Guía…');
    await user.type(tarjeta, 'Decile que sí');
    await user.click(screen.getByRole('button', { name: 'Enviar indicación' }));

    // Éxito: ✓ visible, input de la tarjeta desmontado (limpio), composer INTACTO.
    expect(await screen.findByText('✓ Indicación guardada — la Guía continúa con el cliente')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Tu indicación para la Guía…')).not.toBeInTheDocument();
    expect(composer).toHaveValue('mi borrador sobrevive');

    // Refetch con cambio de estado (tomar): el borrador sigue.
    solicitud = null;
    await user.click(screen.getByRole('button', { name: '↩ Tomar la conversación' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Devolver a la Guía' })).toBeEnabled(),
    );
    expect(composer).toHaveValue('mi borrador sobrevive');
  });

  it('la columna derecha renderiza ficha, memorias y ajustes', async () => {
    montarEscena({ estado: 'TOMADA_HUMANO', solicitud: null });

    expect(await screen.findByText('📇 Datos del contacto')).toBeInTheDocument();
    expect(await screen.findByText('🧠 Memorias de la gente')).toBeInTheDocument();
    expect(await screen.findByText('🤖 Agente en esta conversación')).toBeInTheDocument();
    expect(screen.getByText('umbral .60')).toBeInTheDocument();
    expect(screen.getByText('📌 acuerdo')).toBeInTheDocument();
    expect(screen.getAllByText('— por detectar —').length).toBeGreaterThan(0);
  });
});

describe('HiloConversacion calidad medible (E4·T5)', () => {
  const MENSAJE_IA: MensajeCrm = {
    id: 2,
    conversacionId: fila.id,
    direccion: 'OUT',
    emisor: 'IA',
    cuerpo: 'Te confirmo los horarios',
    tipo: 'TEXTO',
    canal: 'WHATSAPP',
    wamid: 'wamid.2',
    idempotenciaKey: null,
    estadoEnvio: 'ENVIADO',
    fuentes: FUENTES_JSON,
    score: 0.8,
    modelo: 'glm',
    creadoEn: '2026-10-11T10:05:00Z',
  };

  /** Router fetch: hilo (con mensajes) + laterales; POSTs grabados. */
  function montarConMensajes(
    mensajes: MensajeCrm[],
    estado: string = 'TOMADA_HUMANO',
    respuestaDeficiente: unknown = { success: true, huecoId: 61, mensajeId: 2 },
  ): { posts: Array<{ clave: string; cuerpo: unknown }>; setMensajes: (nuevos: MensajeCrm[]) => void } {
    const posts: Array<{ clave: string; cuerpo: unknown }> = [];
    let mensajesActuales = mensajes;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const clave = `${init?.method ?? 'GET'} ${url.replace('http://localhost', '')}`;
      if (init?.method === 'POST') {
        posts.push({ clave, cuerpo: JSON.parse(String(init.body ?? '{}')) });
        return new Response(JSON.stringify(respuestaDeficiente), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      const conversacion = {
        id: fila.id,
        empresaId: fila.empresaId,
        contactoId: fila.contactoId,
        canal: fila.canal,
        telefono: fila.telefono,
        identificadorCanal: fila.identificadorCanal,
        estado,
        asignadaA: fila.asignadaA,
        modo: fila.modo,
        ultimoMensajeEn: fila.ultimoMensajeEn,
        noLeidos: fila.noLeidos,
        creadoEn: fila.creadoEn,
        actualizadoEn: fila.actualizadoEn,
      };
      if (clave === `GET /api/crm/conversaciones/${fila.id}`) {
        return new Response(
          JSON.stringify({ success: true, conversacion, mensajes: mensajesActuales }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    render(<HiloConversacion fila={fila} onVolver={() => {}} onCambio={() => {}} />);
    return { posts, setMensajes: (nuevos: MensajeCrm[]) => { mensajesActuales = nuevos; } };
  }

  it('burbuja IA con fidelidad → línea «Fidelidad: 0.90» dentro del detalle de fuentes', async () => {
    montarConMensajes([mensaje({ ...MENSAJE_IA, fidelidad: 0.9 })]);

    expect(await screen.findByText('Te confirmo los horarios')).toBeInTheDocument();
    const resumen = screen.getByText('Fuentes (2)');
    await user.click(resumen);
    expect(screen.getByText('Horarios de atención')).toBeInTheDocument();
    expect(screen.getByText('Fidelidad: 0.90')).toBeInTheDocument();
  });

  it('burbuja IA sin fidelidad (fila pre-E4) → sin línea de fidelidad, sin crash', async () => {
    montarConMensajes([mensaje(MENSAJE_IA)]);

    expect(await screen.findByText('Te confirmo los horarios')).toBeInTheDocument();
    const resumen = screen.getByText('Fuentes (2)');
    await user.click(resumen);
    expect(screen.queryByText(/Fidelidad:/)).not.toBeInTheDocument();
  });

  it('respuesta IA sin marcar → botón «⚠ Marcar deficiente»; al éxito refetcha y muestra «⚠ marcada deficiente»', async () => {
    const escena = montarConMensajes([mensaje(MENSAJE_IA)]);

    const boton = await screen.findByRole('button', { name: '⚠ Marcar deficiente' });
    escena.setMensajes([mensaje({ ...MENSAJE_IA, deficiente: true })]);
    await user.click(boton);

    expect(escena.posts).toEqual([
      { clave: `POST /api/crm/conversaciones/${fila.id}/deficiente`, cuerpo: { mensajeId: 2 } },
    ]);
    await waitFor(() =>
      expect(screen.getByText('⚠ marcada deficiente')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: '⚠ Marcar deficiente' })).not.toBeInTheDocument();
  });

  it('respuesta YA marcada → chip «⚠ marcada deficiente» y SIN botón', async () => {
    montarConMensajes([mensaje({ ...MENSAJE_IA, deficiente: true })]);

    expect(await screen.findByText('⚠ marcada deficiente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '⚠ Marcar deficiente' })).not.toBeInTheDocument();
  });

  it('el botón solo existe en mensajes OUT+IA (el cliente y el operador no lo llevan)', async () => {
    montarConMensajes([
      mensaje({ id: 1, direccion: 'IN', emisor: 'CLIENTE', cuerpo: 'pregunta' }),
      mensaje({ ...MENSAJE_IA }),
      mensaje({ id: 3, direccion: 'OUT', emisor: 'HUMANO', cuerpo: 'respuesta humana' }),
    ]);

    await waitFor(() => expect(screen.getByText('respuesta humana')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: '⚠ Marcar deficiente' })).toHaveLength(1);
  });

  it('PENDIENTE_VINCULACION → sin botón de marcar (sin composer ni acciones)', async () => {
    montarConMensajes([mensaje(MENSAJE_IA)], 'PENDIENTE_VINCULACION');

    expect(await screen.findByText('Te confirmo los horarios')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '⚠ Marcar deficiente' })).not.toBeInTheDocument();
  });
});

describe('HiloConversacion marca de cierre (E5·T10)', () => {
  const CIERRE = TEXTO_CONFIRMACION_CIERRE.ACEPTACION;
  const MARCA = 'Cierre registrado por La Guía';

  it('burbuja IA con el texto fijo de confirmación muestra la marca', async () => {
    montar([mensaje({ id: 2, direccion: 'OUT', emisor: 'IA', cuerpo: CIERRE, estadoEnvio: 'ENVIADO' })]);

    expect(await screen.findByText(MARCA)).toBeInTheDocument();
  });

  it('burbuja IA con otro texto no la muestra', async () => {
    montar([mensaje({ id: 2, direccion: 'OUT', emisor: 'IA', cuerpo: 'Hola', estadoEnvio: 'ENVIADO' })]);

    await screen.findByText('Hola');
    expect(screen.queryByText(MARCA)).not.toBeInTheDocument();
  });

  it('el mismo texto enviado por CLIENTE u HUMANO no la muestra', async () => {
    montar([
      mensaje({ id: 2, direccion: 'IN', emisor: 'CLIENTE', cuerpo: CIERRE }),
      mensaje({ id: 3, direccion: 'OUT', emisor: 'HUMANO', cuerpo: CIERRE, estadoEnvio: 'ENVIADO' }),
    ]);

    await waitFor(() => expect(screen.getAllByText(CIERRE)).toHaveLength(2));
    expect(screen.queryByText(MARCA)).not.toBeInTheDocument();
  });
});
