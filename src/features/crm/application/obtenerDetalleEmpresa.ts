import type { Empresa, PipelineEmpresa } from '../domain/entities';
import { NotFoundError } from '../domain/errors';
import type {
  CrmEmpresaRepositoryPort,
  CrmEnviosCorreoRepositoryPort,
  CrmPipelineRepositoryPort,
  EnvioCorreoHistorial,
  HandoffHistorial,
  TransicionHistorial,
} from '../domain/ports';

/**
 * The detail read model (tasks pr11/WU1, spec G1+G4; envios rows ride
 * since rediseno-crm-panel task 7.3): the full empresa aggregate next
 * to its pipeline row and the audit histories the timeline renders.
 * `pipeline` is NULL for pipeline-less empresas (origen null — T1/T6
 * need a door), in which case both histories are empty too: no door,
 * no transitions, no handoffs (and no dispatch — `envios` reads empty
 * for them as well). A SMTP-FALLIDO row CAN exist next to a
 * pipeline-less-looking state (sin_carta retry, EM-6) — the log is
 * read unconditionally so the ficha timeline always shows it.
 */
export interface DetalleEmpresa {
  empresa: Empresa;
  pipeline: PipelineEmpresa | null;
  transiciones: TransicionHistorial[];
  handoffs: HandoffHistorial[];
  /** Send-log rows (CRM_EnviosCorreos), newest first — ficha timeline. */
  envios: EnvioCorreoHistorial[];
}

/**
 * ObtenerDetalleEmpresaUseCase — assembles the detail page's read model
 * from three ports (the pipeline adapter owns the history reads and the
 * send-log adapter owns the dispatch log — see the port contracts). A
 * missing empresa raises `NotFoundError` (API maps it to 404) BEFORE
 * any pipeline read; the four pipeline/envios reads fan out in
 * parallel.
 */
export class ObtenerDetalleEmpresaUseCase {
  constructor(
    private readonly empresas: CrmEmpresaRepositoryPort,
    private readonly pipelines: CrmPipelineRepositoryPort,
    private readonly envios: CrmEnviosCorreoRepositoryPort,
  ) {}

  async execute(id: number): Promise<DetalleEmpresa> {
    const empresa = await this.empresas.obtenerPorId(id);
    if (!empresa) throw new NotFoundError();

    const [pipeline, transiciones, handoffs, enviosHistorial] = await Promise.all([
      this.pipelines.obtenerPorEmpresaId(id),
      this.pipelines.listarTransiciones(id),
      this.pipelines.listarHandoffs(id),
      this.envios.listarPorEmpresa(id),
    ]);
    return { empresa, pipeline, transiciones, handoffs, envios: enviosHistorial };
  }
}
