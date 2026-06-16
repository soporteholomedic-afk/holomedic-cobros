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
}

export interface Spitch {
  id: string;
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
