import { describe, expect, it } from 'vitest';

import type { ObservacionMemoria } from '../../domain/entities';
import { rankearMemorias } from '../rankearMemorias';

/**
 * Contrato del rankeador híbrido de memorias (agente-ia-crm E4·T3):
 * función PURA que puntúa la combinación pineados + hallazgos con
 * señales transparentes y deterministas:
 * - léxico (normalizador de la KB reutilizado): aciertos
 *   (título×2 + contenido×1) / términos de la consulta → 0..3, con
 *   peso 2.0;
 * - frescura exp(-antigüedadDías/30), con 0.5 NEUTRAL cuando el
 *   creadoEn no sirve (los pineados cruzan con id 0 y fecha epoch);
 * - +0.5 por nivel chat (memoria de ESTA conversación);
 * - +2.0 por pineado.
 * La dedup (título normalizado igual + contención de contenido con el
 * corto > 40 caracteres) corre sobre la lista COMBINADA ANTES del
 * presupuesto; los pineados siempre sobreviven su propio bloque; el
 * resto se reparte por nivel (empresa/chat); no muta las entradas y
 * `ahora` se inyecta (sin Date.now).
 */

const AHORA = new Date(2026, 5, 15, 10, 30, 0);
const DIA_MS = 24 * 60 * 60 * 1000;

const CONSULTA = '¿Qué incluye el examen ocupacional?';

const PRESUPUESTOS = { pineados: 3, empresa: 3, chat: 5 };

function observacion(sobres: Partial<ObservacionMemoria> = {}): ObservacionMemoria {
  return {
    id: 1,
    nivel: 'empresa',
    tipo: 'hecho_cliente',
    titulo: 'Observación',
    contenido: 'Contenido de la observación.',
    creadoEn: new Date(AHORA.getTime() - 30 * DIA_MS),
    ...sobres,
  };
}

function ids(resultado: ObservacionMemoria[]): number[] {
  return resultado.map((observacion) => observacion.id);
}

