import type { DatosFicha, Empleado } from '../domain/entities';
import type {
  IAuditoriaRepository,
  IEmpleadoRepository,
  IMarcacionRepository,
} from '../domain/ports';

/**
 * RRHH ficha completion (REQ-F1-10). Orchestration only:
 *
 *  1. Validate the RRHH input — required fields trimmed non-empty and a
 *     real YYYY-MM-DD fechaIngreso. A rejected input reaches NO port.
 *  2. `empleados.completar` persists the ficha and moves it to ACTIVO.
 *  3. `marcaciones.reasignarEmpleado` backfills the punches that arrived
 *     before the ficha existed (empleadoId NULL → the ficha's id), keyed
 *     by the ficha's device userId.
 *  4. `auditoria.registrar` appends the dbo.auditoria row — an UPDATE
 *     over `empleados` attributed to the session user (usuarioId =
 *     session sub, dbo.usuarios.idUsuario NVARCHAR(50)).
 */
export class FichaInvalidaError extends Error {
  constructor(motivo: string) {
    super(`Ficha inválida: ${motivo}`);
    this.name = 'FichaInvalidaError';
  }
}

export interface CompletarFichaDeps {
  empleados: IEmpleadoRepository;
  marcaciones: IMarcacionRepository;
  auditoria: IAuditoriaRepository;
}

export interface ResultadoCompletarFicha {
  empleado: Empleado;
  /** Punches backfilled from NULL → the ficha's id by reasignarEmpleado. */
  marcacionesReasignadas: number;
}

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function recortado(valor: string | undefined): string | undefined {
  if (valor === undefined) return undefined;
  const limpio = valor.trim();
  return limpio === '' ? undefined : limpio;
}

/** Pure validation + normalization: throws FichaInvalidaError on bad input. */
export function normalizarDatos(entrada: DatosFicha): DatosFicha {
  const dni = recortado(entrada.dni);
  const apellidos = recortado(entrada.apellidos);
  const area = recortado(entrada.area);
  const fechaIngreso = recortado(entrada.fechaIngreso);

  if (!dni) throw new FichaInvalidaError('el DNI es obligatorio');
  if (!apellidos) throw new FichaInvalidaError('los apellidos son obligatorios');
  if (!area) throw new FichaInvalidaError('el área es obligatoria');
  if (!fechaIngreso) throw new FichaInvalidaError('la fecha de ingreso es obligatoria');
  if (!PATRON_FECHA.test(fechaIngreso) || Number.isNaN(new Date(`${fechaIngreso}T00:00:00`).getTime())) {
    throw new FichaInvalidaError('la fecha de ingreso debe ser una fecha YYYY-MM-DD válida');
  }

  return {
    dni,
    apellidos,
    area,
    fechaIngreso,
    nombres: recortado(entrada.nombres),
    cargo: recortado(entrada.cargo),
  };
}

export class CompletarFichaUseCase {
  constructor(private readonly deps: CompletarFichaDeps) {}

  async execute(
    fichaId: number,
    entrada: DatosFicha,
    usuarioIdSesion: string,
  ): Promise<ResultadoCompletarFicha> {
    const datos = normalizarDatos(entrada);

    const empleado = await this.deps.empleados.completar(fichaId, datos);
    const marcacionesReasignadas = await this.deps.marcaciones.reasignarEmpleado(
      empleado.userId,
      fichaId,
    );
    await this.deps.auditoria.registrar({
      tabla: 'empleados',
      registroId: fichaId,
      accion: 'UPDATE',
      datosAnteriores: null,
      datosNuevos: JSON.stringify(empleado),
      usuarioId: usuarioIdSesion,
    });

    return { empleado, marcacionesReasignadas };
  }
}
