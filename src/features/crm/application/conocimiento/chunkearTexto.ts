/**
 * Troceador de texto para la ingesta de conocimiento (agente-ia-crm
 * E4·T7) — módulo PURO. Divide el texto crudo (normalizado, \n como
 * único salto) en chunks de ~900 caracteres que el procesador convierte
 * en entradas de CRM_Conocimiento: suficientemente chicos para el
 * ranking RAG por términos, suficientemente grandes para conservar
 * párrafos completos juntos.
 *
 * Reglas (pinned en el test colocado):
 * - Se divide por párrafos (\n\n+); los párrafos más largos que el
 *   objetivo se cortan en el ÚLTIMO espacio (nunca a mitad de palabra).
 * - Acumulación voraz hacia OBJETIVO_CARACTERES (~900).
 * - Solape: cada chunk (salvo el primero) empieza repitiendo la cola
 *   (~150 caracteres, alineada a palabra) del chunk anterior, de modo
 *   que una idea que quede partida entre dos entradas se recupere en
 *   ambas.
 * - TOPE DURO de MAX_CHUNKS (200): el excedente se DESCARTA. Una
 *   ingesta válida ya está acotada por el límite de 200 000 caracteres
 *   de iniciarIngesta (~222 chunks potenciales); el tope es la red de
 *   seguridad que impide que un texto hostil inunde la KB — el resto
 *   no se ingesta y el `entradasCreadas` refleja solo lo creado.
 * - Entrada vacía / solo espacios → [].
 */

const OBJETIVO_CARACTERES = 900;
const SOLAPE_CARACTERES = 150;
const MAX_CHUNKS = 200;

/**
 * Cola del chunk anterior para anteponer al siguiente (~150 chars):
 * se toma el final del chunk y se recorta hasta arrancar en un borde
 * de palabra (tras el primer espacio de la ventana). Si la ventana no
 * contiene ningún espacio (un token sin cortes más largo que el
 * solape) se toma entera — es irrecortable sin partir palabra.
 */
function extraerSolape(chunk: string): string {
  if (chunk.length <= SOLAPE_CARACTERES) return chunk;
  const ventana = chunk.slice(-SOLAPE_CARACTERES);
  const primerEspacio = ventana.indexOf(' ');
  return primerEspacio === -1 ? ventana : ventana.slice(primerEspacio + 1);
}

/**
 * Párrafo más largo que el objetivo → piezas ≤ objetivo cortadas en
 * el último espacio de la ventana. Un token SIN espacios más largo que
 * el objetivo (URL gigante, base64) se corta duro: es la única forma
 * de acotarlo y el test lo documenta.
 */
function partirParrafoLargo(parrafo: string): string[] {
  const piezas: string[] = [];
  let restante = parrafo;
  while (restante.length > OBJETIVO_CARACTERES) {
    const ventana = restante.slice(0, OBJETIVO_CARACTERES);
    const ultimoEspacio = ventana.lastIndexOf(' ');
    const corte = ultimoEspacio > 0 ? ultimoEspacio : OBJETIVO_CARACTERES;
    const pieza = restante.slice(0, corte).trim();
    if (pieza !== '') piezas.push(pieza);
    restante = restante.slice(corte).trim();
  }
  if (restante !== '') piezas.push(restante);
  return piezas;
}

export function chunkearTexto(texto: string): string[] {
  const parrafos = texto
    .split(/\n{2,}/)
    .map((parrafo) => parrafo.trim())
    .filter((parrafo) => parrafo !== '');
  if (parrafos.length === 0) return [];

  const bloques: string[] = [];
  for (const parrafo of parrafos) {
    if (parrafo.length <= OBJETIVO_CARACTERES) {
      bloques.push(parrafo);
    } else {
      bloques.push(...partirParrafoLargo(parrafo));
    }
  }

  const chunks: string[] = [];
  let actual = '';
  let solape = '';
  for (const bloque of bloques) {
    const candidato =
      actual === ''
        ? solape === ''
          ? bloque
          : `${solape}\n\n${bloque}`
        : `${actual}\n\n${bloque}`;
    // El solape puede empujar el chunk un poco por encima del objetivo
    // (~1052 máx.): aceptable — el objetivo es aproximado por diseño.
    if (candidato.length <= OBJETIVO_CARACTERES || actual === '') {
      actual = candidato;
      continue;
    }
    chunks.push(actual);
    solape = extraerSolape(actual);
    actual = solape === '' ? bloque : `${solape}\n\n${bloque}`;
  }
  if (actual !== '') chunks.push(actual);

  // Tope duro (ver cabecera): el excedente se descarta a propósito.
  return chunks.slice(0, MAX_CHUNKS);
}
