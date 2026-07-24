/**
 * Shared types for the JJC face-lesion-mapper feature.
 * Kept in `src/types/` per project convention (shared across feature boundaries).
 */

export type LesionType = 'P' | 'L' | 'M' | 'C' | 'O';

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
  /** Absolute filesystem path to the patient's signature JPG (or null). */
  rutaFirma: string | null;
  /** Absolute filesystem path to the patient's fingerprint JPG (or null). */
  rutaHuella: string | null;
}

/** Si/No answer type for the dermatology questionnaire. */
export type SiNo = 'si' | 'no';

export interface PreguntaBase {
  respuesta: SiNo | null;
  detalle: string;
}

export interface PreguntaConFecha extends PreguntaBase {
  fecha: string;
}

export interface CuestionarioPiel {
  sufreEnfermedadesPiel: PreguntaBase;
  tieneLesionActual: PreguntaConFecha;
  cambioColoracion: PreguntaBase;
  lesionesRepiten: PreguntaBase;
  enrojecimiento: PreguntaBase;
  comezon: PreguntaBase;
  hinchazon: PreguntaBase;
  rinitisAsma: PreguntaBase;
  usaEPP: PreguntaBase;
  cambiosUnas: PreguntaBase;
  tomaMedicacion: PreguntaBase;
  describaPositivo: string;
  lesionDermatopatia: SiNo | null;
  evaluacionDermatologo: SiNo | null;
}

/** Full evaluation payload (PR3 persists this). */
export interface JjcEvaluacion {
  idAtencion: string;
  fechaEvaluacion: string;   // YYYY-MM-DD
  lugar: 'HOLOMEDIC';
  fototipo: Fototipo;
  observaciones: string;     // ≤ 500
  lesiones: LesionPoint[];
  preguntas: CuestionarioPiel | null;
  /** idUsuario de quien guardó por primera vez la evaluación. */
  createdBy: string | null;
}
