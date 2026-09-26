import type { AccionAsignacion } from '../domain/entities';
import { NotFoundError, ValidationError } from '../domain/errors';
import type {
  AsignacionAPersistir,
  CrmAsignacionesRepositoryPort,
  CrmEmpresaRepositoryPort,
} from '../domain/ports';

/**
 * Body of `POST /api/crm/empresas/[id]/asignar` (route enforces
 * `crm_admin` in-route per design D2).
 */
export interface AsignarEmpresaInput {
  empresaId: number;
  /** Target username (dbo.usuarios.usuario; app-validated, cobranza precedent). */
  responsable: string;
  /** Acting session user (CRM_Asignaciones.actorUsuario audit). */
  usuario: string;
}

export interface ResultadoAsignacion {
  /** ASIGNADO when the empresa came from the pool, REASIGNADO otherwise. */
  accion: AccionAsignacion;
  responsablePrevio: string | null;
  responsableNuevo: string;
}

/**
 * AsignarEmpresaUseCase (tasks pr14/WU2, spec G5) — admin assigns or
 * reassigns ONE empresa to ONE user. The single-Responsable invariant
 * is upheld by REPLACING the owner: the derived event is ASIGNADO when
 * the empresa was in the pool (`responsable` NULL) and REASIGNADO when
 * it had an owner. The empresa UPDATE + the event INSERT land in ONE
 * transaction through the port (design §2d), so the current-owner
 * column and the history row can never diverge.
 */
export class AsignarEmpresaUseCase {
  constructor(
    private readonly empresas: CrmEmpresaRepositoryPort,
    private readonly asignaciones: CrmAsignacionesRepositoryPort,
  ) {}

  async execute(input: AsignarEmpresaInput): Promise<ResultadoAsignacion> {
    const responsable = input.responsable.trim();
    if (responsable === '') {
      throw new ValidationError('El responsable es obligatorio para asignar la empresa');
    }

    const empresa = await this.empresas.obtenerPorId(input.empresaId);
    if (!empresa) {
      throw new NotFoundError('Empresa no encontrada');
    }
    if (empresa.responsable === responsable) {
      throw new ValidationError(`La empresa ya está asignada a ${responsable}`);
    }

    const accion: AccionAsignacion = empresa.responsable === null ? 'ASIGNADO' : 'REASIGNADO';
    const evento: AsignacionAPersistir = {
      empresaId: input.empresaId,
      accion,
      responsablePrevio: empresa.responsable,
      responsableNuevo: responsable,
      actorUsuario: input.usuario,
    };
    await this.asignaciones.registrarAsignacion(evento);

    return { accion, responsablePrevio: empresa.responsable, responsableNuevo: responsable };
  }
}
