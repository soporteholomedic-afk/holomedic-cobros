import type { Company, Patient, Spitch, SpitchType, EmailAttachment } from './entities';
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
