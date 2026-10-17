import { resolverConfigCanalKapso } from '../../application/configCanalKapso';
import type {
  ConfigCrmRepository,
  EnviadorWhatsappCrmPort,
  ResultadoEnvioWhatsapp,
} from '../../domain/ports';

import { EnviadorKapsoWhatsapp } from './enviadorKapsoWhatsapp';
import { EnviadorSimuladoWhatsapp } from './enviadorSimuladoWhatsapp';

/**
 * Adapter factory for the WhatsApp outbound port (agente-ia-crm E1,
 * "Simulación Kapso"; remediation R1-simulador-default-prod +
 * R4-default-simulado-silent — the SILENT default-to-simulator is
 * gone). KAPSO_MODO semantics:
 * - 'real' → EnviadorKapsoWhatsapp.
 * - 'simulado' (explicit) → simulator, ALSO in production: a
 *   conscious opt-in, no warning.
 * - unset (or any other value) → environment decides: development
 *   gets the simulator + ONE console.warn per process; production
 *   FAILS CLOSED — an adapter whose every send returns
 *   KAPSO_NO_CONFIGURADO + ONE console.error per process explaining
 *   how to configure. Production never simulates silently: without
 *   Kapso credentials the outbound canal errors visibly instead of
 *   faking successful sends.
 */

/**
 * Fail-closed adapter (production without KAPSO_MODO): every send
 * fails with the same typed code the un-credentialed Kapso adapter
 * uses — the responder use case logs the FALLIDO audit row and the
 * bandeja shows the failed attempt.
 */
class EnviadorFailClosedWhatsapp implements EnviadorWhatsappCrmPort {
  async enviar(): Promise<ResultadoEnvioWhatsapp> {
    return {
      ok: false,
      error: 'KAPSO_NO_CONFIGURADO',
      detalle:
        'Producción sin KAPSO_MODO: envío WhatsApp deshabilitado (fail closed). ' +
        'Configurá KAPSO_MODO=real con KAPSO_API_KEY y KAPSO_PHONE_NUMBER_ID, ' +
        'o KAPSO_MODO=simulado para un opt-in consciente del simulador.',
    };
  }
}

/** Avisa el default UNA vez por proceso (la factory se llama por request). */
let avisoModoDefaultMostrado = false;

function avisarModoDefaultUnaVez(esProduccion: boolean): void {
  if (avisoModoDefaultMostrado) return;
  avisoModoDefaultMostrado = true;
  if (esProduccion) {
    console.error(
      '[crm-whatsapp] PRODUCCIÓN sin KAPSO_MODO: el envío WhatsApp está DESHABILITADO ' +
        '(fail closed, KAPSO_NO_CONFIGURADO). Configurá KAPSO_MODO=real + KAPSO_API_KEY + ' +
        'KAPSO_PHONE_NUMBER_ID, o KAPSO_MODO=simulado para optar conscientemente al simulador.',
    );
    return;
  }
  console.warn('[crm-whatsapp] modo simulado por defecto — seteá KAPSO_MODO=real al conectar Kapso');
}

/**
 * true solo cuando el adapter elegido ES el simulador: KAPSO_MODO=simulado
 * (explícito, también en prod) o sin MODO en development. En producción sin
 * modo → false (la UI no muestra el simulador; el envío falla cerrado).
 */
export function esModoSimulado(): boolean {
  const modo = process.env.KAPSO_MODO;
  if (modo === 'simulado') return true;
  if (modo === 'real') return false;
  return process.env.NODE_ENV !== 'production';
}

export function crearEnviadorWhatsapp(): EnviadorWhatsappCrmPort {
  const modo = process.env.KAPSO_MODO;
  if (modo === 'real') return new EnviadorKapsoWhatsapp();
  if (modo === 'simulado') return new EnviadorSimuladoWhatsapp();
  if (process.env.NODE_ENV === 'production') {
    avisarModoDefaultUnaVez(true);
    return new EnviadorFailClosedWhatsapp();
  }
  avisarModoDefaultUnaVez(false);
  return new EnviadorSimuladoWhatsapp();
}

export interface DepsEnviadorConfigurable {
  /** Runtime config repo; when undefined the env behavior applies. */
  config?: Pick<ConfigCrmRepository, 'listar'>;
}

/**
 * Same selection rules as the env factories, but over the effective
 * runtime config (DB over env, resolved per call — no cache).
 */
export async function esModoSimuladoConfigurable(
  deps: DepsEnviadorConfigurable,
): Promise<boolean> {
  if (deps.config === undefined) return esModoSimulado();
  const { modo } = await resolverConfigCanalKapso({ config: deps.config });
  if (modo === 'simulado') return true;
  if (modo === 'real') return false;
  return process.env.NODE_ENV !== 'production';
}

export async function crearEnviadorWhatsappConfigurable(
  deps: DepsEnviadorConfigurable,
): Promise<EnviadorWhatsappCrmPort> {
  if (deps.config === undefined) return crearEnviadorWhatsapp();
  const config = await resolverConfigCanalKapso({ config: deps.config });
  if (config.modo === 'real') {
    return new EnviadorKapsoWhatsapp({
      apiKey: config.apiKey,
      phoneNumberId: config.phoneNumberId,
      timeoutMs: config.timeoutMs,
    });
  }
  if (config.modo === 'simulado') return new EnviadorSimuladoWhatsapp();
  if (process.env.NODE_ENV === 'production') {
    avisarModoDefaultUnaVez(true);
    return new EnviadorFailClosedWhatsapp();
  }
  avisarModoDefaultUnaVez(false);
  return new EnviadorSimuladoWhatsapp();
}

/** Test-only: resetea el flag de aviso-una-vez entre tests. */
export function __resetAvisosModoForTests(): void {
  avisoModoDefaultMostrado = false;
}
