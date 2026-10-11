import type { ObservacionMemoria } from '../domain/entities';
import { normalizarTerminos } from './recuperarConocimiento';

/**
 * Hybrid memory ranker (agente-ia-crm E4·T3) — the PURE half of the
 * memory recall, the `rankearConocimiento` sibling for the Engram
 * side: it scores the COMBINED pinned + search candidates, removes
 * duplicates and enforces the per-block budgets BEFORE anything
 * reaches the prompt. No I/O, no Date.now — `ahora` is injected
 * (Clock precedent) so the result is fully deterministic.
 *
 * Scoring per observation (transparent, weights as named constants):
 * - lexical: the KB term normalizer REUSED (lowercase, NFD, non-
 *   alphanumeric split, Spanish stopwords) — per query term, titulo
 *   match ×2 + contenido match ×1, divided by the query term count
 *   → 0..3.0 (same shape and max as the KB ranker);
 * - frescura: exp(-antiguedadDias / 30). `creadoEn` unusable
 *   (invalid Date or epoch — pinned `contexto` rows cross with
 *   id 0 and NO real timestamp, entities.ts) → neutral 0.5; a
 *   future timestamp is clamped to age 0 (freshness ≤ 1);
 * - nivel: chat-level observation of THIS conversation → +0.5
 *   (working-memory proximity; the buscar port already scopes chat
 *   hits to the caller's session), empresa-level → +0;
 * - pineado: +2.0 boost for rows coming from `contexto`.
 * - total = 2.0 * lexical + frescura + nivelBonus + pineadoBoost.
 *
 * Dedup runs on the COMBINED list BEFORE budgeting, two rules:
 * (a) normalized-title equality (trim + lowercase + NFD + collapse
 *     spaces); (b) containment — the normalized contenido of one
 *     contains the other's when the shorter (normalized) is > 40
 *     chars. The keeper: a PINED row always beats an unpinned one
 *     (the always-survive guarantee — the budget never gets the
 *     chance to keep a pinned row that dedup already dropped);
 *     within the same pin status, higher score wins, then the
 *     freshest `creadoEn`, then the original order.
 *
 * Budgeting per block AFTER dedup: pineados → first N by score
 * (MAX_MEMORIAS_PINEADOS), then the unpinned survivors split by
 * nivel — empresa → MAX_MEMORIAS_EMPRESA, chat → MAX_MEMORIAS_CHAT —
 * each block sorted score DESC with the original order as the stable
 * tie-break. The returned array is block-ordered [pineados, empresa,
 * chat], mirroring today's [...contexto, ...hallazgos] precedence.
 * Inputs are never mutated.
 */

/** Budgets per block for one ranking run (all optional-clamped ≥ 0). */
export interface PresupuestosMemorias {
  /** Max PINNED observations kept (pinned rows never displaced by unpinned ones). */
  pineados: number;
  /** Max empresa-level search hits kept. */
  empresa: number;
  /** Max chat-level search hits kept. */
  chat: number;
}

/** Input of `rankearMemorias` — everything injected, nothing hidden. */
export interface EntradaRankearMemorias {
  /** The client query the memories are ranked against. */
  consulta: string;
  /** Pinned observations from `memoria.contexto` (often id 0, epoch `creadoEn`). */
  pineados: ObservacionMemoria[];
  /** Search hits from `memoria.buscar` (real ids + timestamps). */
  hallazgos: ObservacionMemoria[];
  /** The instant freshness is measured against (injected, never Date.now). */
  ahora: Date;
  /** Per-block budgets applied after dedup. */
  presupuestos: PresupuestosMemorias;
}

/** Lexical weight: one full-overlap query term is worth 2.0 points. */
const PESO_LEXICO = 2.0;
/** Chat-level proximity bonus (this conversation's working memory). */
const BONIFICACION_NIVEL_CHAT = 0.5;
/** Pin boost — pinned rows outrank equal search hits. */
const BONIFICACION_PINEADO = 2.0;
/** Freshness half-life window in days: exp(-antiguedadDias / 30). */
const VENTANA_FRESCURA_DIAS = 30;
/** Neutral freshness when `creadoEn` is unusable (epoch/invalid). */
const FRESCURA_NEUTRAL = 0.5;
/** Min normalized-contenido length for the containment dedup rule. */
const MINIMO_CONTENCION = 40;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** One scored observation inside the ranking pipeline. */
interface ObservacionPuntuada {
  observacion: ObservacionMemoria;
  puntaje: number;
  pineado: boolean;
  /** Original position across the COMBINED list (stable tie-break). */
  orden: number;
}

/**
 * Usable timestamp: a real (finite, post-epoch) instant. Pinned rows
 * cross `creadoEn` at epoch — epoch means "no timestamp" here.
 */
function esFechaUtil(fecha: Date): boolean {
  const tiempo = fecha.getTime();
  return Number.isFinite(tiempo) && tiempo > 0;
}

/** Sort/age key: real instants sort by time; unusable ones sink to the very past. */
function fechaClave(fecha: Date): number {
  return esFechaUtil(fecha) ? fecha.getTime() : Number.NEGATIVE_INFINITY;
}

