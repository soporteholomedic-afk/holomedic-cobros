/**
 * Shared types for the JJC face-lesion-mapper feature.
 * Kept in `src/types/` per project convention (shared across feature boundaries).
 */

/** Exactly 4 lesion types with fixed pastel colors. */
export type LesionType = 'P' | 'L' | 'M' | 'C';

/** Normalized `0..1` coordinates over the face canvas. */
export interface LesionPoint {
  id: string;
  type: LesionType;
  x: number; // ∈ [0, 1]
  y: number; // ∈ [0, 1]
}

/** Fitzpatrick phototype grouping (3 cards). */
export type Fototipo = 'I-II' | 'III-IV' | 'V-VI';

/**
 * Server-fetched attention context displayed in the right form.
 * Maps from Orden + Persona + Cliente + Servicio.
 */
export interface AtencionDetalle {
  idAtencion: string;
  dni: string;
  paciente: string;
  sexo: string;
  fechaNac: string;   // dd/MM/yyyy
  edad: number;
  fechaAtencion: string; // dd/MM/yyyy
  empresa: string;
  tipoExamen: string;
  puesto: string;
  area: string;           // Área from Servicio
}

/** Full evaluation payload (PR3 persists this). */
export interface JjcEvaluacion {
  idAtencion: string;
  fechaEvaluacion: string;   // YYYY-MM-DD
  lugar: 'HOLOMEDIC';
  fototipo: Fototipo;
  observaciones: string;     // ≤ 500
  lesiones: LesionPoint[];
}
