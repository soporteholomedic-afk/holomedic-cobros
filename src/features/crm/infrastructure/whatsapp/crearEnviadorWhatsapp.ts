import type { EnviadorWhatsappCrmPort } from '../../domain/ports';

import { EnviadorKapsoWhatsapp } from './enviadorKapsoWhatsapp';
import { EnviadorSimuladoWhatsapp } from './enviadorSimuladoWhatsapp';

/**
 * Adapter factory for the WhatsApp outbound port (agente-ia-crm E1,
 * "Simulación Kapso"): KAPSO_MODO selects the REAL Kapso adapter
 * ('real') or the simulator (anything else — the DEFAULT, because
 * Kapso is not configured yet). When the credentials arrive, setting
 * KAPSO_MODO=real (+ KAPSO_API_KEY / KAPSO_PHONE_NUMBER_ID) switches
 * the whole outbound canal with zero code changes.
 */

/** true when the outbound canal runs SIMULADO (KAPSO_MODO !== 'real'). */
export function esModoSimulado(): boolean {
  return process.env.KAPSO_MODO !== 'real';
}

export function crearEnviadorWhatsapp(): EnviadorWhatsappCrmPort {
  return esModoSimulado() ? new EnviadorSimuladoWhatsapp() : new EnviadorKapsoWhatsapp();
}
