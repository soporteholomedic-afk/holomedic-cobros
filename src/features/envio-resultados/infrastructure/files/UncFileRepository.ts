import archiver from 'archiver';
import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { FileEntry, IFileRepository } from '@/features/envio-resultados/domain/ports';

/**
 * Resolved at module load. Production runtime is Windows, where the
 * UNC base path is read directly by Node `fs`. On non-Windows dev
 * machines (Linux CI) the base path is still a syntactically valid
 * Windows path string, so unit tests MUST mock `node:fs` at the
 * module boundary — see `__tests__/UncFileRepository.test.ts`.
 */
const BASE_PATH = process.env.FILE_SERVER_BASE_PATH ?? '';

/** Files larger than this emit a structured `console.warn`. Not surfaced. */
const SIZE_WARN_BYTES = 50 * 1024 * 1024;

function joinFolder(ruc: string, dni: string, idAten: string): string {
  return path.win32.join(BASE_PATH, ruc, dni, idAten);
}

function joinFile(folder: string, name: string): string {
  return path.win32.join(folder, name);
}

/**
 * Production adapter for `IFileRepository` backed by Node `fs` against
 * the LAN file share.
 *
 * The adapter is intentionally thin: it trusts its inputs (path-traversal
 * defense is enforced by `sanitizeDownloadName` + the `path.resolve`
 * containment check in the download route). Two non-trivial behaviors:
 *
 * - `list` returns `[]` for `ENOENT` (missing folder) and SKIPS
 *   per-file stat failures (logging a warning) so a single bad file
 *   does not poison the whole listing.
 * - `zipAll` returns the streaming archiver handle directly so the
 *   `/api/files/download-all` route can pipe it into the response
 *   without buffering the whole archive in memory.
 */
export class UncFileRepository implements IFileRepository {
  async list(ruc: string, dni: string, idAten: string): Promise<FileEntry[]> {
    const folder = joinFolder(ruc, dni, idAten);
    console.log("[UncFileRepository] Reading folder", folder);
    let names: string[];
    try {
      names = await fs.readdir(folder);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      console.warn('[UncFileRepository] readdir failed', { folder, err });
      throw err;
    }
    const entries: FileEntry[] = [];
    for (const name of names) {
      try {
        const st = await fs.stat(joinFile(folder, name));
        if (!st.isFile()) continue;
        if (st.size > SIZE_WARN_BYTES) {
          console.warn('[UncFileRepository] large file', { folder, name, size: st.size });
        }
        entries.push({ name, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() });
      } catch (err) {
        console.warn('[UncFileRepository] stat failed — skipping', { folder, name, err });
      }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return entries;
  }

  async stream(
    ruc: string,
    dni: string,
    idAten: string,
    name: string,
  ): Promise<NodeJS.ReadableStream> {
    const folder = joinFolder(ruc, dni, idAten);
    const filePath = joinFile(folder, name);
    return createReadStream(filePath);
  }

  /**
   * Build a streaming `archiver` for the patient's folder. The caller
   * appends each file's read-stream and calls `archive.finalize()`;
   * we never buffer the full archive in memory.
   */
  zipAll(
    ruc: string,
    dni: string,
    idAten: string,
  ): { archive: archiver.Archiver; folder: string } {
    const folder = joinFolder(ruc, dni, idAten);
    const archive = archiver('zip', { store: true });
    return { archive, folder };
  }
}
