/**
 * Términos de recall compartidos (agente-ia-crm E4·T5): la extracción
 * que alimenta el PREFILTRO RAG y los huecos de conocimiento vive acá
 * para que el motor (generarRespuestaAgente) y marcarRespuestaDeficiente
 * usen EXACTAMENTE la misma noción de término — nunca un fork.
 *
 * Normalize: lowercase + NFD sin diacríticos + split no-alfanumérico,
 * longitud > 2, máximo MAX_TERMINOS_PREFILTRO. Los stopwords NO se
 * filtran acá: sumar candidatos extra es inofensivo (el ranking de la
 * aplicación les da puntaje 0) y mantener una sola noción de término
 * simplifica el contrato con el ranker y con el SQL prefilter
 * (extraerTerminosBusqueda, su gemelo de normalización).
 */

const MAX_TERMINOS_PREFILTRO = 8;

export function extraerTerminosRecall(consulta: string): string[] {
  return consulta
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((termino) => termino.length > 2)
    .slice(0, MAX_TERMINOS_PREFILTRO);
}
