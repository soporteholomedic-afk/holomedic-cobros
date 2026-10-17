import type { TipoCierreAgente } from './entities';

/**
 * Fixed client confirmation per close. NEVER LLM-generated and never
 * promises prices, dates or deliverables. Lives in the domain so both
 * the close use case (sender) and the thread UI (marker) share it.
 */
export const TEXTO_CONFIRMACION_CIERRE: Readonly<Record<TipoCierreAgente, string>> = {
  ACEPTACION:
    '¡Gracias! Dejé registrado tu interés y en breve un asesor de Holomedic se comunica con vos para los próximos pasos.',
  CONFIRMACION_PRESENTACION:
    '¡Perfecto! Dejé registrada la confirmación de la presentación. Cualquier cambio, avisame por acá.',
  CONVERSION_CLIENTE:
    '¡Bienvenido a Holomedic! Dejé registrado el alta y un asesor te acompaña con los siguientes pasos.',
};

/** True when `cuerpo` (trimmed) is exactly one of the fixed close confirmations. */
export function esTextoConfirmacionCierre(cuerpo: string): boolean {
  const recortado = cuerpo.trim();
  return Object.values(TEXTO_CONFIRMACION_CIERRE).includes(recortado);
}
