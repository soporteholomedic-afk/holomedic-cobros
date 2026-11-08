import { ETAPAS_CERRADAS, UMBRAL_INTENTOS, type Empresa, type Oportunidad } from '../../domain/entities';
import { formatoRelativo } from './fechas';

export type TipoEtiqueta = 'conversamos' | 'sin_respuesta' | 'falta_responder' | 'intentos';

export interface EtiquetaTarjeta {
  tipo: TipoEtiqueta;
  texto: string;
}

/** Whether the negotiation of this card is over (won or lost) — spec S2. */
const cerrada = (o: Oportunidad): boolean => ETAPAS_CERRADAS.includes(o.etapa);

/**
 * Follow-up status label of a card (spec S2), computed from the OPORTUNIDAD.
 * A pending inbound reply wins over everything; Contactado then shows
 * "Sin respuesta · N" or "Conversamos"; other open stages only count failed
 * attempts.
 */
export function etiquetaDeTarjeta(o: Oportunidad, ahora: Date): EtiquetaTarjeta | null {
  if (o.faltaResponderDesde && o.etapa !== 'perdida') {
    return { tipo: 'falta_responder', texto: `Falta responder · ${formatoRelativo(o.faltaResponderDesde, ahora)}` };
  }
  const n = o.intentosSinRespuesta;
  if (o.etapa === 'contactado') {
    return n > 0 ? { tipo: 'sin_respuesta', texto: `Sin respuesta · ${n}` } : { tipo: 'conversamos', texto: 'Conversamos' };
  }
  if (n > 0 && !cerrada(o)) {
    return { tipo: 'intentos', texto: `${n} ${n === 1 ? 'intento' : 'intentos'} sin respuesta` };
  }
  return null;
}

/** "Pasar a Perdida" suggestion (spec S2): only suggested, never automatic. */
export function sugerenciaVisible(o: Oportunidad): boolean {
  return o.intentosSinRespuesta >= UMBRAL_INTENTOS && !cerrada(o) && o.intentosSinRespuesta !== o.sugerenciaDescartadaEn;
}

export const textoSugerencia = (o: Oportunidad): string =>
  `${o.intentosSinRespuesta} intentos sin respuesta. ¿Pasar a Perdida con el motivo «No contestan»?`;

export type EstadoProximaAccion = 'ninguna' | 'vencida' | 'hoy' | 'futura';

export function estadoProximaAccion(o: Oportunidad, hoy: string): EstadoProximaAccion {
  if (!o.proximaAccion || cerrada(o)) return 'ninguna';
  if (o.proximaAccion.fecha < hoy) return 'vencida';
  return o.proximaAccion.fecha === hoy ? 'hoy' : 'futura';
}

/** The RUC lives on the empresa ficha; the card reads it through the join. */
export const faltaRuc = (e: Empresa): boolean => e.ruc === null;
