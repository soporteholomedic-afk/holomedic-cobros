import type { Company, Patient, Spitch, SpitchType, EmailAttachment } from './entities';

export interface ICompanyRepository {
  getAll(): Promise<Company[]>;
}

export interface IPatientRepository {
  getByCompanyId(companyId: string): Promise<Patient[]>;
}

export interface ISpitchRepository {
  getByType(type: SpitchType): Promise<Spitch[]>;
}

export interface IEmailService {
  sendWithAttachments(
    to: string[],
    subject: string,
    html: string,
    attachments: EmailAttachment[]
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

/**
 * A file entry as returned by the `IFileRepository.list` call.
 *
 * `modifiedAt` is an ISO 8601 string so it serializes cleanly across
 * the HTTP boundary without an extra Date<->string conversion layer.
 */
export interface FileEntry {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

/**
 * Hexagonal port for read-only access to the LAN file share where
 * patient archive documents live (e.g. `\\172.16.10.12\sigla\{ruc}\{dni}\{idAten}`).
 *
 * Implementations:
 * - `UncFileRepository` — production adapter backed by Node `fs` over a UNC path.
 *
 * The port is intentionally tiny: API routes need `list` to render the modal
 * and `stream` to send a single file. A future Linux/S3 adapter can be
 * introduced behind the same interface without touching the routes.
 */
export interface IFileRepository {
  /** List files in the patient's folder. Returns `[]` when the path is empty or missing. */
  list(ruc: string, dni: string, idAten: string): Promise<FileEntry[]>;
  /** Stream a single file. The returned stream emits `error` on missing file or I/O error. */
  stream(
    ruc: string,
    dni: string,
    idAten: string,
    name: string,
  ): Promise<NodeJS.ReadableStream>;
}
