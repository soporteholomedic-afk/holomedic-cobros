import { fechaHoy } from '../domain/cadence';
import type { PipelineEmpresa } from '../domain/entities';
import { aplicarEnvioCadencia } from '../domain/envioCadencia';
import { NotFoundError, ValidationError } from '../domain/errors';
import type {
  Clock,
  CrmActividadesRepositoryPort,
  CrmPipelineRepositoryPort,
} from '../domain/ports';

/** Body of the cadence-send registration (route seam arrives with the UI slice). */
export interface RegistrarEnvioCadenciaInput {
  empresaId: number;
  /** Acting session user (CRM_Actividades.usuario audit). */
  usuario: string;
  /** Optional Spanish subject; blank falls back to the counter-derived default. */
  asunto?: string | null;
  /** Optional free-form note. */
  detalle?: string | null;
  /** Optional addressee contacto (defaults to the principal, app-side). */
  contactoId?: number | null;
}

export interface ResultadoRegistrarEnvio {
  /** The freshly persisted pipeline row (counters + derived stage move). */
  pipeline: PipelineEmpresa;
  /** The derived machine event ('EnviosAgotados' | 'ReinicioCadencia'), else null. */
  transicion: string | null;
}

/**
 * RegistrarEnvioCadenciaUseCase (tasks pr13/WU1, spec G4, design §3) —
 * logs ONE cadence send and persists its whole effect set atomically:
 *
 * 1. loads the pipeline row (404 when the empresa is pipeline-less);
 * 2. runs the PURE send projection (`aplicarEnvioCadencia`) — a send
 *    that is not due throws `ValidationError` (Spanish, mapped to 400)
 *    and NOTHING is written: the queue is the only surface offering
 *    this action, and there is no auto-send;
 * 3. hands ONE bundle to the activities port — the adapter writes the
 *    CRM_Actividades row, the CRM_Pipeline counters and the derived
 *    T8/T9 audit row inside ONE `withCrmTransaction` (design §2c).
 *
 * The use case NEVER touches the transition write path: the weekly
 * send is not a machine transition, and the derived T8/T9 moves ride
 * the send's own transaction (pr10's `registrarTransicion` stays the
 * user-action endpoint).
 */
export class RegistrarEnvioCadenciaUseCase {
  constructor(
    private readonly pipelines: CrmPipelineRepositoryPort,
    private readonly actividades: CrmActividadesRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegistrarEnvioCadenciaInput): Promise<ResultadoRegistrarEnvio> {
    const fila = await this.pipelines.obtenerPorEmpresaId(input.empresaId);
    if (!fila) {
      throw new NotFoundError('La empresa no se encuentra en el pipeline');
    }

    const hoy = fechaHoy(this.clock);
    const { efectos, transicion } = aplicarEnvioCadencia(fila, hoy);

    const pipeline = await this.actividades.registrarEnvioCadencia({
      empresaId: input.empresaId,
      usuario: input.usuario,
      hoy,
      estadoFinal: transicion?.estadoNuevo ?? { flujo: fila.flujo, etapa: fila.etapa },
      actividad: {
        asunto: normalizarAsunto(input.asunto, efectos.ciclo, efectos.enviosCiclo),
        detalle: normalizarOpcional(input.detalle),
        contactoId: normalizarContacto(input.contactoId),
      },
      efectos,
      transicion,
    });

    return { pipeline, transicion: transicion?.evento ?? null };
  }
}

const ASUNTO_MAX = 300; // CRM_Actividades.asunto

function normalizarAsunto(asunto: string | null | undefined, ciclo: number, envios: number): string {
  const limpio = asunto?.trim();
  const valor =
    limpio && limpio.length > 0 ? limpio : `Envío de cadencia (ciclo ${ciclo}, envío ${envios})`;
  if (valor.length > ASUNTO_MAX) {
    throw new ValidationError(`El asunto no puede exceder ${ASUNTO_MAX} caracteres`);
  }
  return valor;
}

function normalizarOpcional(detalle: string | null | undefined): string | null {
  const limpio = detalle?.trim();
  return limpio ? limpio : null;
}

function normalizarContacto(contactoId: number | null | undefined): number | null {
  if (contactoId === null || contactoId === undefined) return null;
  if (!Number.isInteger(contactoId) || contactoId <= 0) {
    throw new ValidationError('"contactoId" debe ser un número entero positivo');
  }
  return contactoId;
}
