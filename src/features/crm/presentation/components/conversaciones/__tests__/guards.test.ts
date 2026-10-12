import { describe, expect, it } from 'vitest';

import {
  esAjustesConversacion,
  esConversacionListada,
  esFichaConversacion,
  esHiloConversacion,
  esListadoMemorias,
  esMensajeCrm,
  esSolicitudAyuda,
  esUsuariosAsignables,
  parsearTitulosFuentes,
  previsualizarUltimoMensaje,
} from '../guards';
import type { ConversacionListada, MensajeCrm } from '../../../../domain/entities';

/**
 * Guard + pure-helper contract for the E2·T6 bandeja additions:
 * - esMensajeCrm accepts estadoEnvio 'PENDIENTE' (E2 outbox IA rows
 *   are visible in the hilo while the WhatsApp send is in flight),
 *   keeping null/ENVIADO/FALLIDO;
 * - esConversacionListada accepts the optional last-message preview
 *   fields (string|null cuerpo, emisor in the closed union) and stays
 *   backward-compatible with pre-E2 rows that omit them;
 * - parsearTitulosFuentes: defensive JSON parse (garbage → [], only
 *   string titulos survive);
 * - previsualizarUltimoMensaje: emisor glyph + ~60-char truncation.
 */

function fila(overrides: Partial<ConversacionListada> = {}): ConversacionListada {
  return {
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
    ...overrides,
  };
}

function mensaje(overrides: Partial<MensajeCrm> = {}): MensajeCrm {
  return {
    id: 3,
    conversacionId: 7,
    direccion: 'OUT',
    emisor: 'IA',
    cuerpo: 'Te confirmo el turno',
    tipo: 'TEXTO',
    canal: 'WHATSAPP',
    wamid: 'wamid.3',
    idempotenciaKey: null,
    estadoEnvio: 'ENVIADO',
    fuentes: null,
    score: null,
    modelo: null,
    creadoEn: '2026-10-11T10:05:00Z',
    ...overrides,
  };
}

// ---- esMensajeCrm: PENDIENTE visible mientras vuela (E2·T6) ----

describe('esMensajeCrm estadoEnvio', () => {
  it('accepts PENDIENTE (E2 outbox IA rows render while in flight)', () => {
    expect(esMensajeCrm(mensaje({ estadoEnvio: 'PENDIENTE', wamid: null }))).toBe(true);
  });

  it('keeps accepting null, ENVIADO and FALLIDO', () => {
    expect(esMensajeCrm(mensaje({ estadoEnvio: null }))).toBe(true);
    expect(esMensajeCrm(mensaje({ estadoEnvio: 'ENVIADO' }))).toBe(true);
    expect(esMensajeCrm(mensaje({ estadoEnvio: 'FALLIDO' }))).toBe(true);
  });

  it('still rejects garbage estadoEnvio values', () => {
    expect(esMensajeCrm(mensaje({ estadoEnvio: 'CUALQUIERA' as never }))).toBe(false);
  });
});

// ---- esConversacionListada: campos de preview (aditivos) ----

describe('esConversacionListada preview', () => {
  it('accepts a row with the preview fields (incl. null sin mensajes)', () => {
    expect(
      esConversacionListada(fila({ ultimoMensajeCuerpo: 'Hola, quiero info', ultimoMensajeEmisor: 'CLIENTE' })),
    ).toBe(true);
    expect(
      esConversacionListada(fila({ ultimoMensajeCuerpo: 'Te confirmo el turno', ultimoMensajeEmisor: 'IA' })),
    ).toBe(true);
    expect(esConversacionListada(fila({ ultimoMensajeCuerpo: null, ultimoMensajeEmisor: null }))).toBe(true);
  });

  it('stays backward-compatible with pre-E2 rows that omit the fields', () => {
    const sinPreview: Record<string, unknown> = { ...fila() };
    delete sinPreview.ultimoMensajeCuerpo;
    delete sinPreview.ultimoMensajeEmisor;
    expect(esConversacionListada(sinPreview)).toBe(true);
  });

  it('rejects wrong-typed preview fields', () => {
    expect(esConversacionListada(fila({ ultimoMensajeCuerpo: 5 as never }))).toBe(false);
    expect(esConversacionListada(fila({ ultimoMensajeEmisor: 'ROBOT' as never }))).toBe(false);
  });
});

// ---- parsearTitulosFuentes (JSON defensivo) ----

