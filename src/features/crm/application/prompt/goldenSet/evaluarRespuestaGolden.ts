import type { SenalCierre } from '../../../domain/entities';
import { PROMPT_VERSION } from '../promptGeneracion';
import { PROMPT_GOLDEN_VERSION } from './casos';
import type { CasoGolden } from './casos';

/**
 * Evaluador determinista del golden set (agente-ia-crm E4·T2): una
 * función PURA sin I/O que puntúa una respuesta contra la expectativa
 * de su caso — la misma vara para el generador simulado (CI) y para
 * el LLM real (modo live opcional). Chequeos, cada uno con ids de
 * violación estables:
 * - cobertura (cita_kb / sigue_indicacion): la respuesta normalizada
 *   (NFD, sin tildes, minúsculas) contiene TODOS los terminosClave
 *   (que el caso toma de sus propias fuentes). → `termino_faltante: X`
 * - no invención (escala_sin_dato): la respuesta no contiene ningún
 *   terminosProhibido → `termino_prohibido: X`; y no introduce
 *   moneda/cifras-con-unidad (`$\d`, `\d+ (USD|UI|días|hora)`) cuyas
 *   cifras no estén en las fuentes del caso → `dato_inventado: X`.
 *   WHITELIST: los números que aparecen en
 *   conocimiento/memorias del caso no cuentan como invención — una
 *   respuesta que cita un dato existente no es invención (la
 *   invención es introducir datos NUEVOS).
 * - formato WhatsApp (todos los tipos): sin `**` (`formato_negrita`),
 *   sin `##` (`formato_encabezado`), sin fences ```(`formato_codigo`),
 *   sin tablas `|---` (`formato_tabla`), máximo 1 emoji con rango
 *   Unicode conservador (`formato_emoji_excesivo`), y límite blando de
 *   600 caracteres (`largo_excesivo`).
 * - presencia (cortesia / presentacion_contacto_nuevo): respuesta no
 *   vacía (`respuesta_vacia`) y de más de 10 caracteres
 *   (`respuesta_corta`) — una cortesía se RESPONDE, nunca se escala
 *   con texto ausente.
 *
 * Precisión deliberada (cero falsos positivos contra el simulado):
 * la detección de invención SOLO corre para escala_sin_dato y SOLO
 * dispara con marcadores de dato (moneda o cifra con unidad); un
 * número suelto ("el viernes 15") no es un dato inventado.
 */

/** Veredicto determinista de un caso golden. */
export interface VeredictoGolden {
  pasa: boolean;
  violaciones: string[];
}

/** Un caso ya evaluado, para la tabla de resumenGolden. */
export interface ResultadoCasoGolden {
  caso: CasoGolden;
  respuesta: string;
  veredicto: VeredictoGolden;
}

/** Límite blando del formato WhatsApp (el mismo que promete el system). */
const LIMITE_LARGO = 600;
/** Presencia mínima de una respuesta de cortesía/presentación. */
const LIMITE_PRESENCIA = 10;

/** Moneda: `$ 150`, `$150.50`, `US$ 90` (marca de dato, no texto). */
const PATRON_DINERO = /\$\s?\d+(?:[.,]\d+)*/g;
/**
 * Cifra con unidad de dato: `5 días`, `24 horas`, `120 USD`, `30 UI`.
 * [ií] + /i = tolerante a mayúsculas y tildes; \b evita "5 diario".
 */
const PATRON_CANTIDAD_DATO = /\d+(?:[.,]\d+)?\s*(?:USD|UI|d[ií]as?|horas?)\b/gi;
/** Token numérico (para la whitelist de cifras de las fuentes). */
const PATRON_NUMERO = /\d+(?:[.,]\d+)?/g;
/** Rango Unicode conservador de emoji (símbolos pictóricos comunes). */
const PATRON_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

/**
 * Normalización de comparación (misma regla que el dedup del dominio):
 * trim, espacios colapsados, minúsculas, NFD y sin marcas diacríticas
 * — "Carné" y "CARNE DE MANIPULADOR" colapsan al mismo texto.
 */
