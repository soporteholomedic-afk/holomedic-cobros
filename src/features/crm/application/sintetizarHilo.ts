import type { MensajeHistorialGeneracion, ObservacionMemoria } from '../domain/entities';

/**
 * Thread synthesis (agente-ia-crm E4·T3) — the PURE builder of the
 * compact Spanish block la Guía reads to keep the thread's gist
 * without re-reading every message: exchange counts, the topics
 * already treated (chat-memory titles) and the client's latest ask.
 * Pure: no I/O, no clock — every input is already prepared by the
 * motor (the SAME masked historial the prompt receives, so the
 * synthesis inherits the PII scrub).
 *
 * Shape (each line omitted when it has nothing to say; '' when the
 * whole block is empty):
 *   Intercambios: N del cliente, M de la Guía.
 *   Temas tratados: <títulos de memorias chat, viejo→nuevo por
 *   creadoEn cuando es utilizable; sin fechas utilizables se
 *   conserva el orden dado>.
 *   Último pedido del cliente: <cuerpo del último mensaje del
 *   cliente, una sola línea, ≤ 200 caracteres>.
 * Hard cap ~700 chars overall — overflow is cut at a line boundary
 * when possible (graceful, deterministic).
 */

/** Input of `sintetizarHilo` — the motor's already-masked pieces. */
export interface EntradaSintetizarHilo {
  /**
   * The thread tail the prompt already receives (oldest→newest,
   * phones masked): `emisor` 'CLIENTE' is the client side, 'IA'/
   * 'HUMANO' are la Guía's side of the thread.
   */
  historial: MensajeHistorialGeneracion[];
  /** Chat-level RANKED memories (E4·T3) — empty when memoria is off. */
  memoriasChat: ObservacionMemoria[];
}

/** Max chars of the client's last ask before truncation. */
const MAX_CARACTERES_PEDIDO = 200;
/** Hard cap of the whole synthesis block (~700 chars). */
const MAX_CARACTERES_SINTESIS = 700;

/** Usable timestamp: real (finite, post-epoch) instant — epoch = "no date". */
function esFechaUtil(fecha: Date): boolean {
  const tiempo = fecha.getTime();
  return Number.isFinite(tiempo) && tiempo > 0;
}

/** Single line: every whitespace run (incl. newlines) collapses to one space. */
function unaLinea(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** Cap at a line boundary when possible; deterministic and ≤ cap. */
function acotar(texto: string): string {
  if (texto.length <= MAX_CARACTERES_SINTESIS) return texto;
  let acumulado = '';
  for (const linea of texto.split('\n')) {
    const disponible = MAX_CARACTERES_SINTESIS - acumulado.length - (acumulado === '' ? 0 : 1);
    if (disponible <= 0) break;
    const pieza = linea.slice(0, Math.max(0, disponible));
    acumulado = acumulado === '' ? pieza : `${acumulado}\n${pieza}`;
  }
  return acumulado;
}

/**
 * Build the compact thread synthesis (see module docblock). Returns
 * '' when there is nothing to say (empty historial AND no chat
 * memories).
 */
export function sintetizarHilo(input: EntradaSintetizarHilo): string {
  const { historial, memoriasChat } = input;
  const lineas: string[] = [];

  if (historial.length > 0) {
    const delCliente = historial.filter((mensaje) => mensaje.emisor === 'CLIENTE').length;
    const deLaGuia = historial.length - delCliente;
    lineas.push(`Intercambios: ${delCliente} del cliente, ${deLaGuia} de la Guía.`);
  }

  if (memoriasChat.length > 0) {
    // Viejo→nuevo por creadoEn; fechas no utilizables (epoch/inválidas)
    // conservan el orden dado al final, con estabilidad por índice.
    const ordenadas = memoriasChat
      .map((observacion, indice) => ({
        observacion,
        indice,
        clave: esFechaUtil(observacion.creadoEn)
          ? observacion.creadoEn.getTime()
          : Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.clave - b.clave || a.indice - b.indice)
      .map((entrada) => entrada.observacion);
    lineas.push(`Temas tratados: ${ordenadas.map((o) => o.titulo).join('; ')}.`);
  }

  const ultimoCliente = [...historial].reverse().find((m) => m.emisor === 'CLIENTE');
  if (ultimoCliente !== undefined) {
    const pedido = unaLinea(ultimoCliente.texto).slice(0, MAX_CARACTERES_PEDIDO);
    lineas.push(`Último pedido del cliente: ${pedido}`);
  }

  return acotar(lineas.join('\n'));
}