describe('parsearTitulosFuentes', () => {
  it('returns the string titulos of a valid fuentes array', () => {
    const fuentes = JSON.stringify([
      { id: 1, tipo: 'KB', titulo: 'Horarios de atención' },
      { id: 2, tipo: 'KB', titulo: 'Formas de pago' },
    ]);
    expect(parsearTitulosFuentes(fuentes)).toEqual(['Horarios de atención', 'Formas de pago']);
  });

  it('garbage JSON → [] (la burbuja esconde el affordance, nunca crashea)', () => {
    expect(parsearTitulosFuentes('{no json')).toEqual([]);
    expect(parsearTitulosFuentes('')).toEqual([]);
    expect(parsearTitulosFuentes(null)).toEqual([]);
  });

  it('non-array JSON or entries without a string titulo → []', () => {
    expect(parsearTitulosFuentes('{"a":1}')).toEqual([]);
    expect(parsearTitulosFuentes(JSON.stringify([{ id: 1, tipo: 'KB' }]))).toEqual([]);
    expect(parsearTitulosFuentes(JSON.stringify([{ id: 1, titulo: 5 }]))).toEqual([]);
  });
});

// ---- previsualizarUltimoMensaje (glifo + truncado ~60) ----

describe('previsualizarUltimoMensaje', () => {
  it('prefixes the IA glyph for IA, operador glyph for HUMANO, nothing for CLIENTE', () => {
    expect(previsualizarUltimoMensaje('Te confirmo el turno', 'IA')).toBe('🤖 Te confirmo el turno');
    expect(previsualizarUltimoMensaje('Lo reviso y te aviso', 'HUMANO')).toBe('👤 Lo reviso y te aviso');
    expect(previsualizarUltimoMensaje('Hola, quiero info', 'CLIENTE')).toBe('Hola, quiero info');
  });

  it('truncates at ~60 chars with ellipsis (glyph excluded from the cut)', () => {
    const largo = 'a'.repeat(70);
    const previa = previsualizarUltimoMensaje(largo, 'IA');
    expect(previa).toBe(`🤖 ${'a'.repeat(59)}…`);
    expect(previa?.length).toBeLessThanOrEqual(64);
  });

  it('collapses newlines to single spaces; null/blank cuerpo → null', () => {
    expect(previsualizarUltimoMensaje('linea 1\nlinea 2', 'IA')).toBe('🤖 linea 1 linea 2');
    expect(previsualizarUltimoMensaje(null, 'IA')).toBeNull();
    expect(previsualizarUltimoMensaje('   ', 'IA')).toBeNull();
    expect(previsualizarUltimoMensaje('texto', null)).toBe('texto');
  });
});

