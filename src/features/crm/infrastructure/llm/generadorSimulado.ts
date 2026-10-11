import type {
  EntradaDestilacion,
  EntradaGenerarRespuesta,
  FichaDestilada,
  IdentificacionExtraida,
  RespuestaGenerada,
  ResultadoDestilacion,
} from '../../domain/entities';
import type { GeneradorRespuestaPort } from '../../domain/ports';

/**
 * SIMULATED response-generator adapter (agente-ia-crm E2·T3): a
 * deterministic GeneradorRespuestaPort — no network, no timers, no
 * randomness — selected by default in development via
 * crearGeneradorRespuesta (missing LLM_API_KEY) so the E2 DoD demo
 * runs without an API key. Branches:
 * - indicacionHumana present (E3·T2) → deterministic relay: a fixed
 *   prefix + the indicación trimmed to 200 chars, enScope true and NO
 *   ayuda humana (the motor skips the gate anyway; the no-API-key
 *   demo must SHOW the relay). This arm wins over every other.
 * - conocimiento non-empty → the FIRST fragment's contenido (trimmed
 *   to 400 chars; a safe prefix + titulo when the contenido is blank),
 *   scoreConfianza 0.8, enScope true, citing that fragment's id.
 * - solo memorias → the FIRST memoria's contenido the same way, with
 *   NO knowledge ids (memories are not KB citations).
 * - both empty + contactoNuevo (E2·T9) → a warm greeting that asks
 *   for nombre/empresa in one natural question (scoreConfianza 0.7,
 *   enScope true — an unlinked 'Hola' is ANSWERED, never escalated).
 * - both empty + linked → escalation: enScope false,
 *   requiereAyudaHumana true, scoreConfianza 0.1, fixed safe
 *   deferral texto.
 * destilar emits exactly ONE hecho_cliente observation; an empty
 * consulta distills to NOTHING. E4·T4 (destilación v2 discipline):
 * the titulo is SELF-CONTAINED — "Sujeto: primeras palabras de la
 * consulta", ≤8 words counting the subject — where Sujeto is the
 * client's stated name when derivable from the consulta itself
 * (capitalized token right after "soy" / "me llamo" / "habla",
 * case-sensitive so cargos like "el Dueño" never match), else the
 * literal "Cliente"; contenido stays the consulta trimmed to 200
 * chars; pinear is ALWAYS false (an informational hecho_cliente never
 * pins — the v2 discipline reserves pins for party-binding
 * acuerdos/compromisos, which the simulator never emits). E3·T4: the SAME
 * call attaches a `ficha` block via deterministic heuristics over
 * the EXCHANGE text (consulta + respuesta) — /(\d+)\s*(personas|
 * trabajadores|empleados|gente)/i → trabajadores, /(\d+)\s*sede/i →
 * sedes (the captured NUMBER in both cases) and a cargo keyword
 * (dueño|dueña|gerente|director|encargado|jefe|responsable|
 * comprador — case-tolerant, ñ/n-tolerant for the only accented
 * letter in the catalog) → the matched word. This is what makes the
 * no-API-key DoD demo SHOW "la ficha muestra el dato extraído
 * automáticamente"; no keyword → no ficha property at all.
 * extraerIdentificacion (E2·T9) ALWAYS returns null: identification
 * is exercised only by the real adapter (the motor tests mock the
 * port) — the simulator never fabricates a stated name/company. Every
 * RespuestaGenerada carries modelo 'simulado' (the motor's per-message
 * audit column must distinguish simulated answers offline).
 *
 * Security: this fake keeps every input strictly in process memory
 * and logs NOTHING.
 */

const TEXTO_DERIVACION =
  'Gracias por tu consulta. En breve te confirma una persona del equipo de Holomedic.';
const TEXTO_SALUDO_CONTACTO_NUEVO =
  '¡Hola! Qué gusto que nos escribas. Soy La Guía, de Holomedic. Para ayudarte mejor, ¿me contás tu nombre y de qué empresa nos contactás?';
