import type { AtencionDetalle, JjcEvaluacion, LesionPoint } from '@/types/jjc';

/**
 * Outbound port for fetching attention detail from the SIGLA database.
 * The single detail lookup by composite idAtencion.
 */
export interface IAtencionRepository {
  getDetalle(idAtencion: string): Promise<AtencionDetalle | null>;
}

/**
 * Outbound port for persisting / loading a JJC evaluation.
 * Defined in PR1 (contract); implemented in PR3.
 */
export interface IJjcEvaluacionRepository {
  save(evaluacion: JjcEvaluacion): Promise<void>;
  loadByAtencion(idAtencion: string, area: string): Promise<JjcEvaluacion | null>;
}

// ---- DTOs shared between layers ----

/** Shape returned by `getAtencionDetalle` use case. */
export type GetAtencionDetalleResult = AtencionDetalle;

/** Shape accepted by a future `saveJjcEvaluacion` use case. */
export interface SaveEvaluacionInput {
  idAtencion: string;
  fechaEvaluacion: string;
  lugar: 'HOLOMEDIC';
  fototipo: string;
  observaciones: string;
  lesiones: LesionPoint[];
  createdBy?: string | null;
}
