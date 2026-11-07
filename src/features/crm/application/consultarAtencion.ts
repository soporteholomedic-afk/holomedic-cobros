import { estadoActividadServicios, type ActividadServicios, type EstadoAtencion } from '../domain/actividadServicios';
import { EmpresaNotFoundError } from '../domain/errors';
import type { ICrmEmpresaRepository, IAtencionesServicio } from '../domain/ports';

export interface AtencionEmpresa {
  /** Raw SIGLA answer: last attention day of the RUC (NULL when SIGLA has none). */
  actividad: ActividadServicios;
  /** Display state derived from the activity (reciente / sin actividad / ...). */
  estado: EstadoAtencion;
}

/**
 * "Última atención / Actividad de servicios" of the empresa ficha (S3, S5.3):
 * read LIVE from SIGLA through the atenciones port — never derived from CRM
 * calls or emails (regla S6.6), because winning a deal is not the same as the
 * client actually using the services. An empresa without RUC never reaches
 * SIGLA (regla S6.7): the caller gets a null lookup without spending a query.
 *
 * `hoy` is the Lima calendar day (`YYYY-MM-DD`, see `hoyEnLima`), passed by
 * the caller like everywhere else in this layer; it anchors the 4-month
 * inactivity threshold.
 */
export class ConsultarAtencionUseCase {
  constructor(
    private readonly empresas: ICrmEmpresaRepository,
    private readonly atenciones: IAtencionesServicio,
  ) {}

  async execute(idEmpresa: string, hoy: string): Promise<AtencionEmpresa> {
    const empresa = await this.empresas.getById(idEmpresa);
    if (!empresa) throw new EmpresaNotFoundError(idEmpresa);
    const actividad: ActividadServicios =
      empresa.ruc === null
        ? { ultimaAtencion: null, ruc: null }
        : { ultimaAtencion: await this.atenciones.ultimaAtencion(empresa.ruc), ruc: empresa.ruc };
    return { actividad, estado: estadoActividadServicios(empresa.relacion, actividad, new Date(`${hoy}T00:00:00Z`)) };
  }
}