/** exp(-antigüedadDías/30); unusable timestamps → neutral 0.5. */
function frescuraDe(creadoEn: Date, ahora: Date): number {
  if (!esFechaUtil(creadoEn)) return FRESCURA_NEUTRAL;
  const antiguedadDias = Math.max(0, (ahora.getTime() - creadoEn.getTime()) / MS_POR_DIA);
  return Math.exp(-antiguedadDias / VENTANA_FRESCURA_DIAS);
}

/** KB-style lexical overlap: (título×2 + contenido×1) / términos de la consulta → 0..3. */
function puntajeLexico(consulta: string, observacion: ObservacionMemoria): number {
  const terminosConsulta = normalizarTerminos(consulta);
  if (terminosConsulta.length === 0) return 0;
  const terminosTitulo = new Set(normalizarTerminos(observacion.titulo));
  const terminosContenido = new Set(normalizarTerminos(observacion.contenido));
  let aciertos = 0;
  for (const termino of terminosConsulta) {
    if (terminosTitulo.has(termino)) aciertos += 2;
    if (terminosContenido.has(termino)) aciertos += 1;
  }
  return aciertos / terminosConsulta.length;
}

/** Title key for exact-equality dedup: trim + lowercase + NFD + collapse spaces. */
function normalizarTitulo(titulo: string): string {
  return titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Contenido key for containment dedup (same normalization family). */
function normalizarContenido(contenido: string): string {
  return contenido
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Duplicates: equal normalized title, or containment with the shorter > 40 chars. */
function sonDuplicadas(a: ObservacionMemoria, b: ObservacionMemoria): boolean {
  if (normalizarTitulo(a.titulo) === normalizarTitulo(b.titulo)) return true;
  const contenidoA = normalizarContenido(a.contenido);
  const contenidoB = normalizarContenido(b.contenido);
  const corta = contenidoA.length <= contenidoB.length ? contenidoA : contenidoB;
  const larga = corta === contenidoA ? contenidoB : contenidoA;
  return corta.length > MINIMO_CONTENCION && larga.includes(corta);
}

/**
 * Keeper of a duplicate pair: pinned always beats unpinned (the
 * always-survive guarantee outranks score here); otherwise higher
 * score, then freshest `creadoEn`, then original order.
 */
function mejorDe(a: ObservacionPuntuada, b: ObservacionPuntuada): ObservacionPuntuada {
  if (a.pineado !== b.pineado) return a.pineado ? a : b;
  if (a.puntaje !== b.puntaje) return a.puntaje > b.puntaje ? a : b;
  const fechaA = fechaClave(a.observacion.creadoEn);
  const fechaB = fechaClave(b.observacion.creadoEn);
  if (fechaA !== fechaB) return fechaA > fechaB ? a : b;
  return a.orden <= b.orden ? a : b;
}

/** Budget clamp: garbage/negative budgets degrade to 0, never to "unbounded". */
function tope(valor: number): number {
  return Math.max(0, Math.trunc(valor));
}

/**
 * Score, deduplicate and budget the combined pinned + search
 * observations (see module docblock). Returns the survivors in block
 * order [pineados, empresa, chat], each block score DESC (stable on
 * original order). Pure: `input` is never mutated.
 */
export function rankearMemorias(input: EntradaRankearMemorias): ObservacionMemoria[] {
  const puntuadas: ObservacionPuntuada[] = [];
  const cargar = (observaciones: ObservacionMemoria[], pineado: boolean): void => {
    for (const observacion of observaciones) {
      const lexico = puntajeLexico(input.consulta, observacion);
      const puntaje =
        PESO_LEXICO * lexico +
        frescuraDe(observacion.creadoEn, input.ahora) +
        (observacion.nivel === 'chat' ? BONIFICACION_NIVEL_CHAT : 0) +
        (pineado ? BONIFICACION_PINEADO : 0);
      puntuadas.push({ observacion, puntaje, pineado, orden: puntuadas.length });
    }
  };
  cargar(input.pineados, true);
  cargar(input.hallazgos, false);

  const eliminadas = new Set<number>();
  for (let i = 0; i < puntuadas.length; i += 1) {
    if (eliminadas.has(i)) continue;
    for (let j = i + 1; j < puntuadas.length; j += 1) {
      if (eliminadas.has(j)) continue;
      if (!sonDuplicadas(puntuadas[i].observacion, puntuadas[j].observacion)) continue;
      eliminadas.add(mejorDe(puntuadas[i], puntuadas[j]) === puntuadas[i] ? j : i);
      if (eliminadas.has(i)) break;
    }
  }

  const supervivientes = puntuadas.filter((_, indice) => !eliminadas.has(indice));
  const porPuntaje = (a: ObservacionPuntuada, b: ObservacionPuntuada): number =>
    b.puntaje - a.puntaje || a.orden - b.orden;
  const bloquePineados = supervivientes
    .filter((entrada) => entrada.pineado)
    .sort(porPuntaje)
    .slice(0, tope(input.presupuestos.pineados));
  const bloqueEmpresa = supervivientes
    .filter((entrada) => !entrada.pineado && entrada.observacion.nivel === 'empresa')
    .sort(porPuntaje)
    .slice(0, tope(input.presupuestos.empresa));
  const bloqueChat = supervivientes
    .filter((entrada) => !entrada.pineado && entrada.observacion.nivel === 'chat')
    .sort(porPuntaje)
    .slice(0, tope(input.presupuestos.chat));
  return [...bloquePineados, ...bloqueEmpresa, ...bloqueChat].map(
    (entrada) => entrada.observacion,
  );
}
