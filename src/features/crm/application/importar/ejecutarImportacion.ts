import type { FilaImportCrm } from '../../domain/importar/columnas';
import { ImportacionExcedeLimiteError, MAXIMO_FILAS_IMPORTACION } from '../../domain/importar/limiteFilas';
import type { ErrorFilaImport } from '../../domain/importar/validarImportacion';
import { validarImportacion } from '../../domain/importar/validarImportacion';
import type { CrmImportadorPort } from '../../domain/ports';

/**
 * EjecutarImportacionUseCase (tasks pr6/WU2, spec G2 upsert
 * semantics): the SERVER-side execution of a confirmed import. It
 * re-validates EVERYTHING it is shown — the client-parsed rows are
 * never trusted (design §4) — then runs ONE transaction PER RUC group
 * through the `CrmImportadorPort`, so a failing group never rolls back
 * valid groups, and finally writes the `CRM_Importaciones` job record
 * with the accumulated counters. Preview/cancel flows never reach this
 * use case (G2 preview-before-commit: they stop at `validarImportacion`).
 *
 * The returned report separates three row kinds, all shaped
 * {fila, columna, mensaje} (Spanish):
 * - `errores` — row-level validation failures (no group was built).
 * - `fallos` — groups whose transaction threw (reported, others kept).
 * - `advertencias` — non-blocking D1 duplicate-contacto warnings.
 * The job record's `erroresJson` carries all three, in that order.
 */
export interface EjecutarImportacionInput {
  /** Raw parsed rows — re-validated here, capped at 2000. */
  filas: readonly FilaImportCrm[];
  archivoNombre: string;
  /** Acting user (job audit + createdBy/updatedBy stamps). */
  usuario: string;
}

export interface ResultadoEjecucionImportacion {
  totalFilas: number;
  filasValidas: number;
  empresasCreadas: number;
  empresasActualizadas: number;
  contactosCreados: number;
  contactosActualizados: number;
  errores: ErrorFilaImport[];
  fallos: ErrorFilaImport[];
  advertencias: ErrorFilaImport[];
  /** Id of the written CRM_Importaciones row. */
  importacionId: number;
}

export class EjecutarImportacionUseCase {
  constructor(private readonly importador: CrmImportadorPort) {}

  async execute(input: EjecutarImportacionInput): Promise<ResultadoEjecucionImportacion> {
    if (input.filas.length > MAXIMO_FILAS_IMPORTACION) {
      throw new ImportacionExcedeLimiteError();
    }

    const validacion = validarImportacion(input.filas);

    const errores: ErrorFilaImport[] = [...validacion.errores];
    const fallos: ErrorFilaImport[] = [];
    const advertencias: ErrorFilaImport[] = [];
    let empresasCreadas = 0;
    let empresasActualizadas = 0;
    let contactosCreados = 0;
    let contactosActualizados = 0;

    for (const grupo of validacion.grupos) {
      try {
        const resultado = await this.importador.ejecutarGrupo(grupo, input.usuario);
        if (resultado.modo === 'crear') empresasCreadas += 1;
        else empresasActualizadas += 1;
        contactosCreados += resultado.contactosCreados;
        contactosActualizados += resultado.contactosActualizados;
        advertencias.push(...resultado.advertencias);
      } catch (err: unknown) {
        const detalle = err instanceof Error ? err.message : 'error desconocido';
        fallos.push({
          fila: grupo.filas[0] ?? 0,
          columna: 'RUC',
          mensaje: `No se pudo importar la empresa "${grupo.razonSocial}" (RUC ${grupo.ruc}): ${detalle}`,
        });
      }
    }

    const importacionId = await this.importador.registrarImportacion({
      archivoNombre: input.archivoNombre,
      totalFilas: validacion.totalFilas,
      filasValidas: validacion.filasValidas,
      empresasCreadas,
      empresasActualizadas,
      contactosCreados,
      contactosActualizados,
      erroresJson: JSON.stringify([...errores, ...fallos, ...advertencias]),
      ejecutadoPor: input.usuario,
    });

    return {
      totalFilas: validacion.totalFilas,
      filasValidas: validacion.filasValidas,
      empresasCreadas,
      empresasActualizadas,
      contactosCreados,
      contactosActualizados,
      errores,
      fallos,
      advertencias,
      importacionId,
    };
  }
}