function normalizar(texto: string): string {
  return texto
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Cifras que las fuentes del caso ya traen (whitelist de invención). */
function cifrasDeFuentes(caso: CasoGolden): Set<string> {
  const cifras = new Set<string>();
  const textos = [
    ...caso.entrada.conocimiento.flatMap((fragmento) => [fragmento.titulo, fragmento.contenido]),
    ...caso.entrada.memorias.flatMap((fragmento) => [fragmento.titulo, fragmento.contenido]),
  ];
  for (const texto of textos) {
    for (const coincidencia of texto.matchAll(PATRON_NUMERO)) cifras.add(coincidencia[0]);
  }
  return cifras;
}

/**
 * Marcadores de dato (moneda o cifra con unidad) cuyas cifras NO
 * están en las fuentes del caso — reportados con el texto crudo
 * original de la coincidencia.
 */
function datosInventados(caso: CasoGolden, respuesta: string): string[] {
  const permitidas = cifrasDeFuentes(caso);
  const inventados: string[] = [];
  const vistos = new Set<string>();
  for (const patron of [PATRON_DINERO, PATRON_CANTIDAD_DATO]) {
    for (const coincidencia of respuesta.matchAll(patron)) {
      const crudo = coincidencia[0].trim();
      if (vistos.has(crudo)) continue;
      const tokens = [...crudo.matchAll(PATRON_NUMERO)].map((token) => token[0]);
      if (tokens.some((token) => !permitidas.has(token))) {
        inventados.push(`dato_inventado: ${crudo}`);
        vistos.add(crudo);
      }
    }
  }
  return inventados;
}

/** Puntúa una respuesta contra la expectativa de su caso golden. */
export function evaluarRespuestaGolden(caso: CasoGolden, respuesta: string): VeredictoGolden {
  const violaciones: string[] = [];
  const texto = normalizar(respuesta);
  const { tipo, terminosClave = [], terminosProhibidos = [] } = caso.expectativa;

  if (texto === '') {
    violaciones.push('respuesta_vacia');
  } else if (
    (tipo === 'cortesia' || tipo === 'presentacion_contacto_nuevo') &&
    respuesta.trim().length <= LIMITE_PRESENCIA
  ) {
    violaciones.push('respuesta_corta');
  }

  if (tipo === 'cita_kb' || tipo === 'sigue_indicacion') {
    for (const termino of terminosClave) {
      if (!texto.includes(normalizar(termino))) violaciones.push(`termino_faltante: ${termino}`);
    }
  }

  if (tipo === 'escala_sin_dato') {
    for (const termino of terminosProhibidos) {
      if (texto.includes(normalizar(termino))) violaciones.push(`termino_prohibido: ${termino}`);
    }
    violaciones.push(...datosInventados(caso, respuesta));
  }

  if (texto.includes('**')) violaciones.push('formato_negrita');
  if (texto.includes('##')) violaciones.push('formato_encabezado');
  if (texto.includes('```')) violaciones.push('formato_codigo');
  if (texto.includes('|---')) violaciones.push('formato_tabla');
  if ((texto.match(PATRON_EMOJI) ?? []).length > 1) violaciones.push('formato_emoji_excesivo');
  if (respuesta.length > LIMITE_LARGO) violaciones.push('largo_excesivo');

  return { pasa: violaciones.length === 0, violaciones };
}

/**
 * Puntea la señal de cierre (E5·T8) contra `senalCierreEsperada`:
 * ausente ⇒ el caso no mide cierre; null ⇒ no debe haber señal; un tipo
 * ⇒ debe proponerse exactamente ese (la confianza no se puntúa).
 */
export function evaluarSenalCierreGolden(
  caso: CasoGolden,
  senal: SenalCierre | null | undefined,
): VeredictoGolden {
  const esperada = caso.senalCierreEsperada;
  const violaciones: string[] = [];
  if (esperada === null && senal != null) {
    violaciones.push(`senal_cierre_inesperada: ${senal.tipo}`);
  } else if (typeof esperada === 'string') {
    if (senal == null) violaciones.push(`senal_cierre_faltante: ${esperada}`);
    else if (senal.tipo !== esperada) {
      violaciones.push(`senal_cierre_distinta: esperada ${esperada}, obtenida ${senal.tipo}`);
    }
  }
  return { pasa: violaciones.length === 0, violaciones };
}

/** Tabla para el stdout del runner live (y de cualquier corrida local). */
export function resumenGolden(resultados: ResultadoCasoGolden[]): string {
  const ok = resultados.filter((resultado) => resultado.veredicto.pasa).length;
  const lineas = [
    `Golden set ${PROMPT_GOLDEN_VERSION} (prompt ${PROMPT_VERSION}) — ${ok}/${resultados.length} casos OK`,
  ];
  const conCierre = resultados.filter(({ caso }) => caso.senalCierreEsperada !== undefined);
  if (conCierre.length > 0) {
    const okCierre = conCierre.filter(({ veredicto }) => veredicto.pasa).length;
    lineas.push(`Señal de cierre: ${okCierre}/${conCierre.length} casos OK`);
  }
  for (const { caso, veredicto } of resultados) {
    const marca = veredicto.pasa ? 'OK   ' : 'FALLA';
    const detalle =
      veredicto.violaciones.length > 0 ? ` → ${veredicto.violaciones.join('; ')}` : '';
    lineas.push(`${marca} ${caso.id} [${caso.expectativa.tipo}]${detalle}`);
  }
  return lineas.join('\n');
}
