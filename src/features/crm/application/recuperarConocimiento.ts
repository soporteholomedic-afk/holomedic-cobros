import type { EntradaConocimiento } from '../domain/entities';
import type { ConocimientoCrmRepository } from '../domain/ports';

/**
 * KB retrieval (agente-ia-crm E2·T1) — the deterministic half of the
 * RAG pipeline. `rankearConocimiento` is a PURE function: term-overlap
 * scoring over the port's LIKE-prefiltered candidates, vigencia
 * windowing and top-k selection, all against an injected `ahora` (no
 * hidden Date.now — Clock precedent). `recuperarConocimiento` is the
 * thin wrapper the E2 response engine calls: prefilter via the port,
 * then rank.
 *
 * Scoring: normalize (lowercase, strip diacritics, split on
 * non-alphanumerics, drop Spanish stopwords) → per query term,
 * titulo match ×2 + contenido match ×1, divided by the TOTAL query
 * terms. Max 3.0 (a term hitting both fields); zero-score entries
 * never surface. Order: puntaje DESC, id ASC.
 */

/**
 * Spanish stopwords dropped from BOTH the query and the entry text —
 * they carry no topic signal and would dilute the score denominator
 * for every entry equally ('mas' also covers post-strip 'más').
 */
const STOPWORDS_ES = new Set([
  'de', 'la', 'el', 'en', 'y', 'a', 'para', 'con', 'por', 'que', 'se',
  'del', 'los', 'las', 'un', 'una', 'es', 'su', 'al', 'lo', 'como', 'mas',
]);

/** Lowercase → strip diacritics (NFD) → split on non-alphanumerics → drop stopwords. */
function normalizarTerminos(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((termino) => termino !== '' && !STOPWORDS_ES.has(termino));
}

/** One ranked KB entry — `puntaje` in (0, 3]. */
export interface EntradaConocimientoRankeada {
  entrada: EntradaConocimiento;
  puntaje: number;
}

/** True when the entry's inclusive vigencia window covers `ahora`. */
function esVigente(entrada: EntradaConocimiento, ahora: Date): boolean {
  if (entrada.vigenciaDesde !== null && entrada.vigenciaDesde > ahora) return false;
  if (entrada.vigenciaHasta !== null && entrada.vigenciaHasta < ahora) return false;
  return true;
}

/**
 * Rank KB entries against a free-text query. Empty/stopword-only
 * queries and non-positive topK return []. Entries outside their
 * vigencia window (or inactive — the port already filters, this is
 * the pure-function backstop) are excluded before scoring; zero-score
 * entries are dropped; results sort puntaje DESC with id ASC as the
 * deterministic tie-break, sliced to topK.
 */
export function rankearConocimiento(
  consulta: string,
  entradas: EntradaConocimiento[],
  topK: number,
  ahora: Date,
): EntradaConocimientoRankeada[] {
  const terminos = normalizarTerminos(consulta);
  if (terminos.length === 0 || topK <= 0) return [];

  const resultados: EntradaConocimientoRankeada[] = [];
  for (const entrada of entradas) {
    if (!entrada.activo || !esVigente(entrada, ahora)) continue;
    const terminosTitulo = new Set(normalizarTerminos(entrada.titulo));
    const terminosContenido = new Set(normalizarTerminos(entrada.contenido));
    let aciertos = 0;
    for (const termino of terminos) {
      if (terminosTitulo.has(termino)) aciertos += 2;
      if (terminosContenido.has(termino)) aciertos += 1;
    }
    const puntaje = aciertos / terminos.length;
    if (puntaje <= 0) continue;
    resultados.push({ entrada, puntaje });
  }

  resultados.sort(
    (a, b) => b.puntaje - a.puntaje || a.entrada.id - b.entrada.id,
  );
  return resultados.slice(0, topK);
}

/**
 * Thin wrapper the E2 response engine consumes: LIKE prefilter through
 * the port, then pure ranking with the current instant as `ahora`.
 */
export async function recuperarConocimiento(
  repo: ConocimientoCrmRepository,
  consulta: string,
  topK: number,
): Promise<EntradaConocimientoRankeada[]> {
  const candidatos = await repo.buscarPorTexto(consulta);
  return rankearConocimiento(consulta, candidatos, topK, new Date());
}
