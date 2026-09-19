import { fechaHoy } from '../domain/cadence';
import { NotFoundError, ValidationError } from '../domain/errors';
import { efectosTransicion } from '../domain/efectosTransicion';
import { transitar } from '../domain/maquinaEstados';
import type { Clock, CrmPipelineRepositoryPort, HandoffInput, PipelineEmpresa } from '../domain/ports';
import type { EstadoPipeline, EventoPipeline, TipoResultado } from '../domain/maquinaEstados';

/** Body of `POST /api/crm/empresas/[id]/transiciones` (route whitelists it). */
export interface RegistrarTransicionInput {
  empresaId: number;
  evento: EventoPipeline;
  motivo?: string | null;
  handoff?: HandoffInput | null;
  /** Acting session user (CRM_Transiciones.usuario audit). */
  usuario: string;
}

export interface ResultadoRegistrarTransicion {
  /** The machine's NEW state ({flujo, etapa}). */
  estado: EstadoPipeline;
  /** The result event emitted into CRM_Resultados (bold T-rows), else null. */
  resultado: TipoResultado | null;
  /** The freshly persisted pipeline row (counters included). */
  pipeline: PipelineEmpresa;
}

const MOTIVO_MAX = 300; // CRM_Transiciones.motivo / CRM_Pipeline.motivoRechazo
const AREA_MAX = 100; // CRM_Handoffs.area

/**
 * RegistrarTransicionUseCase (tasks pr10/WU1, spec G4) — applies ONE
 * machine transition to an existing pipeline row and persists its full
 * effect set atomically:
 *
 * 1. loads the pipeline row (404 when the empresa is not in the
 *    pipeline — rows are born at creation, T1/T6);
 * 2. validates the event-specific payload (T14 motivo, T5 handoff);
 * 3. runs the PURE state machine (`transitar`) — an illegal move
 *    throws `TransicionInvalidaError` (a `ValidationError`, so the API
 *    maps it to 400 with the Spanish message verbatim);
 * 4. projects the denormalized counters (`efectosTransicion`);
 * 5. hands ONE bundle to the port — the adapter writes pipeline row +
 *    audit row + optional result/handoff rows in ONE
 *    `withCrmTransaction` (design §2b: registrarTransicion).
 *
 * 'ConversiónProspectoACliente' (T16) is deliberately rejected here:
 * it changes the empresa's tipo, not the pipeline state — the /tipo
 * endpoint owns it.
 */
export class RegistrarTransicionUseCase {
  constructor(
    private readonly pipelines: CrmPipelineRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegistrarTransicionInput): Promise<ResultadoRegistrarTransicion> {
    if (input.evento === 'ConversiónProspectoACliente') {
      throw new ValidationError(
        'La conversión de tipo no es una transición del pipeline: registre el cambio de tipo de la empresa',
      );
    }

    const fila = await this.pipelines.obtenerPorEmpresaId(input.empresaId);
    if (!fila) {
      throw new NotFoundError('La empresa no se encuentra en el pipeline');
    }

    const motivo = normalizarMotivo(input.motivo);
    if (input.evento === 'Rechazo') {
      if (motivo === null) {
        throw new ValidationError('El motivo es obligatorio para rechazar una empresa');
      }
      if (motivo.length > MOTIVO_MAX) {
        throw new ValidationError(`El motivo no puede exceder ${MOTIVO_MAX} caracteres`);
      }
    }

    const handoff = input.evento === 'HandoffRegistrado' ? validarHandoff(input.handoff) : null;

    const estadoPrevio: EstadoPipeline = { flujo: fila.flujo, etapa: fila.etapa };
    const { estado: estadoNuevo, resultado } = transitar(estadoPrevio, input.evento);
    const hoy = fechaHoy(this.clock);
    const efectos = efectosTransicion(fila, input.evento, hoy, motivo);

    const pipeline = await this.pipelines.registrarTransicion({
      empresaId: input.empresaId,
      usuario: input.usuario,
      evento: input.evento,
      motivo,
      hoy,
      estadoPrevio,
      estadoNuevo,
      resultado,
      efectos,
      handoff,
    });

    return { estado: estadoNuevo, resultado, pipeline };
  }
}

function normalizarMotivo(motivo: string | null | undefined): string | null {
  const limpio = motivo?.trim();
  return limpio ? limpio : null;
}

/** T5 requires an área (nota optional); validated here, not in the adapter. */
function validarHandoff(handoff: HandoffInput | null | undefined): HandoffInput {
  const area = handoff?.area?.trim() ?? '';
  if (area === '') {
    throw new ValidationError('El área es obligatoria para registrar el handoff');
  }
  if (area.length > AREA_MAX) {
    throw new ValidationError(`El área no puede exceder ${AREA_MAX} caracteres`);
  }
  const nota = handoff?.nota?.trim();
  return { area, nota: nota ? nota : null };
}