const PREFIJO_SEGURO = 'Información disponible: ';
/** E3·T2 deterministic relay prefix (offline demo shows the indicación). */
const PREFIJO_INDICACION = '(simulado) Conforme a la indicación de nuestro equipo: ';
const LIMITE_TEXTO = 400;
/** E4·T4: máximo de palabras del título destilado, CONTANDO el sujeto. */
const LIMITE_TITULO_PALABRAS = 8;
const LIMITE_CONTENIDO_DESTILACION = 200;
/** E3·T2 indicación clamp inside the simulated texto. */
const LIMITE_INDICACION = 200;
const SUJETO_POR_DEFECTO = 'Cliente';
/** Model name reported in RespuestaGenerada.modelo (audit). */
const MODELO_SIMULADO = 'simulado';
/** scoreConfianza of the contactoNuevo greeting (answered, not escalated). */
const SCORE_SALUDO_CONTACTO_NUEVO = 0.7;

/** E3·T4 heuristics — the number captured before each headcount word. */
const PATRON_TRABAJADORES = /(\d+)\s*(?:personas|trabajadores|empleados|gente)/i;
/** E3·T4 heuristics — the number captured before "sede(s)". */
const PATRON_SEDES = /(\d+)\s*sede/i;
/**
 * E3·T4 heuristics — cargo keywords. ñ is the only accented letter in
 * the catalog, so [ñn] classes give accent tolerance; /i gives case
 * tolerance. Alternation longest-first so "directora" reports
 * "directora", not the "director" prefix.
 */
const PATRON_CARGO =
  /(due[nñ]a|due[nñ]o|directora|director|encargada|encargado|gerente|jefe|responsable|compradora|comprador)/i;

/**
 * E3·T4: deterministic ficha heuristics over the exchange text.
 * Only non-empty string fields are attached; no keyword → undefined
 * (the caller leaves the property absent entirely).
 */
function fichaDelIntercambio(consulta: string, respuesta: string): FichaDestilada | undefined {
  const texto = `${consulta}\n${respuesta}`;
  const ficha: FichaDestilada = {};
  const trabajadores = PATRON_TRABAJADORES.exec(texto);
  if (trabajadores !== null) ficha.trabajadores = trabajadores[1];
  const sedes = PATRON_SEDES.exec(texto);
  if (sedes !== null) ficha.sedes = sedes[1];
  const cargo = PATRON_CARGO.exec(texto);
  if (cargo !== null) ficha.cargo = cargo[0];
  return Object.keys(ficha).length > 0 ? ficha : undefined;
}

/** Prompt fragment body → simulated texto (400-char cap, safe fallback). */
function textoSimulado(contenido: string, titulo: string): string {
  const recortado = contenido.trim().slice(0, LIMITE_TEXTO);
  if (recortado !== '') return recortado;
  return `${PREFIJO_SEGURO}${titulo}`.slice(0, LIMITE_TEXTO);
}

/**
 * E4·T4: nombre PROPIO declarado en la consulta — un token iniciado en
 * mayúscula inmediatamente después de "soy" / "me llamo" / "habla"
 * (case-sensitive: "soy el Dueño" NO matchea porque "el" va en
 * minúscula — un cargo no es un nombre). Sin marca → undefined y el
 * título cae al sujeto por defecto.
 */
