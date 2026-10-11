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
 * Security: the log line carries NO message body and NO full phone
 * (both PII) — destination masked to its last 4 digits plus the body
 * LENGTH only; the synthetic `sim.` wamid is not PII and stays for
 * tracing.
 */
export class EnviadorSimuladoWhatsapp implements EnviadorWhatsappCrmPort {
  async enviar(datos: EnvioWhatsappCrm): Promise<ResultadoEnvioWhatsapp> {
    const wamid = `sim.${randomUUID()}`;
    // Log de 1 línea: teléfono enmascarado (últimos 4) + largo del
    // cuerpo — nunca el cuerpo completo ni el número completo.
    const telefonoEnmascarado = `****${datos.telefonoE164.slice(-4)}`;
    console.log(
      `[crm-whatsapp] envío simulado a ${telefonoEnmascarado} ` +
        `(cuerpo ${datos.cuerpo.length} caracteres, wamid ${wamid})`,
    );
    return { ok: true, wamid };
  }
}
