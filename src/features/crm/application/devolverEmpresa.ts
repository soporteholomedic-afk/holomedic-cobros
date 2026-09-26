import { NotFoundError, ValidationError } from '../domain/errors';
import type {
  AsignacionAPersistir,
  CrmAsignacionesRepositoryPort,
  CrmEmpresaRepositoryPort,
} from '../domain/ports';

export interface DevolverEmpresaInput {
  empresaId: number;
  /** Acting session user — must be the current owner OR a crm_admin. */
  usuario: string;
  /** true when the session holds `crm_admin` (route reads the permisos). */
  esAdmin: boolean;
}

export interface ResultadoDevolucion {
  accion: 'DEVUELTO';
  responsablePrevio: string;
}

/**
 * DevolverEmpresaUseCase (tasks pr14/WU2, spec G5) — an assigned
 * empresa goes back to the pool: `CRM_Empresas.responsable` becomes
 * NULL and the DEVUELTO event records who gave it back (actor) and who
 * had it (previo). Policy at the use-case level via actor context:
 * only the CURRENT owner or a `crm_admin` actor may return it — the
 * route repeats the check for its 403 mapping, this guard is the
 * domain's own defense in depth. The empresa UPDATE + event INSERT
 * land in ONE transaction through the port (design §2d).
 */
export class DevolverEmpresaUseCase {
  constructor(
    private readonly empresas: CrmEmpresaRepositoryPort,
    private readonly asignaciones: CrmAsignacionesRepositoryPort,
  ) {}

  async execute(input: DevolverEmpresaInput): Promise<ResultadoDevolucion> {
    const empresa = await this.empresas.obtenerPorId(input.empresaId);
    if (!empresa) {
      throw new NotFoundError('Empresa no encontrada');
    }
    if (empresa.responsable === null) {
      throw new ValidationError('La empresa ya está en el pool sin responsable');
    }

    const esOwner = empresa.responsable === input.usuario;
    if (!esOwner && !input.esAdmin) {
      throw new ValidationError(
        'Solo el responsable asignado o un usuario crm_admin puede devolver la empresa al pool',
      );
    }

    const evento: AsignacionAPersistir = {
      empresaId: input.empresaId,
      accion: 'DEVUELTO',
      responsablePrevio: empresa.responsable,
      responsableNuevo: null,
      actorUsuario: input.usuario,
    };
    await this.asignaciones.registrarAsignacion(evento);

    return { accion: 'DEVUELTO', responsablePrevio: empresa.responsable };
  }
}
