import type { Contacto, Empresa, PipelineEmpresa } from '../domain/entities';
import { esReinicioDeCadencia, fechaHoy } from '../domain/cadence';
import { aplicarEnvioCadencia } from '../domain/envioCadencia';
import { NotFoundError, ValidationError } from '../domain/errors';
import { PLANTILLAS_CORREO } from '../domain/plantillasCorreo';
import type {
  Clock,
  CrmActividadesRepositoryPort,
  CrmEmpresaRepositoryPort,
  CrmEnviosCorreoRepositoryPort,
  CrmPipelineRepositoryPort,
  EnviadorCorreoCrmPort,
  PlantillaCrmKey,
  ResultadoEnvioCrm,
} from '../domain/ports';
import type { EventoPipeline } from '../domain/maquinaEstados';

import { RegistrarEnvioCadenciaUseCase } from './registrarEnvioCadencia';
import { RegistrarTransicionUseCase } from './registrarTransicion';

/**
 * EnviarCorreoCrmUseCase (tasks 5.1/5.3, design D5, spec EM-4/EM-6) —
 * ONE manual per-company dispatch. Order is the design's contract:
 * resolve contacto/correo → resolve the machine plan (an illegal
 * target throws BEFORE anything is dispatched) → SMTP FIRST → machine
 * write through the EXISTING use cases (audit intact) → ENVIADO log
 * LAST. SMTP failure logs ONE FALLIDO row (messageId null) and throws
 * the typed `FalloEnvioCorreoError` with the pipeline untouched — the
 * same panel button is the sin_carta retry path, and the counter
 * never advances without a sent email. Mapping: carta T7/T2;
 * reactivacion T15 from RECHAZADO or the cadencia path from an
 * expired DESCANSO (T9); seguimiento_1..3 the cadencia path (auto
 * T8 on the 4th OUTBOUND send).
 */

/** Body of `POST /api/crm/empresas/[id]/envios` (route arrives in 5.2). */
export interface EnviarCorreoCrmInput {
  empresaId: number;
  plantilla: PlantillaCrmKey;
  /** Acting session user (CRM_EnviosCorreos.usuario audit). */
  usuario: string;
}

export interface ResultadoEnviarCorreoCrm {
  /** The CRM_EnviosCorreos ENVIADO row id (BIGINT as number). */
  envioId: number;
  plantilla: PlantillaCrmKey;
  destinatario: string;
  contactoId: number;
  /** The freshly persisted pipeline row (post machine write). */
  pipeline: PipelineEmpresa;
}

/** Typed SMTP failure: the code surfaces verbatim; the route answers a
 * user-safe 500 — the diagnostic detail lives in the FALLIDO row only. */
export class FalloEnvioCorreoError extends Error {
  constructor(
    readonly codigo: Extract<ResultadoEnvioCrm, { ok: false }>['error'],
    readonly detalle: string,
  ) {
    super(`El correo no pudo enviarse (${codigo})`);
    this.name = 'FalloEnvioCorreoError';
  }
}

/** Ports + clock the use case orchestrates (route composes the object). */
export interface EnviarCorreoCrmDeps {
  empresas: CrmEmpresaRepositoryPort;
  pipelines: CrmPipelineRepositoryPort;
  actividades: CrmActividadesRepositoryPort;
  envios: CrmEnviosCorreoRepositoryPort;
  correo: EnviadorCorreoCrmPort;
  clock: Clock;
}

/** The machine write a successful dispatch will trigger. */
type PlanEscritura =
  | { via: 'transicion'; evento: EventoPipeline }
  | { via: 'cadencia' };

export class EnviarCorreoCrmUseCase {
  private readonly transiciones: RegistrarTransicionUseCase;
  private readonly cadencias: RegistrarEnvioCadenciaUseCase;

  constructor(private readonly deps: EnviarCorreoCrmDeps) {
    // Existing write paths, composed ONCE (design D5: audit intact).
    this.transiciones = new RegistrarTransicionUseCase(deps.pipelines, deps.clock);
    this.cadencias = new RegistrarEnvioCadenciaUseCase(deps.pipelines, deps.actividades, deps.clock);
  }