const PATRON_NOMBRE_PROPIO =
  /(?:^|[\s,.;:!?¿¡"'])(?:soy|me llamo|habla)\s+([A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*)/;

/**
 * E4·T4: título AUTOCONTENIDO determinista — "Sujeto: primeras palabras
 * de la consulta", con LIMITE_TITULO_PALABRAS palabras CONTANDO el
 * sujeto (1 token), así el título se escanea y se entiende sin leer el
 * intercambio.
 */
function tituloDestilado(consulta: string): string {
  const sujeto = PATRON_NOMBRE_PROPIO.exec(consulta)?.[1] ?? SUJETO_POR_DEFECTO;
  const palabras = consulta.split(/\s+/).filter((palabra) => palabra !== '');
  const cupo = Math.max(1, LIMITE_TITULO_PALABRAS - 1);
  return [`${sujeto}:`, ...palabras.slice(0, cupo)].join(' ');
}

export class GeneradorSimulado implements GeneradorRespuestaPort {
  async generarRespuesta(entrada: EntradaGenerarRespuesta): Promise<RespuestaGenerada> {
    // E3·T2 FIRST arm: an indicación relays deterministically — the
    // offline demo and the tests must SEE the operator instruction.
    const indicacion = entrada.indicacionHumana?.trim() ?? '';
    if (indicacion !== '') {
      return {
        texto: `${PREFIJO_INDICACION}${indicacion.slice(0, LIMITE_INDICACION)}`,
        scoreConfianza: 0.8,
        enScope: true,
        requiereAyudaHumana: false,
        idsConocimiento: [],
        modelo: MODELO_SIMULADO,
      };
    }
    const primerConocimiento = entrada.conocimiento[0];
    if (primerConocimiento !== undefined) {
      return {
        texto: textoSimulado(primerConocimiento.contenido, primerConocimiento.titulo),
        scoreConfianza: 0.8,
        enScope: true,
        requiereAyudaHumana: false,
        idsConocimiento: [primerConocimiento.id],
        modelo: MODELO_SIMULADO,
      };
    }
    const primeraMemoria = entrada.memorias[0];
    if (primeraMemoria !== undefined) {
      return {
        texto: textoSimulado(primeraMemoria.contenido, primeraMemoria.titulo),
        scoreConfianza: 0.8,
        enScope: true,
        requiereAyudaHumana: false,
        idsConocimiento: [],
        modelo: MODELO_SIMULADO,
      };
    }
    // E2·T9: unlinked with nothing to recall — a greeting IS in scope:
    // answer warmly and gather nombre/empresa (never an interrogation,
    // never an escalation for a plain 'Hola').
    if (entrada.contactoNuevo) {
      return {
        texto: TEXTO_SALUDO_CONTACTO_NUEVO,
        scoreConfianza: SCORE_SALUDO_CONTACTO_NUEVO,
        enScope: true,
        requiereAyudaHumana: false,
        idsConocimiento: [],
        modelo: MODELO_SIMULADO,
      };
    }
    return {
      texto: TEXTO_DERIVACION,
      scoreConfianza: 0.1,
      enScope: false,
      requiereAyudaHumana: true,
      idsConocimiento: [],
      modelo: MODELO_SIMULADO,
    };
  }

  async destilar(entrada: EntradaDestilacion): Promise<ResultadoDestilacion> {
    const consulta = entrada.consulta.trim();
    if (consulta === '') return [];
    // E3·T4: la misma llamada lleva la ficha (heurísticas sobre el
    // intercambio completo); sin datos la propiedad queda ausente.
    // E4·T4: título AUTOCONTENIDO (sujeto siempre presente) y pinear
    // false SIEMPRE — un hecho informativo jamás se pinea.
    const resultado = [
      {
        tipo: 'hecho_cliente',
        titulo: tituloDestilado(consulta),
        contenido: consulta.slice(0, LIMITE_CONTENIDO_DESTILACION),
        pinear: false,
      },
    ] as ResultadoDestilacion;
    const ficha = fichaDelIntercambio(consulta, entrada.respuesta);
    if (ficha !== undefined) resultado.ficha = ficha;
    return resultado;
  }

  async extraerIdentificacion(): Promise<IdentificacionExtraida | null> {
    // Documented contract (E2·T9): the simulator never fabricates a
    // stated name/company — identification is exercised only by the
    // real adapter (the motor tests mock the port).
    return null;
  }
}