describe('guards E3·T5 — solicitudAyuda, ficha, memorias, ajustes, usuarios', () => {
  const SOLICITUD = {
    id: 9,
    conversacionId: 7,
    mensajeId: 55,
    consulta: '¿facturan con crédito fiscal a 30 días?',
    terminosBuscados: ['crédito', 'facturación'],
    score: 0.29,
    estado: 'PENDIENTE',
    indicacion: null,
    resueltaPor: null,
    creadoEn: '2026-10-11T14:03:00.000Z',
    resueltaEn: null,
  };

  it('esSolicitudAyuda: acepta la fila pendiente y rechaza formas rotas', () => {
    expect(esSolicitudAyuda(SOLICITUD)).toBe(true);
    // score/terminos nulos-vacíos son válidos; mensajeId null también.
    expect(esSolicitudAyuda({ ...SOLICITUD, score: null, mensajeId: null, terminosBuscados: [] })).toBe(true);
    expect(esSolicitudAyuda({ ...SOLICITUD, terminosBuscados: 'crédito' })).toBe(false);
    expect(esSolicitudAyuda({ ...SOLICITUD, estado: 'OTRO' })).toBe(false);
    expect(esSolicitudAyuda(null)).toBe(false);
  });

  it('esHiloConversacion acepta solicitudAyuda opcional (ausente/null/objeto) y la rechaza rota', () => {
    const base = {
      success: true,
      conversacion: fila(),
      mensajes: [mensaje()],
    };
    expect(esHiloConversacion(base)).toBe(true);
    expect(esHiloConversacion({ ...base, solicitudAyuda: null })).toBe(true);
    expect(esHiloConversacion({ ...base, solicitudAyuda: SOLICITUD })).toBe(true);
    expect(esHiloConversacion({ ...base, solicitudAyuda: { id: 'x' } })).toBe(false);
  });

  it('esFichaConversacion: acepta el cuerpo GET/POST ficha y rechaza datos incompletos', () => {
    const ficha = {
      success: true,
      conversacionId: 7,
      contacto: { id: 11, nombre: 'Luis Medina', telefono: '+595981234567', cargo: null },
      empresa: { id: 1, razonSocial: 'Comercio Central', cantidadTrabajadores: null },
      datos: {
        cargo: { valor: 'Gerente', origen: 'IA', confirmado: false },
        trabajadores: { valor: null, origen: 'IA', confirmado: false },
        sedes: { valor: 'Encarnación', origen: 'HUMANO', confirmado: true },
      },
    };
    expect(esFichaConversacion(ficha)).toBe(true);
    expect(esFichaConversacion({ ...ficha, contacto: null, empresa: null })).toBe(true);
    expect(esFichaConversacion({ ...ficha, datos: { cargo: ficha.datos.cargo } })).toBe(false);
    expect(
      esFichaConversacion({
        ...ficha,
        datos: { ...ficha.datos, sedes: { valor: 'x', origen: 'otro', confirmado: false } },
      }),
    ).toBe(false);
  });

  it('esListadoMemorias: acepta {memorias, empresaId} y rechaza filas rotas', () => {
    const cuerpo = {
      success: true,
      empresaId: 7,
      memorias: [
        {
          id: 101,
          nivel: 'chat',
          tipo: 'indicacion_humana',
          titulo: 'Indicación humana',
          contenido: 'Responder por la tarde',
          pineada: true,
          creadoEn: '2026-06-10T10:00:00.000Z',
        },
      ],
    };
    expect(esListadoMemorias(cuerpo)).toBe(true);
    expect(esListadoMemorias({ ...cuerpo, empresaId: null, memorias: [] })).toBe(true);
    expect(esListadoMemorias({ ...cuerpo, memorias: [{ ...cuerpo.memorias[0]!, pineada: 'si' }] })).toBe(false);
  });

  it('esAjustesConversacion: acepta el cuerpo ajustes y rechaza config incompleta', () => {
    const ajustes = {
      success: true,
      estado: 'REQUIERE_HUMANO',
      modo: 'IA',
      asignadaA: null,
      memoriaActiva: true,
      config: { umbralConfianza: 0.6, maxIntercambios: 8, horarioDesde: 8, horarioHasta: 18 },
    };
    expect(esAjustesConversacion(ajustes)).toBe(true);
    expect(esAjustesConversacion({ ...ajustes, asignadaA: 'juana' })).toBe(true);
    expect(esAjustesConversacion({ ...ajustes, config: { umbralConfianza: 0.6 } })).toBe(false);
    expect(esAjustesConversacion({ ...ajustes, modo: 'otro' })).toBe(false);
  });

  it('esUsuariosAsignables: acepta {usuarios:[{id,nombre}]} y rechaza extraños', () => {
    expect(esUsuariosAsignables({ success: true, usuarios: [{ id: 'juana', nombre: 'Juana P' }] })).toBe(true);
    expect(esUsuariosAsignables({ success: true, usuarios: [] })).toBe(true);
    expect(esUsuariosAsignables({ success: true, usuarios: [{ id: 1, nombre: 'X' }] })).toBe(false);
    expect(esUsuariosAsignables({ usuarios: [] })).toBe(false);
  });
});

// ---- E4·T5: fidelidad + deficiente en el mensaje (tolerantes opcionales) ----

describe('esMensajeCrm fidelidad/deficiente (E4·T5)', () => {
  it('acepta fidelidad number|null|undefined y deficiente boolean|undefined', () => {
    expect(esMensajeCrm(mensaje({ fidelidad: 0.9, deficiente: true }))).toBe(true);
    expect(esMensajeCrm(mensaje({ fidelidad: null }))).toBe(true);
    expect(esMensajeCrm(mensaje({ deficiente: false }))).toBe(true);
    // Filas pre-E4 sin las propiedades: siguen válidas (tolerancia).
    expect(esMensajeCrm(mensaje({}))).toBe(true);
  });

  it('rechaza tipos extraños (fidelidad string, deficiente string)', () => {
    expect(esMensajeCrm(mensaje({ fidelidad: 'alta' as never }))).toBe(false);
    expect(esMensajeCrm(mensaje({ deficiente: 'si' as never }))).toBe(false);
  });
});
