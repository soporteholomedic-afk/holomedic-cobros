import type {
  MensajeCrm,
  SenalCierre,
  TipoCierreAgente,
  TipoEmpresa,
} from '../domain/entities';
import type { EstadoPipeline } from '../domain/maquinaEstados';
import type {
  Clock,
  ConversacionCrmRepository,
  CrmEmpresaRepositoryPort,
  CrmPipelineRepositoryPort,
  EnviadorWhatsappCrmPort,
  MensajeCrmRepository,
} from '../domain/ports';
import { CambiarTipoUseCase } from './cambiarTipo';
import type { ConfigAgente } from './configAgente';
import { RegistrarTransicionUseCase } from './registrarTransicion';

/** Audit actor stamped on every close La Guía executes. */
export const USUARIO_AGENTE = 'La Guía (agente)';

/** Closing is higher-stakes than answering: the configured umbral never lowers this floor. */
export const UMBRAL_CIERRE_MINIMO = 0.8;

/**
 * Fixed client confirmation per close. NEVER LLM-generated and never
 * promises prices, dates or deliverables.
 */
export const TEXTO_CONFIRMACION_CIERRE: Readonly<Record<TipoCierreAgente, string>> = {
  ACEPTACION:
    '¡Gracias! Dejé registrado tu interés y en breve un asesor de Holomedic se comunica con vos para los próximos pasos.',
  CONFIRMACION_PRESENTACION:
    '¡Perfecto! Dejé registrada la confirmación de la presentación. Cualquier cambio, avisame por acá.',
  CONVERSION_CLIENTE:
    '¡Bienvenido a Holomedic! Dejé registrado el alta y un asesor te acompaña con los siguientes pasos.',
};

export type MotivoCierreRechazado =
  | 'AGENTE_DESHABILITADO'
  | 'CONFIANZA_INSUFICIENTE'
  | 'CONVERSACION_NO_ENCONTRADA'
  | 'CONVERSACION_NO_ACTIVA_IA'
  | 'CONTACTO_NO_VINCULADO'
  | 'CIERRE_NO_APLICA';

export type ResultadoCierreAgente =
  | {
      cerrado: true;
      tipo: TipoCierreAgente;
      confirmacion: 'ENVIADA' | 'FALLIDA';
      mensajeId: number | null;
    }
  | { cerrado: false; motivo: MotivoCierreRechazado };

export interface CerrarTratoAgenteInput {
  conversacionId: number;
  senal: SenalCierre;
  config: ConfigAgente;
}

export interface CerrarTratoAgenteDeps {
  conversaciones: ConversacionCrmRepository;
  mensajes: MensajeCrmRepository;
  empresas: CrmEmpresaRepositoryPort;
  pipelines: CrmPipelineRepositoryPort;
  whatsapp: EnviadorWhatsappCrmPort;
  clock: Clock;
}

/**
 * Closes the agent may legitimately execute from a given state. Single
 * source of truth: the validator below and the prompt's `cierresPosibles`.
 */
export function cierresPosiblesDe(
  estado: EstadoPipeline | null,
  tipoEmpresa: TipoEmpresa,
): TipoCierreAgente[] {
  if (estado === null) return [];
  const posibles: TipoCierreAgente[] = [];
  if (estado.flujo === 'OUTBOUND' && estado.etapa === 'CADENCIA') posibles.push('ACEPTACION');
  if (estado.flujo === 'INBOUND' && estado.etapa === 'PRESENTACION') {
    posibles.push('CONFIRMACION_PRESENTACION');
  }
  if (tipoEmpresa === 'Prospecto' && estado.etapa !== 'RECHAZADO') posibles.push('CONVERSION_CLIENTE');
  return posibles;
}

/** Typed error code for logs — never the message (may carry PII). */
function codigoDeError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const codigo = (error as { codigo?: unknown }).codigo;
    if (typeof codigo === 'string') return codigo;
  }
  return error instanceof Error ? error.name : 'ERROR_DESCONOCIDO';
}

/**
 * CerrarTratoAgenteUseCase (E5·T9) — hybrid close. The model only
 * PROPOSES a `SenalCierre`; this use case is the deterministic
 * validator + executor: kill switch, a confidence floor, an ACTIVA_IA
 * linked conversation and a state that really allows the close. Any
 * failed rule means no side effect at all. The state change is
 * persisted FIRST (a failure propagates; the client was told nothing),
 * then a fixed confirmation goes out through the outbox-lite pattern.
 * A failed confirmation never undoes the registered close.
 */
export class CerrarTratoAgenteUseCase {
  private readonly registrarTransicion: RegistrarTransicionUseCase;
  private readonly cambiarTipo: CambiarTipoUseCase;

  constructor(private readonly deps: CerrarTratoAgenteDeps) {
    this.registrarTransicion = new RegistrarTransicionUseCase(deps.pipelines, deps.clock);
    this.cambiarTipo = new CambiarTipoUseCase(deps.empresas, deps.pipelines, deps.clock);
  }

