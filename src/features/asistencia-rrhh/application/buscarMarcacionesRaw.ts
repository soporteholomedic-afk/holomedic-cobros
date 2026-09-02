import type { MarcacionRaw } from '../domain/entities';
import type { IMarcacionRepository } from '../domain/ports';

/**
 * Raw punch search for the histórico page (REQ-F1-12). Orchestration:
 * validate the calendar range and forward the criterion VERBATIM to the
 * repository. F1 performs NO collapse — two punches less than 2 minutes
 * apart are both listed (the F2 collapse engine is a later phase) — and
 * punches of unresolved user_ids keep empleadoId NULL, which the UI
 * renders as the "Sin ficha" label.
 */

export interface CriterioBusqueda {
  empleadoId?: number;
  userId?: string;
  /** Calendar dates YYYY-MM-DD (inclusive). */
  desde: string;
  hasta: string;
}

export class CriterioInvalidoError extends Error {
  constructor(motivo: string) {
    super(`Criterio de búsqueda inválido: ${motivo}`);
    this.name = 'CriterioInvalidoError';
  }
}

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function validarCriterio(criterio: CriterioBusqueda): void {
  if (!PATRON_FECHA.test(criterio.desde) || Number.isNaN(new Date(`${criterio.desde}T00:00:00`).getTime())) {
    throw new CriterioInvalidoError('"desde" debe ser una fecha YYYY-MM-DD válida');
  }
  if (!PATRON_FECHA.test(criterio.hasta) || Number.isNaN(new Date(`${criterio.hasta}T00:00:00`).getTime())) {
    throw new CriterioInvalidoError('"hasta" debe ser una fecha YYYY-MM-DD válida');
  }
  if (criterio.desde > criterio.hasta) {
    throw new CriterioInvalidoError('"desde" no puede ser posterior a "hasta"');
  }
}

export interface BuscarMarcacionesRawDeps {
  marcaciones: IMarcacionRepository;
}

export class BuscarMarcacionesRawUseCase {
  constructor(private readonly deps: BuscarMarcacionesRawDeps) {}

  async execute(criterio: CriterioBusqueda): Promise<MarcacionRaw[]> {
    validarCriterio(criterio);
    return this.deps.marcaciones.buscar(criterio);
  }
}
