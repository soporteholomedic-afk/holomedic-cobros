import type {
  Company,
  Patient,
  EmailAttachment,
  EnvioHistoryInsert,
  EnvioHistoryRow,
  EnvioSearchQuery,
  EnvioSearchResult,
  EnvioSendStatus,
} from './entities';
import type { FileSystemNode } from './file-system/FileSystemNode';
// Re-export the Composite types so consumers can `import { FileSystemNode, IFileRepository }`
// from a single module surface (the domain port).
export type { FileNodeKind, FileSystemNode, FileSystemNodeVisitor } from './file-system/FileSystemNode';
export type { FileNode } from './file-system/FileNode';
export { createFileNode } from './file-system/FileNode';
export type { FolderNode } from './file-system/FolderNode';
export { createFolderNode } from './file-system/FolderNode';

export interface ICompanyRepository {
  getAll(): Promise<Company[]>;
}

export interface IPatientRepository {
  getByCompanyId(companyId: string): Promise<Patient[]>;
}

/**
 * PR #2 — the `IEmailService` port now accepts an options object so
 * the use case can forward `cc` to SMTP. The legacy positional-args
 * shape was too narrow for the consolidated send pipeline.
 */
export interface SendWithAttachmentsOptions {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments: EmailAttachment[];
}

export interface SendWithAttachmentsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface IEmailService {
  sendWithAttachments(
    options: SendWithAttachmentsOptions,
  ): Promise<SendWithAttachmentsResult>;
}

/**
 * A file entry — the leaf of the formal GoF Composite returned by
 * `IFileRepository.listFolder`. `modifiedAt` is an ISO 8601 string
 * so it serializes cleanly across the HTTP boundary.
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
 * The port is intentionally tiny. API routes need `listFolder` to render
 * the explorer pane of `FilesModal`, and `read` to stream a single file
 * (both for the bulk download and for the inline preview). A future
 * Linux/S3 adapter can be introduced behind the same interface without
 * touching the routes.
 */
export interface IFileRepository {
  /**
   * List the contents of a (possibly nested) folder, returning the
   * formal Composite node list — folders first, then files, both
   * sorted alphabetically (case-insensitive).
   *
   * `relativePath === ''` lists the patient's root folder.
   * `relativePath === 'subfolder/inner'` lists the nested folder.
   * Returns `[]` when the folder is missing or empty.
   */
  listFolder(
    ruc: string,
    dni: string,
    idAten: string,
    relativePath: string,
  ): Promise<FileSystemNode[]>;
  /**
   * Stream a single file at `{root}/{relativePath}/{name}`. Throws on
   * ENOENT or path traversal. The returned stream emits `error` on
   * I/O failure.
   */
  read(
    ruc: string,
    dni: string,
    idAten: string,
    relativePath: string,
    name: string,
  ): Promise<NodeJS.ReadableStream>;
}

/**
 * Hexagonal port for the consolidated-send history store
 * (`dbo.envios_consolidados`, database `HOLOMEDIC`).
 *
 * Write side (PR1 — historial-envios-consolidados): `insert` +
 * `updateStatus` back the write-then-send recording inside
 * `SendResultsUseCase` (INSERT before dispatch, UPDATE status after).
 * Read side (PR2): `search` + `getById` back the history buscador API.
 */
export interface IEnvioHistoryRepository {
  /** Insert a row (typically with status `'pendiente'`); returns the generated id. */
  insert(input: EnvioHistoryInsert): Promise<string>;
  /** Set the final status (+ error detail) on an existing row. */
  updateStatus(
    id: string,
    status: EnvioSendStatus,
    errorDetail?: string | null,
  ): Promise<void>;
  /** Accent-insensitive paged search across the precomputed columns. */
  search(query: EnvioSearchQuery): Promise<EnvioSearchResult>;
  /** Full row (including `bodyHtml`) by primary key, or null when missing. */
  getById(id: string): Promise<EnvioHistoryRow | null>;
}

// ---------------------------------------------------------------------------
// PDF compression (comprimir-pdfs-consolidados)
//
// Outbound port for the lossless compression seam of the consolidated-send
// pipeline. Implementations live in infrastructure adapters
// (`PdfLibCompressorAdapter`); the application layer depends only on this
// contract, so a future pdfcpu adapter can land without touching it.
// ---------------------------------------------------------------------------

/**
 * Identifier of the strategy that produced a `PdfCompressionResult`.
 *
 * `pdf-lib-lossless` — the adapter re-serialized the document (object
 * streams on, metadata stripped) and the output is strictly smaller.
 * `pdf-lib-passthrough` — no compression was applied and the ORIGINAL
 * input bytes were returned (best-of guarantee).
 * `pdf-lib-image-email` — the lossy email-profile adapter (DCTDecode
 * image surgery via sharp, resize + JPEG re-encode). Like the other
 * ids it names the WIRED strategy and is carried by every row that
 * strategy produces, including its fail-open/passthrough rows.
 * Extensible for future adapters without breaking consumers.
 */
export type PdfCompressionMethod =
  | 'pdf-lib-lossless'
  | 'pdf-lib-passthrough'
  | 'pdf-lib-image-email';

/**
 * Why a compression attempt returned the original bytes unchanged
 * (passthrough). Present on `PdfCompressionResult.skippedReason` only.
 */
export type PdfCompressionSkipReason =
  | 'grew'
  | 'parse-error'
  | 'encrypted'
  | 'timeout'
  | 'not-pdf';

/**
 * Typed outcome of one compression attempt. The best-of contract is
 * structural: `outputBytes <= originalBytes` ALWAYS, and when the two are
 * equal (or the method is passthrough) `bytes` IS the original input, so a
 * send can never grow or degrade a document because of this seam.
 */
export interface PdfCompressionResult {
  /** Best-of bytes: the compressed output, or the original input on passthrough. */
  bytes: Buffer;
  /** Size of the input buffer in bytes. */
  originalBytes: number;
  /** Size of `bytes` in bytes. */
  outputBytes: number;
  /** Strategy that produced `bytes` (see `PdfCompressionMethod`). */
  method: PdfCompressionMethod;
  /** Wall-clock duration of the attempt, in milliseconds. */
  durationMs: number;
  /** Present only when `method` is passthrough — why compression was skipped. */
  skippedReason?: PdfCompressionSkipReason;
}

/**
 * Hexagonal port for lossless PDF compression of transient in-RAM buffers.
 *
 * Contract (spec RF1): input PDF bytes → best-of(original, compressed) bytes
 * plus size metrics and the method used. Implementations MUST be lossless
 * and MUST fail open — compression problems resolve with the original bytes
 * (or throw only where the caller handles it); a send never fails because
 * compression did.
 */
export interface IPdfCompressor {
  compress(pdfBytes: Buffer): Promise<PdfCompressionResult>;
}
