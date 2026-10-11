import type {
  EntradaDestilacion,
  EntradaExtraerIdentificacion,
  EntradaGenerarRespuesta,
} from '../../domain/entities';

/**
 * The modular generation prompt (agente-ia-crm E4·T1) — the ONE home
 * of la Guía's prompt engineering, owned by the APPLICATION layer:
 * the OpenAI-compatible adapter is pure transport (messages in,
 * validated JSON out) and every builder here assembles the full
 * system+user pair it must send. All CONTENT is Spanish product
 * content (the answers are client-facing Spanish WhatsApp texts).
 *
 * PROMPT_VERSION 'v2' — the first versioned rewrite: the monolithic
 * E2 system string becomes base persona/format/anti-invention rules
 * plus CONDITIONAL blocks appended only when applicable (operator
 * indicación, new-contact presentation, knowledge hit/miss, memory
 * hit/miss). The USER message keeps the E2·T3 labeled-section
 * contract VERBATIM (INDICACIÓN DEL OPERADOR first when present, then
 * CONSULTA, HISTORIAL, CONOCIMIENTO "[id N] titulo\ncontenido",
 * MEMORIAS "[tipo] titulo\ncontenido", CONTACTO NUEVO last; empty
 * sections render "(vacío)") — the wire contract with the model and
 * every existing test stays intact.
 *
 * Destilación e identificación remain v1 VERBATIM: their builders
 * only relocate the E2/E3 system strings here (the v2 distillation
 * rewrite is a later task), each signed with its own version const
 * so the audit column (CRM_Mensajes.promptVersion) can tell them
 * apart.
 */

/** Prompt version of the generación builder (audited per IA message). */
export const PROMPT_VERSION = 'v2';
/** Prompt version of the destilación builder (relocated v1, unchanged). */
export const PROMPT_VERSION_DESTILACION = 'v1';
/** Prompt version of the identificación builder (relocated v1, unchanged). */
export const PROMPT_VERSION_IDENTIFICACION = 'v1';

/** The full system+user pair an adapter must send, with its version. */
export interface PromptArmado {
  system: string;
  user: string;
  version: string;
}

/** Base system rules of v2: persona, WhatsApp format, anti-invention. */
const BASE_GENERACION_V2 = [
  [
    'Sos La Guía, la asistente de WhatsApp de Holomedic: vendemos salud ocupacional',
    'y hablamos en español profesional y cálido, con voseo.',
  ].join(' '),
  [
    'Escribí para WhatsApp: respuestas cortas, texto plano (sin markdown crudo ni tablas),',
    'bullets simples con "-" cuando ayuden, máximo 1 emoji y nunca más de ~600 caracteres',
    'salvo que el contenido lo exija.',
  ].join(' '),
  [
    'Respondé ÚNICAMENTE con lo que está en CONOCIMIENTO, MEMORIAS, INDICACIÓN DEL OPERADOR',
    'e HISTORIAL del mensaje del usuario: JAMÁS inventes precios, plazos, descuentos,',
    'disponibilidad ni datos médicos o laborales; si un dato no está en esas fuentes,',
    'decí que no lo tenés y ofrecé derivar la consulta a un asesor; sobre datos sensibles',
    '(salud, sueldos, documentos) jamás especules ni los pidas sin necesidad.',
  ].join(' '),
  [
    'Los saludos, agradecimientos y cortesía general SIEMPRE se responden',
    '(enScope true, scoreConfianza alto):',
    'solo derivás a un humano las consultas de NEGOCIO que no puedas responder',
    'con el CONOCIMIENTO y MEMORIAS provistos.',
  ].join(' '),
  [
    'Cuando corresponda, cerrá tu respuesta con una pregunta o un próximo paso claro',
    'para seguir avanzando.',
  ].join(' '),
].join('\n\n');

/** JSON output contract — unchanged since E2·T3 (the adapter guards it). */
const CONTRATO_JSON_GENERACION = [
  'scoreConfianza es tu confianza (entre 0 y 1) en que la respuesta está respaldada por lo provisto.',
  'Respondé ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:',
  '{"texto": string, "scoreConfianza": number, "enScope": boolean, "requiereAyudaHumana": boolean, "idsConocimiento": number[]}',
  'y nada más.',
].join(' ');

/** v2 conditional block: an operator indicación is active (E3·T2). */
const BLOQUE_INDICACION = [
  'INDICACIÓN DEL OPERADOR: hay una indicación de un operador de Holomedic activa para esta respuesta;',
  'es PRIORIDAD MÁXIMA y debe seguirse al pie de la letra: redactá conforme a ella',
  'sin contradecirla ni agregar condiciones que no estén ahí.',
].join(' ');

