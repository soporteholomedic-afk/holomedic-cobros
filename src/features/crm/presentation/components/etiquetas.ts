import { UMBRAL_INTENTOS, type Empresa } from '../../domain/entities';
import { formatoRelativo } from './fechas';

export type TipoEtiqueta = 'conversamos' | 'sin_respuesta' | 'falta_responder' | 'intentos';

export interface EtiquetaTarjeta {
  tipo: TipoEtiqueta;
  texto: string;
}

const cerrada = (e: Empresa): boolean => e.etapa === 'cliente' || e.etapa === 'perdido';

/**
 * Follow-up label of a card (spec S4, L8). A pending inbound reply wins over
 * everything; Contactado then shows "Sin respuesta · N" or "Conversamos";
 * other open columns only count failed attempts.
 */
export function etiquetaDeTarjeta(e: Empresa, ahora: Date): EtiquetaTarjeta | null {
  if (e.faltaResponderDesde && e.etapa !== 'perdido') {
    return { tipo: 'falta_responder', texto: `Falta responder · ${formatoRelativo(e.faltaResponderDesde, ahora)}` };
  }
  const n = e.intentosSinRespuesta;
  if (e.etapa === 'contactado') {
    return n > 0 ? { tipo: 'sin_respuesta', texto: `Sin respuesta · ${n}` } : { tipo: 'conversamos', texto: 'Conversamos' };
  }
  if (n > 0 && !cerrada(e)) {
    return { tipo: 'intentos', texto: `${n} ${n === 1 ? 'intento' : 'intentos'} sin respuesta` };
  }
  return null;
}

/** "Pasar a Perdido" suggestion (spec S2): only suggested, never automatic. */
export function sugerenciaVisible(e: Empresa): boolean {
  return (
    e.intentosSinRespuesta >= UMBRAL_INTENTOS && !cerrada(e) && e.intentosSinRespuesta !== e.sugerenciaDescartadaEn
  );
}

export const textoSugerencia = (e: Empresa): string =>
  `${e.intentosSinRespuesta} intentos sin respuesta. ¿Pasar a Perdido con el motivo «No contestan»?`;

export type EstadoProximaAccion = 'ninguna' | 'vencida' | 'hoy' | 'futura';

export function estadoProximaAccion(e: Empresa, hoy: string): EstadoProximaAccion {
  if (!e.proximaAccion || cerrada(e)) return 'ninguna';
  if (e.proximaAccion.fecha < hoy) return 'vencida';
  return e.proximaAccion.fecha === hoy ? 'hoy' : 'futura';
}

export const faltaRuc = (e: Empresa): boolean => e.ruc === null;
