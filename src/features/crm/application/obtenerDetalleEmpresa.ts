import type { Empresa, PipelineEmpresa } from '../domain/entities';
import { NotFoundError } from '../domain/errors';
import type {
  CrmEmpresaRepositoryPort,
  CrmPipelineRepositoryPort,
  HandoffHistorial,
  TransicionHistorial,
} from '../domain/ports';

/**
 * The detail read model (tasks pr11/WU1, spec G1+G4): the full empresa
 * aggregate next to its pipeline row and the audit histories the
 * timeline renders. `pipeline` is NULL for pipeline-less empresas
 * (origen null — T1/T6 need a door), in which case both histories are
 * empty too: no door, no transitions, no handoffs.
 */
export interface DetalleEmpresa {
  empresa: Empresa;
  pipeline: PipelineEmpresa | null;
  transiciones: TransicionHistorial[];
  handoffs: HandoffHistorial[];
}

/**
 * ObtenerDetalleEmpresaUseCase — assembles the detail page's read model
 * from two ports (the pipeline adapter owns the history reads — see the
 * port contract). A missing empresa raises `NotFoundError` (API maps it
 * to 404) BEFORE any pipeline read; the three pipeline reads fan out in
 * parallel.
 */
export class ObtenerDetalleEmpresaUseCase {
  constructor(
    private readonly empresas: CrmEmpresaRepositoryPort,
    private readonly pipelines: CrmPipelineRepositoryPort,
  ) {}

  async execute(id: number): Promise<DetalleEmpresa> {
    const empresa = await this.empresas.obtenerPorId(id);
    if (!empresa) throw new NotFoundError();

    const [pipeline, transiciones, handoffs] = await Promise.all([
      this.pipelines.obtenerPorEmpresaId(id),
      this.pipelines.listarTransiciones(id),
      this.pipelines.listarHandoffs(id),
    ]);
    return { empresa, pipeline, transiciones, handoffs };
  }
}