/** v2 conditional block: the conversation is still unlinked (E2·T9). */
const BLOQUE_CONTACTO_NUEVO = [
  'PRESENTACIÓN INICIAL (contacto nuevo): esta persona aún no está registrada en Holomedic;',
  'hacé una presentación breve de La Guía y de Holomedic, y juntá su nombre y la empresa',
  'que representa de forma natural durante la charla, sin quemar etapas (nunca un interrogatorio).',
].join(' ');

/** v2 conditional block: the KB recall returned fragments (hit). */
const BLOQUE_CONOCIMIENTO_HIT = [
  'CONOCIMIENTO DISPONIBLE: usá SOLO los fragmentos [id N] del bloque CONOCIMIENTO como fuente de hechos',
  'e incluí en idsConocimiento los ids de los fragmentos que uses,',
  'mencionando en qué fuente te apoyás cuando eso dé confianza al cliente.',
].join(' ');

/** v2 conditional block: the KB recall returned NOTHING (miss). */
const BLOQUE_CONOCIMIENTO_MISS = [
  'FUERA DE COBERTURA: para esta consulta NO hay fragmentos de conocimiento disponibles;',
  'reconocé que no contás con esa información y ofrecé derivar la consulta a un asesor humano,',
  'sin inventar nada ni intentar improvisar una respuesta.',
].join(' ');

/** v2 conditional block: conversation memory fragments exist (hit). */
const BLOQUE_MEMORIAS_HIT = [
  'MEMORIA PREVIA: hay MEMORIAS de intercambios anteriores;',
  'usalas como contexto para continuar la conversación sin repetir lo ya dicho textualmente.',
].join(' ');

/** v2 conditional block: no memory at all (first interaction). */
const BLOQUE_MEMORIAS_MISS = [
  'PRIMERA INTERACCIÓN: no hay memoria previa de esta persona;',
  'empezá de cero sin dar por sabido ningún dato anterior.',
].join(' ');

/** v1 system prompt (E3·T4 verbatim) — relocated only, do NOT rewrite here. */
const PROMPT_SISTEMA_DESTILAR_V1 = [
  'Eres el distilador de La Guía, la asistente de WhatsApp de Holomedic.',
  'Extraé del intercambio únicamente hechos duraderos: datos del cliente, acuerdos, compromisos, preferencias u objeciones;',
  'ignorá saludos y charla pasajera.',
  'Además extraé la ficha del contacto SOLO si el cliente la declaró explícitamente en el intercambio:',
  'su cargo (cargo), la cantidad de trabajadores de su empresa (trabajadores, como texto) y la cantidad de sedes (sedes, como texto);',
  'null cuando no aparezca. Nunca los deduzcas, completes ni inventes.',
  'Respondé ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:',
  '{"observaciones": [{"tipo": "hecho_cliente"|"acuerdo"|"compromiso"|"preferencia"|"objecion", "titulo": string (máximo 60 caracteres),',
  '"contenido": string (máximo 300 caracteres), "pinear": boolean}],',
  '"ficha": {"cargo": string|null, "trabajadores": string|null, "sedes": string|null}}',
  '— pinear=true solo para acuerdos y compromisos.',
  'Si no hay nada duradero ni datos de ficha, respondé {"observaciones": [], "ficha": null}.',
].join(' ');

/** v1 system prompt (E2·T9 verbatim) — relocated only, do NOT rewrite here. */
const PROMPT_SISTEMA_IDENTIFICAR_V1 = [
  'Eres el extractor de identificación de La Guía, la asistente de WhatsApp de Holomedic.',
  'Del intercambio extraé, SOLO si el cliente los dijo explícitamente, su nombre y la empresa que representa;',
  'si no los dijo, el valor es null. Nunca los deduzcas, completes ni inventes.',
  'Respondé ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:',
  '{"nombre": string|null, "empresa": string|null}',
  'y nada más.',
].join(' ');

