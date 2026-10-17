import type {
  EntradaDestilacion,
  EntradaGenerarRespuesta,
  FichaDestilada,
  IdentificacionExtraida,
  RespuestaGenerada,
  ResultadoDestilacion,
  SenalCierre,
  TipoCierreAgente,
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
 * audit column must distinguish simulated answers offline). E4·T5:
 * every arm also carries a deterministic `fidelidad` self-score —
 * 0.9 whenever the answer leans on a SOURCE (indicación / KB /
 * memoria / contactoNuevo greeting) and 0.3 on the escalation arm
 * (no source to be faithful to).
 *
 * E5·T8: every arm may also carry a `senalCierre`, decided by ONE
 * helper over the LAST user message (`consulta`) and only when the
 * matched tipo is in `cierresPosibles` (see senalCierreSimulada); it
 * never alters text, score, scope or ids of the chosen arm.
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
/**
 * E4·T5: fidelidad autoevaluada determinista — 0.9 en TODAS las ramas
 * con fuente (indicación/KB/memoria/saludo: la respuesta se apoya en
 * material real), 0.3 en la derivación (no hay fuente: la baja
 * autoevaluada acompaña la escalación).
 */
const FIDELIDAD_CON_FUENTE = 0.9;
const FIDELIDAD_SIN_FUENTE = 0.3;

/** E5·T8: confianza of every simulated close signal. */
const CONFIANZA_CIERRE_SIMULADA = 0.9;

/** Whole-word (unicode-aware) alternation, case-insensitive. */
function palabrasCompletas(alternativas: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternativas})(?![\\p{L}\\p{N}])`, 'iu');
}

/** E5·T8: close patterns in precedence order (first match wins). */
const PATRONES_CIERRE: ReadonlyArray<readonly [TipoCierreAgente, RegExp]> = [
  [
    'CONVERSION_CLIENTE',
    palabrasCompletas(
      'contratamos|queremos\\s+contratar|firmamos|cerramos\\s+el\\s+contrato|quiero\\s+ser\\s+cliente|queremos\\s+ser\\s+clientes',
    ),
  ],
  ['CONFIRMACION_PRESENTACION', palabrasCompletas('confirmo|confirmamos|confirmada|confirmado')],
  [
    'ACEPTACION',
    palabrasCompletas('acepto|aceptamos|me\\s+interesa|nos\\s+interesa|avancemos|adelante|de\\s+acuerdo'),
  ],
];

/** E5·T8: conditional / doubt markers that suppress any signal. */
const PATRON_DUDA = new RegExp(
  `${palabrasCompletas(
    'capaz|quiz[aá]s|tal\\s+vez|lo\\s+vemos|despu[eé]s\\s+te\\s+aviso|no\\s+s[eé]',
  ).source}|\\?`,
  'iu',
);

/**
 * E5·T8: the ONE place that decides the simulated close signal: none
 * without allowed closes or with doubt markers; otherwise the first
 * matching tipo (CONVERSION > CONFIRMACION > ACEPTACION), kept only
 * when it is in `cierresPosibles`.
 */
function senalCierreSimulada(entrada: EntradaGenerarRespuesta): SenalCierre | undefined {
  const permitidos = entrada.cierresPosibles ?? [];
  if (permitidos.length === 0 || PATRON_DUDA.test(entrada.consulta)) return undefined;
  const coincidencia = PATRONES_CIERRE.find(([, patron]) => patron.test(entrada.consulta));
  if (coincidencia === undefined || !permitidos.includes(coincidencia[0])) return undefined;
  return { tipo: coincidencia[0], confianza: CONFIANZA_CIERRE_SIMULADA };
}

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
    const respuesta = this.respuestaDeRama(entrada);
    const senalCierre = senalCierreSimulada(entrada);
    return senalCierre === undefined ? respuesta : { ...respuesta, senalCierre };
  }

  private respuestaDeRama(entrada: EntradaGenerarRespuesta): RespuestaGenerada {
    // E3·T2 FIRST arm: an indicación relays deterministically — the
    // offline demo and the tests must SEE the operator instruction.
    const indicacion = entrada.indicacionHumana?.trim() ?? '';
    if (indicacion !== '') {
      return {
        texto: `${PREFIJO_INDICACION}${indicacion.slice(0, LIMITE_INDICACION)}`,
        scoreConfianza: 0.8,
        fidelidad: FIDELIDAD_CON_FUENTE,
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
        fidelidad: FIDELIDAD_CON_FUENTE,
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
        fidelidad: FIDELIDAD_CON_FUENTE,
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
        fidelidad: FIDELIDAD_CON_FUENTE,
        enScope: true,
        requiereAyudaHumana: false,
        idsConocimiento: [],
        modelo: MODELO_SIMULADO,
      };
    }
    return {
      texto: TEXTO_DERIVACION,
      scoreConfianza: 0.1,
      fidelidad: FIDELIDAD_SIN_FUENTE,
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
