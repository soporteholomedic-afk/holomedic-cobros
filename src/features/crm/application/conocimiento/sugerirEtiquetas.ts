/**
 * Sugeridor de etiquetas para las entradas de una ingesta (agente-ia-crm
 * E4·T7) — módulo PURO y determinista. Sobre el texto de UN chunk
 * elige los 4 términos más frecuentes y agrega SIEMPRE 'subido', de
 * modo que el origen del contenido quede visible en la KB (el seed usa
 * 'semilla', el editor E5 'MANUAL' por defecto).
 *
 * Reutiliza EXACTAMENTE la noción de término del RAG (E2·T1):
 * normalizarTerminos — minúsculas + NFD sin diacríticos + split no
 * alfanumérico + stopwords ES fuera — para que las etiquetas sugeridas
 * sean términos que la búsqueda del cliente realmente alcanza. Sobre
 * eso se filtra longitud > 3 (los términos cortos no aportan tema).
 * Desempate alfanumérico para que la salida sea determinista.
 */

import { normalizarTerminos } from '../recuperarConocimiento';

const MAX_ETIQUETAS_FRECUENTES = 4;
const ETIQUETA_ORIGEN = 'subido';

export function sugerirEtiquetas(texto: string): string[] {
  const frecuencias = new Map<string, number>();
  for (const termino of normalizarTerminos(texto)) {
    if (termino.length <= 3) continue;
    frecuencias.set(termino, (frecuencias.get(termino) ?? 0) + 1);
  }

  const top = [...frecuencias.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, MAX_ETIQUETAS_FRECUENTES)
    .map(([termino]) => termino);

  if (!top.includes(ETIQUETA_ORIGEN)) top.push(ETIQUETA_ORIGEN);
  return top;
}