/** Labeled user message for generarRespuesta (PII-scrubbed upstream). */
export function mensajeUsuarioGenerar(entrada: EntradaGenerarRespuesta): string {
  const historial =
    entrada.historial.length === 0
      ? '(vacío)'
      : entrada.historial.map((mensaje) => `[${mensaje.emisor}] ${mensaje.texto}`).join('\n');
  const conocimiento =
    entrada.conocimiento.length === 0
      ? '(vacío)'
      : entrada.conocimiento
          .map((fragmento) => `[id ${fragmento.id}] ${fragmento.titulo}\n${fragmento.contenido}`)
          .join('\n\n');
  const memorias =
    entrada.memorias.length === 0
      ? '(vacío)'
      : entrada.memorias
          .map((fragmento) => `[${fragmento.tipo}] ${fragmento.titulo}\n${fragmento.contenido}`)
          .join('\n\n');
  const secciones: string[] = [];
  // E3·T2: the operator instruction opens the message — MAXIMUM
  // priority, before everything else (a human already vouched for
  // this answer; the motor masked it upstream like every body).
  const indicacion = entrada.indicacionHumana?.trim() ?? '';
  if (indicacion !== '') {
    secciones.push(
      `INDICACIÓN DEL OPERADOR (prioridad máxima — seguila estrictamente al redactar tu respuesta):\n${indicacion}`,
    );
  }
  secciones.push(`CONSULTA:\n${entrada.consulta}`);
  // E4·T3: the thread synthesis rides between CONSULTA and HISTORIAL
  // — ONLY when non-empty (never a "(vacío)" placeholder; absent
  // field ⇒ the section does not exist at all).
  const sintesisHilo = entrada.sintesisHilo?.trim() ?? '';
  if (sintesisHilo !== '') {
    secciones.push(`SINTESIS DEL HILO:\n${sintesisHilo}`);
  }
  secciones.push(
    `HISTORIAL:\n${historial}`,
    `CONOCIMIENTO:\n${conocimiento}`,
    `MEMORIAS:\n${memorias}`,
  );
  // E2·T9: the progressive-identification instruction rides ONLY on
  // unlinked conversations, as the LAST labeled section.
  if (entrada.contactoNuevo) {
    secciones.push(
      'CONTACTO NUEVO: esta persona no está registrada. Además de responder su consulta, cuando sea NATURAL en la conversación (no un interrogatorio), preguntá su nombre y la empresa que representa cuando aún no los haya dicho; agradecé los datos cuando los dé.',
    );
  }
  return secciones.join('\n\n');
}

/** Labeled user message for destilar (one exchange) — v1 verbatim. */
function mensajeUsuarioDestilar(entrada: EntradaDestilacion): string {
  return `CONSULTA:\n${entrada.consulta}\n\nRESPUESTA:\n${entrada.respuesta}`;
}

/** Labeled user message for extraerIdentificacion (one exchange) — v1 verbatim. */
function mensajeUsuarioIdentificar(entrada: EntradaExtraerIdentificacion): string {
  return `CONSULTA:\n${entrada.consulta}\n\nRESPUESTA:\n${entrada.respuesta}`;
}

/**
 * Assemble the v2 prompt for one respuesta generation: the base
 * system rules plus one conditional block per applicable signal
 * (indicación, contacto nuevo, KB hit/miss, memoria hit/miss),
 * closed by the unchanged strict-JSON contract; the user message is
 * the E2·T3 labeled-section assembly (see mensajeUsuarioGenerar).
 */
export function armarPromptGeneracion(entrada: EntradaGenerarRespuesta): PromptArmado {
  const bloques: string[] = [BASE_GENERACION_V2];
  if ((entrada.indicacionHumana?.trim() ?? '') !== '') {
    bloques.push(BLOQUE_INDICACION);
  }
  if (entrada.contactoNuevo) {
    bloques.push(BLOQUE_CONTACTO_NUEVO);
  }
  bloques.push(entrada.conocimiento.length > 0 ? BLOQUE_CONOCIMIENTO_HIT : BLOQUE_CONOCIMIENTO_MISS);
  bloques.push(entrada.memorias.length > 0 ? BLOQUE_MEMORIAS_HIT : BLOQUE_MEMORIAS_MISS);
  bloques.push(CONTRATO_JSON_GENERACION);
  return { system: bloques.join('\n\n'), user: mensajeUsuarioGenerar(entrada), version: PROMPT_VERSION };
}

/** Assemble the v1 destilación prompt (relocated verbatim; do NOT rewrite here). */
export function armarPromptDestilacion(entrada: EntradaDestilacion): PromptArmado {
  return {
    system: PROMPT_SISTEMA_DESTILAR_V1,
    user: mensajeUsuarioDestilar(entrada),
    version: PROMPT_VERSION_DESTILACION,
  };
}

/** Assemble the v1 identificación prompt (relocated verbatim; do NOT rewrite here). */
export function armarPromptIdentificacion(entrada: EntradaExtraerIdentificacion): PromptArmado {
  return {
    system: PROMPT_SISTEMA_IDENTIFICAR_V1,
    user: mensajeUsuarioIdentificar(entrada),
    version: PROMPT_VERSION_IDENTIFICACION,
  };
}