  async execute(input: EnviarCorreoCrmInput): Promise<ResultadoEnviarCorreoCrm> {
    // 1. Empresa → principal contacto → correo.
    const empresa = await this.deps.empresas.obtenerPorId(input.empresaId);
    if (!empresa) throw new NotFoundError('Empresa no encontrada');
    const contacto = resolverContacto(empresa);
    const destinatario = contacto.correos[0]?.correo;
    if (destinatario === undefined) {
      throw new ValidationError(`El contacto "${contacto.nombre}" no tiene un correo registrado`);
    }

    // 2. Machine plan BEFORE dispatch — illegal targets send nothing.
    const fila = await this.deps.pipelines.obtenerPorEmpresaId(input.empresaId);
    if (!fila) throw new NotFoundError('La empresa no se encuentra en el pipeline');
    const plan = resolverPlan(fila, input.plantilla, fechaHoy(this.deps.clock));

    // 3. SMTP FIRST — the counter NEVER advances without a sent email.
    const resultado = await this.deps.correo.enviar({
      destinatario,
      plantilla: input.plantilla,
      empresa: empresa.razonSocial,
      contacto: contacto.nombre,
      sector: empresa.sector ?? null,
      trabajadores: empresa.cantidadTrabajadores ?? null,
    });
    if (!resultado.ok) {
      await this.deps.envios.registrar({
        empresaId: input.empresaId,
        contactoId: contacto.id,
        plantilla: input.plantilla,
        destinatario,
        messageId: null,
        estado: 'FALLIDO',
        errorInfo: `${resultado.error}: ${resultado.detalle}`.slice(0, 500),
        usuario: input.usuario,
      });
      throw new FalloEnvioCorreoError(resultado.error, resultado.detalle);
    }

    // 4. Machine write SECOND, through the EXISTING use cases.
    const pipeline =
      plan.via === 'transicion'
        ? (
            await this.transiciones.execute({
              empresaId: input.empresaId,
              evento: plan.evento,
              motivo: null,
              handoff: null,
              usuario: input.usuario,
            })
          ).pipeline
        : (
            await this.cadencias.execute({
              empresaId: input.empresaId,
              usuario: input.usuario,
              asunto: PLANTILLAS_CORREO[input.plantilla].titulo,
              detalle: null,
              contactoId: contacto.id,
            })
          ).pipeline;

    // 5. ENVIADO log LAST — the durable dispatch receipt.
    const envioId = await this.deps.envios.registrar({
      empresaId: input.empresaId,
      contactoId: contacto.id,
      plantilla: input.plantilla,
      destinatario,
      messageId: resultado.messageId,
      estado: 'ENVIADO',
      errorInfo: null,
      usuario: input.usuario,
    });

    return { envioId, plantilla: input.plantilla, destinatario, contactoId: contacto.id, pipeline };
  }
}

/** `esPrincipal` first, else first listed (listarCandidatosCola precedent). */
function resolverContacto(empresa: Empresa): Contacto {
  const principal = empresa.contactos.find((c) => c.esPrincipal) ?? empresa.contactos[0];
  if (!principal) throw new ValidationError('La empresa no tiene un contacto registrado');
  return principal;
}

/** Pure pre-dispatch plan: template + pipeline state → machine write,
 * or a Spanish ValidationError when the template does not apply here. */
function resolverPlan(fila: PipelineEmpresa, plantilla: PlantillaCrmKey, hoy: string): PlanEscritura {
  if (plantilla === 'carta_presentacion') {
    if (fila.flujo === 'OUTBOUND' && fila.etapa === 'NUEVO') {
      return { via: 'transicion', evento: 'PresentaciónEnviada' }; // T7 — arms envios=1
    }
    if (fila.flujo === 'INBOUND' && fila.etapa === 'REGISTRADO') {
      return { via: 'transicion', evento: 'CotizaciónEnviada' }; // T2 — arms envios=1
    }
    throw new ValidationError(`La carta de presentación no aplica desde ${fila.flujo}/${fila.etapa}`);
  }
  if (plantilla === 'reactivacion_3m') {
    if (fila.etapa === 'RECHAZADO') return { via: 'transicion', evento: 'Reactivar' }; // T15
    if (fila.etapa === 'DESCANSO') {
      // "Reactivar ya" before descansoHasta is server-rejected (design OQ4).
      if (!esReinicioDeCadencia(fila, hoy)) {
        throw new ValidationError(`La empresa sigue en descanso hasta ${fila.descansoHasta}`);
      }
      return { via: 'cadencia' }; // T9 rides the send itself
    }
    throw new ValidationError(`La reactivación no aplica desde ${fila.flujo}/${fila.etapa}`);
  }
  // +1 Sem: the cadence engine pre-checks "due today" — a not-due send
  // throws the domain ValidationError before anything is dispatched.
  aplicarEnvioCadencia(fila, hoy);
  return { via: 'cadencia' };
}
