import type { ReadyFileTipo } from './ready-files/parseReadyFile';

export type SpitchType = 'company' | 'patient';

export interface Company {
  id: string;
  name: string;
  ruc: string;
  email: string;
}

export interface Patient {
  id: string;
  companyId: string;
  name: string;
  dni: string;
  files: PatientFile[];
}

export interface PatientFile {
  id: string;
  patientId: string;
  name: string;
  type: string;
  size: number;
}

/**
 * Send-payload entity for the email attachment pipeline.
 *
 * `PatientFile` is the display entity (no LAN location). `SelectedFileRef`
 * carries the location triple (`ruc`/`dni`/`idAten`) plus the relative
 * `path` (folder under the patient root; `''` = root) and `name` (file
 * basename) that `IFileRepository.read(ruc, dni, idAten, path, name)`
 * needs to stream the real bytes from the UNC share.
 *
 * Distinct from `PatientFile` by design — adding fields to `PatientFile`
 * is risky because it's a display entity consumed by `EmailEditor` UI.
 * This entity is consumed only by the email-send pipeline.
 */
export interface SelectedFileRef {
  ruc: string;
  dni: string;
  idAten: string;
  path: string;
  name: string;
  /**
   * Optional exam type. Set by the envio wizard when the user picks a
   * specific CAMO, EMO or ADICIONAL file per patient; the send-pipeline
   * rename (`renameReadyFile`) prefers this value over the type inferred
   * from `name` via `parseReadyFile`. `'ADICIONAL'` (ADICIONALES
   * orders) arrives ONLY via this explicit signal — `parseReadyFile`
   * never infers it. Legacy call sites (e.g. per-row `Ver Archivos`
   * flow) omit it — the pipeline falls back to `parseReadyFile(ref.name)`.
   */
  tipoExamen?: ReadyFileTipo;
}

export interface Spitch {
  id: string;
  /**
   * The area this spitch belongs to (e.g. `'consolidados'`). PR 4 of
   * the email-template-editor change adds the field so the empty-state
   * UX can derive the right editor link from the area. Populated by
   * the `Template → SpitchDTO` boundary projection at
   * `/api/plantillas`. Decision b (design).
   */
  area: string;
  type: SpitchType;
  name: string;
  subject: string;
  bodyHtml: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

/**
 * Input shape for a local file dropped from the OS and attached to an
 * email alongside `SelectedFileRef` entries from the LAN share. Carries
 * the file bytes directly (no ruc/dni/idAten coordinates).
 */
export interface LocalAttachmentInput {
  filename: string;
  contentType: string;
  content: Buffer;
}