  async execute(input: CerrarTratoAgenteInput): Promise<ResultadoCierreAgente> {
    const { conversacionId, senal, config } = input;

    if (!config.habilitado) return { cerrado: false, motivo: 'AGENTE_DESHABILITADO' };

    const umbral = Math.max(config.umbralConfianza, UMBRAL_CIERRE_MINIMO);
    if (!Number.isFinite(senal.confianza) || senal.confianza < umbral) {
      return { cerrado: false, motivo: 'CONFIANZA_INSUFICIENTE' };
    }

    const conversacion = await this.deps.conversaciones.obtenerPorId(conversacionId);
    if (!conversacion) return { cerrado: false, motivo: 'CONVERSACION_NO_ENCONTRADA' };
    if (conversacion.estado !== 'ACTIVA_IA') {
      return { cerrado: false, motivo: 'CONVERSACION_NO_ACTIVA_IA' };
    }
    const { empresaId, contactoId, telefono } = conversacion;
    if (empresaId === null || contactoId === null || telefono === null) {
      return { cerrado: false, motivo: 'CONTACTO_NO_VINCULADO' };
    }

    const empresa = await this.deps.empresas.obtenerPorId(empresaId);
    const pipeline = await this.deps.pipelines.obtenerPorEmpresaId(empresaId);
    if (!empresa || !pipeline) return { cerrado: false, motivo: 'CIERRE_NO_APLICA' };
    const estado: EstadoPipeline = { flujo: pipeline.flujo, etapa: pipeline.etapa };
    if (!cierresPosiblesDe(estado, empresa.tipo).includes(senal.tipo)) {
      return { cerrado: false, motivo: 'CIERRE_NO_APLICA' };
    }

    await this.ejecutarCierre(empresaId, senal);

    const { confirmacion, mensajeId } = await this.confirmarAlCliente(
      conversacionId,
      telefono,
      TEXTO_CONFIRMACION_CIERRE[senal.tipo],
    );
    return { cerrado: true, tipo: senal.tipo, confirmacion, mensajeId };
  }

  private async ejecutarCierre(empresaId: number, senal: SenalCierre): Promise<void> {
    if (senal.tipo === 'CONVERSION_CLIENTE') {
      await this.cambiarTipo.execute({ empresaId, nuevoTipo: 'Cliente', usuario: USUARIO_AGENTE });
      return;
    }
    await this.registrarTransicion.execute({
      empresaId,
      evento: senal.tipo === 'ACEPTACION' ? 'AceptaciónInbound' : 'ConfirmaciónPresentación',
      motivo: `Cierre autónomo de La Guía: ${senal.tipo} (confianza ${senal.confianza.toFixed(2)})`,
      usuario: USUARIO_AGENTE,
      actor: 'AGENTE',
    });
  }

  /** Outbox-lite send; every failure is logged (ids/codes only) and reported, never thrown. */
  private async confirmarAlCliente(
    conversacionId: number,
    telefono: string,
    cuerpo: string,
  ): Promise<{ confirmacion: 'ENVIADA' | 'FALLIDA'; mensajeId: number | null }> {
    let mensaje: MensajeCrm;
    try {
      mensaje = await this.deps.mensajes.crear({
        conversacionId,
        direccion: 'OUT',
        emisor: 'IA',
        cuerpo,
        tipo: 'TEXTO',
        canal: 'WHATSAPP',
        wamid: null,
        idempotenciaKey: null,
        estadoEnvio: 'PENDIENTE',
        fuentes: '[]',
        score: null,
        fidelidad: null,
        modelo: null,
        promptVersion: null,
      });
    } catch (error) {
      console.error('[cerrarTratoAgente] persistir confirmación falló', {
        conversacionId,
        error: codigoDeError(error),
      });
      return { confirmacion: 'FALLIDA', mensajeId: null };
    }

    let wamid: string | null = null;
    let enviado = false;
    try {
      const envio = await this.deps.whatsapp.enviar({ telefonoE164: telefono, cuerpo });
      if (envio.ok) {
        enviado = true;
        wamid = envio.wamid;
      } else {
        console.error('[cerrarTratoAgente] envío de confirmación falló', {
          conversacionId,
          mensajeId: mensaje.id,
          error: envio.error,
        });
      }
    } catch (error) {
      console.error('[cerrarTratoAgente] envío de confirmación lanzó', {
        conversacionId,
        mensajeId: mensaje.id,
        error: codigoDeError(error),
      });
    }

    if (!enviado) {
      await this.marcar(mensaje.id, { estadoEnvio: 'FALLIDO' });
      return { confirmacion: 'FALLIDA', mensajeId: mensaje.id };
    }

    await this.marcar(mensaje.id, { estadoEnvio: 'ENVIADO', wamid });
    try {
      await this.deps.conversaciones.registrarActividad(conversacionId, 'OUT');
    } catch (error) {
      console.error('[cerrarTratoAgente] registrar actividad OUT falló', {
        conversacionId,
        mensajeId: mensaje.id,
        error: codigoDeError(error),
      });
    }
    return { confirmacion: 'ENVIADA', mensajeId: mensaje.id };
  }

  private async marcar(
    mensajeId: number,
    datos: { estadoEnvio: 'ENVIADO' | 'FALLIDO'; wamid?: string | null },
  ): Promise<void> {
    try {
      await this.deps.mensajes.actualizarEnvio(mensajeId, datos);
    } catch (error) {
      console.error('[cerrarTratoAgente] marcado de envío falló', {
        mensajeId,
        estadoEnvio: datos.estadoEnvio,
        error: codigoDeError(error),
      });
    }
  }
}
