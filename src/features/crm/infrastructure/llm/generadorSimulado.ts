import type {
  EntradaDestilacion,
  EntradaGenerarRespuesta,
  ObservacionDestilada,
  RespuestaGenerada,
} from '../../domain/entities';
import type { GeneradorRespuestaPort } from '../../domain/ports';

/**
 * SIMULATED response-generator adapter (agente-ia-crm E2·T3): a
 * deterministic GeneradorRespuestaPort — no network, no timers, no
 * randomness — selected by default in development via
 * crearGeneradorRespuesta (missing LLM_API_KEY) so the E2 DoD demo
 * runs without an API key. Branches:
 * - conocimiento non-empty → the FIRST fragment's contenido (trimmed
 *   to 400 chars; a safe prefix + titulo when the contenido is blank),
 *   scoreConfianza 0.8, enScope true, citing that fragment's id.
 * - solo memorias → the FIRST memoria's contenido the same way, with
 *   NO knowledge ids (memories are not KB citations).
 * - both empty → escalation: enScope false, requiereAyudaHumana true,
 *   scoreConfianza 0.1, fixed safe deferral texto.
 * destilar emits exactly ONE hecho_cliente observation (first 8 words
 * of the consulta as titulo, consulta trimmed to 200 chars, never
 * pinear); an empty consulta distills to NOTHING.
 *
 * Security: this fake keeps every input strictly in process memory
 * and logs NOTHING.
 */

const TEXTO_DERIVACION =
  'Gracias por tu consulta. En breve te confirma una persona del equipo de Holomedic.';
const PREFIJO_SEGURO = 'Información disponible: ';
const LIMITE_TEXTO = 400;
const LIMITE_TITULO_PALABRAS = 8;
const LIMITE_CONTENIDO_DESTILACION = 200;
const TITULO_VACIO = 'Consulta cliente';

/** Prompt fragment body → simulated texto (400-char cap, safe fallback). */
function textoSimulado(contenido: string, titulo: string): string {
  const recortado = contenido.trim().slice(0, LIMITE_TEXTO);
  if (recortado !== '') return recortado;
  return `${PREFIJO_SEGURO}${titulo}`.slice(0, LIMITE_TEXTO);
}

/** First 8 whitespace-separated words of the consulta (deterministic). */
function tituloDeConsulta(consulta: string): string {
  const palabras = consulta.split(/\s+/).filter((palabra) => palabra !== '');
  if (palabras.length === 0) return TITULO_VACIO;
  return palabras.slice(0, LIMITE_TITULO_PALABRAS).join(' ');
}

export class GeneradorSimulado implements GeneradorRespuestaPort {
  async generarRespuesta(entrada: EntradaGenerarRespuesta): Promise<RespuestaGenerada> {
    const primerConocimiento = entrada.conocimiento[0];
    if (primerConocimiento !== undefined) {
      return {
        texto: textoSimulado(primerConocimiento.contenido, primerConocimiento.titulo),
        scoreConfianza: 0.8,
        enScope: true,
        requiereAyudaHumana: false,
        idsConocimiento: [primerConocimiento.id],
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
      };
    }
    return {
      texto: TEXTO_DERIVACION,
      scoreConfianza: 0.1,
      enScope: false,
      requiereAyudaHumana: true,
      idsConocimiento: [],
    };
  }

  async destilar(entrada: EntradaDestilacion): Promise<ObservacionDestilada[]> {
    const consulta = entrada.consulta.trim();
    if (consulta === '') return [];
    return [
      {
        tipo: 'hecho_cliente',
        titulo: tituloDeConsulta(consulta),
        contenido: consulta.slice(0, LIMITE_CONTENIDO_DESTILACION),
        pinear: false,
      },
    ];
  }
}
