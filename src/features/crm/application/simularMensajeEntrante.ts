import { randomUUID } from 'node:crypto';

import { ValidationError } from '../domain/errors';
import { normalizarTelefonoE164 } from '../domain/normalizar';

import type { ProcesarMensajeWhatsappUseCase } from './procesarMensajeWhatsapp';

/**
 * SimularMensajeEntranteUseCase (agente-ia-crm E1, "Simulación
 * Kapso") — the inbound simulator: while Kapso has no credentials,
 * this use case synthesizes the SAME `whatsapp.message.received`
 * event the webhook receives and delegates to the REAL pipeline
 * (ProcesarMensajeWhatsappUseCase), so the whole circuit (ingesta →
 * vinculación → bandeja → respuesta manual) is demoable end-to-end
 * with zero code duplication.
 *
 * Guard: KAPSO_MODO === 'real' RECHAZA (SimulacionDesactivadaError)
 * — the simulator reads the env directly (testable with vi.stubEnv)
 * and must be impossible to trigger in production.
 */

/** Typed 403: the simulator only exists while KAPSO_MODO !== 'real'. */
export class SimulacionDesactivadaError extends Error {
  readonly code = 'SIMULACION_DESACTIVADA' as const;

  constructor() {
    super('El simulador solo está disponible con KAPSO_MODO=simulado');
    this.name = 'SimulacionDesactivadaError';
  }
}

export interface SimularMensajeEntranteDeps {
  procesar: ProcesarMensajeWhatsappUseCase;
}

export interface ResultadoSimulacion {
  conversacionId: number | null;
  mensajeId: number | null;
  vinculado: boolean;
  /** E2·T5: id of the durable agent task created for this message
   * (null when the conversation is not IA-managed). The use case
   * returns the full ResultadoProcesarMensaje; this field is part
   * of the contract so routes can drain the queue without casts. */
  tareaAgenteId: number | null;
}

export class SimularMensajeEntranteUseCase {
  constructor(private readonly deps: SimularMensajeEntranteDeps) {}

  async ejecutar(entrada: { telefono: string; texto: string }): Promise<ResultadoSimulacion> {
    if (process.env.KAPSO_MODO === 'real') {
      throw new SimulacionDesactivadaError();
    }

    // Normalización E.164 primero: la clave de ruteo de la conversación.
    const e164 = normalizarTelefonoE164(entrada.telefono);
    if (e164 === null) {
      throw new ValidationError('El teléfono no es un número válido');
    }

    // El evento sintético espeja el payload Kapso: `from` son los
    // dígitos SIN '+' ('+595981234567' → '595981234567'), timestamp en
    // segundos como string, wamid y clave de idempotencia en el
    // espacio `sim.*` — distinguibles de los reales para siempre.
    const uuid = randomUUID();
    return this.deps.procesar.ejecutar({
      idempotenciaKey: `sim.${uuid}`,
      message: {
        id: `sim.wamid.${uuid}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        from: e164.replace('+', ''),
        text: { body: entrada.texto },
      },
    });
  }
}
