import { randomUUID } from 'node:crypto';

import type {
  EnviadorWhatsappCrmPort,
  EnvioWhatsappCrm,
  ResultadoEnvioWhatsapp,
} from '../../domain/ports';

/**
 * SIMULATED WhatsApp adapter (agente-ia-crm E1, "Simulación Kapso"):
 * returns ok immediately with a synthetic `sim.*` wamid so the whole
 * bandeja circuit (responder → persist → hilo) works BEFORE Kapso
 * credentials exist. Selected by default via KAPSO_MODO (see
 * crearEnviadorWhatsapp.ts); the wamid namespace `sim.` keeps every
 * simulated send distinguishable from a real one forever (the same
 * prefix the inbound simulator uses for wamids and idempotenciaKeys).
 *
 * Security: the log line carries NO message body (PII) — destination
 * phone and wamid only.
 */
export class EnviadorSimuladoWhatsapp implements EnviadorWhatsappCrmPort {
  async enviar(datos: EnvioWhatsappCrm): Promise<ResultadoEnvioWhatsapp> {
    const wamid = `sim.${randomUUID()}`;
    console.log(`[crm-whatsapp] envío simulado a ${datos.telefonoE164} (wamid ${wamid})`);
    return { ok: true, wamid };
  }
}