describe('rankearMemorias — scoring (E4·T3)', () => {
  it('el léxico domina: la observación con términos de la consulta supera a la fresca pero irrelevante', () => {
    const relevante = observacion({
      id: 1,
      titulo: 'Examen ocupacional',
      contenido: 'El examen ocupacional incluye examen médico y audiometría.',
    });
    const frescaIrrelevante = observacion({
      id: 2,
      titulo: 'Preferencia de horarios',
      contenido: 'Prefiere ser contactado a primera hora de la mañana.',
      creadoEn: new Date(AHORA.getTime() - 1 * DIA_MS),
    });
    const resultado = rankearMemorias({
      consulta: CONSULTA,
      pineados: [],
      hallazgos: [frescaIrrelevante, relevante],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    expect(ids(resultado)).toEqual([1, 2]);
  });

  it('la frescura decae: con léxico igual, ayer supera a 6 meses atrás', () => {
    const ayer = observacion({
      id: 1,
      titulo: 'Examen ocupacional vigente',
      contenido: 'Consulta por el examen ocupacional.',
      creadoEn: new Date(AHORA.getTime() - 1 * DIA_MS),
    });
    const haceSeisMeses = observacion({
      id: 2,
      titulo: 'Examen ocupacional solicitado',
      contenido: 'Pregunta por el examen ocupacional.',
      creadoEn: new Date(AHORA.getTime() - 180 * DIA_MS),
    });
    const resultado = rankearMemorias({
      consulta: CONSULTA,
      pineados: [],
      hallazgos: [haceSeisMeses, ayer],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    expect(ids(resultado)).toEqual([1, 2]);
  });

  it('creadoEn inválido o epoch → frescura neutral 0.5: ayer les gana y ellos mantienen el orden dado', () => {
    const invalida = observacion({
      id: 1,
      titulo: 'Preferencia de horarios',
      contenido: 'Prefiere ser contactado de mañana.',
      creadoEn: new Date(Number.NaN),
    });
    const epoch = observacion({
      id: 2,
      titulo: 'Preferencia de contacto',
      contenido: 'Prefiere el contacto por WhatsApp.',
      creadoEn: new Date(0),
    });
    const ayer = observacion({
      id: 3,
      titulo: 'Preferencia de turnos',
      contenido: 'Prefiere turnos por la tarde.',
      creadoEn: new Date(AHORA.getTime() - 1 * DIA_MS),
    });
    const resultado = rankearMemorias({
      consulta: CONSULTA,
      pineados: [],
      hallazgos: [invalida, epoch, ayer],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    expect(ids(resultado)).toEqual([3, 1, 2]);
  });

  it('nivel chat suma +0.5: entre pineados iguales, el de esta conversación va primero', () => {
    const deEstaConversacion = observacion({
      id: 1,
      nivel: 'chat',
      titulo: 'Acuerdo de turno vespertino',
      contenido: 'Acordó turno de tarde para la visita.',
      creadoEn: new Date(0),
    });
    const deEmpresa = observacion({
      id: 2,
      nivel: 'empresa',
      titulo: 'Acuerdo de turno matutino',
      contenido: 'Acordó turno de mañana para la visita.',
      creadoEn: new Date(0),
    });
    const resultado = rankearMemorias({
      consulta: CONSULTA,
      pineados: [deEmpresa, deEstaConversacion],
      hallazgos: [],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    expect(ids(resultado)).toEqual([1, 2]);
  });

  it('los pineados siempre sobreviven: con tope 3 y 4 pineados irrelevantes, quedan los 3 primeros por score pese a hallazgos con léxico alto', () => {
    const pineados = [1, 2, 3, 4].map((id) =>
      observacion({
        id,
        titulo: `Acuerdo genérico número ${id}`,
        contenido: `Contenido del acuerdo genérico número ${id}.`,
        creadoEn: new Date(0),
      }),
    );
    const hallazgoLexicoAlto = observacion({
      id: 10,
      titulo: 'Examen ocupacional',
      contenido: 'El examen ocupacional incluye examen médico y audiometría.',
      creadoEn: new Date(AHORA.getTime() - 1 * DIA_MS),
    });
    const resultado = rankearMemorias({
      consulta: CONSULTA,
      pineados,
      hallazgos: [hallazgoLexicoAlto],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    // Bloque pineado primero (3 de 4, por score), luego el hallazgo.
    expect(ids(resultado)).toEqual([1, 2, 3, 10]);
  });

  it('bloques con presupuesto separado: 3 empresa y 5 chat aunque sobre candidatos', () => {
    const empresa = [1, 2, 3, 4].map((id) =>
      observacion({
        id,
        nivel: 'empresa',
        titulo: `Preferencia de facturación ${id}`,
        contenido: `Preferencia de facturación número ${id}.`,
      }),
    );
    const chat = [11, 12, 13, 14, 15, 16].map((id) =>
      observacion({
        id,
        nivel: 'chat',
        titulo: `Comentario del chat ${id}`,
        contenido: `Comentario del chat número ${id}.`,
      }),
    );
    const resultado = rankearMemorias({
      consulta: CONSULTA,
      pineados: [],
      hallazgos: [...empresa, ...chat],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    // Sin señales diferenciales (mismo score base), el orden es el
    // original dentro de cada bloque; se recorta 3 empresa + 5 chat.
    expect(ids(resultado)).toEqual([1, 2, 3, 11, 12, 13, 14, 15]);
  });
});

describe('rankearMemorias — dedup (E4·T3)', () => {
  it('título normalizado igual (mayúsculas/acentos/espacios) → queda UNA, la de mayor score', () => {
    const tituloRuidoso = observacion({
      id: 1,
      titulo: '  EXAMEN   ocupacional ',
      contenido: 'Consulta general del cliente.',
    });
    const conContenido = observacion({
      id: 2,
      titulo: 'Examen Ocupacional',
      contenido: 'Incluye examen médico y audiometría.',
    });
    const resultado = rankearMemorias({
      consulta: CONSULTA,
      pineados: [],
      hallazgos: [tituloRuidoso, conContenido],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    expect(ids(resultado)).toEqual([2]);
  });

  it('mismo título con contenido idéntico → sobrevive el PINEADO (nunca se lo descarta por uno no pineado)', () => {
    const pineado = observacion({
      id: 1,
      titulo: 'Acuerdo de turnos',
      contenido: 'Acordó turnos de tarde para su personal.',
      creadoEn: new Date(0),
    });
    const hallazgo = observacion({
      id: 2,
      titulo: 'Acuerdo de turnos',
      contenido: 'Acordó turnos de tarde para su personal.',
      creadoEn: new Date(AHORA.getTime() - 1 * DIA_MS),
    });
    const resultado = rankearMemorias({
      consulta: CONSULTA,
      pineados: [pineado],
      hallazgos: [hallazgo],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    expect(ids(resultado)).toEqual([1]);
  });

  it('contención de contenido (corto > 40 caracteres) → duplicado: queda la de mayor score', () => {
    const corta = observacion({
      id: 1,
      titulo: 'Visita de junio',
      contenido: 'Turnos de tarde confirmados para todo el equipo de mantenimiento durante junio',
    });
    const larga = observacion({
      id: 2,
      titulo: 'Examen ocupacional',
      contenido:
        'Turnos de tarde confirmados para todo el equipo de mantenimiento durante junio, con ingreso por portería sur.',
    });
    const resultado = rankearMemorias({
      consulta: CONSULTA,
      pineados: [],
      hallazgos: [corta, larga],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    expect(ids(resultado)).toEqual([2]);
  });

  it('contención NO aplica con contenido corto (≤ 40 caracteres): ambas sobreviven', () => {
    const corta = observacion({
      id: 1,
      titulo: 'Turnos de tarde',
      contenido: 'Turnos de tarde confirmados.',
    });
    const larga = observacion({
      id: 2,
      titulo: 'Turnos de tarde con acceso',
      contenido:
        'Turnos de tarde confirmados para todo el equipo de mantenimiento durante junio en la planta.',
    });
    const resultado = rankearMemorias({
      consulta: CONSULTA,
      pineados: [],
      hallazgos: [corta, larga],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    expect(ids(resultado)).toEqual([1, 2]);
  });
});

describe('rankearMemorias — invariantes (E4·T3)', () => {
  it('no muta las entradas', () => {
    const pineados = [
      observacion({ id: 1, titulo: 'Acuerdo de turnos', contenido: 'Acordó turnos de tarde.', creadoEn: new Date(0) }),
    ];
    const hallazgos = [
      observacion({ id: 2, titulo: 'Examen ocupacional', contenido: 'Incluye examen médico.' }),
      observacion({ id: 3, titulo: 'Preferencia de horarios', contenido: 'Prefiere la mañana.' }),
    ];
    const antes = JSON.stringify({ pineados, hallazgos });
    rankearMemorias({ consulta: CONSULTA, pineados, hallazgos, ahora: AHORA, presupuestos: PRESUPUESTOS });
    expect(JSON.stringify({ pineados, hallazgos })).toBe(antes);
  });

  it('determinismo: misma entrada → mismo orden en corridas repetidas', () => {
    const entrada = {
      consulta: CONSULTA,
      pineados: [
        observacion({ id: 1, titulo: 'Acuerdo de turnos', contenido: 'Acordó turnos de tarde.', creadoEn: new Date(0) }),
      ],
      hallazgos: [
        observacion({ id: 2, titulo: 'Examen ocupacional', contenido: 'Incluye examen médico.' }),
        observacion({ id: 3, titulo: 'Preferencia de horarios', contenido: 'Prefiere la mañana.' }),
      ],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    };
    const primera = rankearMemorias(entrada);
    const segunda = rankearMemorias(entrada);
    expect(JSON.stringify(segunda)).toBe(JSON.stringify(primera));
  });

  it('consulta solo stopwords → sin términos: léxico 0 para todas, orden por frescura, sin crash', () => {
    const vieja = observacion({
      id: 1,
      titulo: 'Preferencia de horarios',
      contenido: 'Prefiere la mañana.',
      creadoEn: new Date(AHORA.getTime() - 180 * DIA_MS),
    });
    const reciente = observacion({
      id: 2,
      titulo: 'Preferencia de turnos',
      contenido: 'Prefiere la tarde.',
      creadoEn: new Date(AHORA.getTime() - 1 * DIA_MS),
    });
    const resultado = rankearMemorias({
      consulta: 'de la y que',
      pineados: [],
      hallazgos: [vieja, reciente],
      ahora: AHORA,
      presupuestos: PRESUPUESTOS,
    });
    expect(ids(resultado)).toEqual([2, 1]);
  });
});
