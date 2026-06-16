import archiver from 'archiver';
import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createFileNode, type FileNode } from '@/features/envio-resultados/domain/file-system/FileNode';
import {
  createFolderNode,
  type FolderNode,
} from '@/features/envio-resultados/domain/file-system/FolderNode';
import type { FileSystemNode } from '@/features/envio-resultados/domain/ports';
import type { IFileRepository } from '@/features/envio-resultados/domain/ports';

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

/**
 * Compose a folder path under the patient root and assert it remains
 * inside the root. Two layers of defense: the route's `sanitizeFolderPath`
 * rejects `..` / leading separators, and this internal containment check
 * protects future direct callers from accidental escape.
 */
function joinFolder(ruc: string, dni: string, idAten: string, relativePath: string): string {
  const root = path.win32.join(BASE_PATH, ruc, dni, idAten);
  if (relativePath === '') return root;
  const full = path.win32.resolve(root, relativePath);
  const resolvedRoot = path.win32.resolve(root);
  if (full !== resolvedRoot && !full.startsWith(resolvedRoot + path.win32.sep)) {
    throw new Error('path inválido');
  }
  return full;
}

function joinFile(folder: string, name: string): string {
  return path.win32.join(folder, name);
}

/** Case-insensitive alphabetical comparator. */
function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * Production adapter for `IFileRepository` backed by Node `fs` against
 * the LAN file share.
 *
 * The adapter is intentionally thin: it trusts its inputs (path-traversal
 * defense is enforced by `sanitizeFolderPath` + the `path.resolve`
 * containment check in the route). Three non-trivial behaviors:
 *
 * - `listFolder` returns `[]` for `ENOENT` (missing folder) and SKIPS
 *   per-file stat failures (logging a warning) so a single bad file
 *   does not poison the whole listing. Folders come first, then files,
 *   both sorted case-insensitively.
 * - `read` resolves the full path under the patient root and returns
 *   a Node `Readable`. Traversal throws synchronously.
 * - `zipAll` returns the streaming archiver handle directly so the
 *   `/api/files/download-all` route can pipe it into the response
 *   without buffering the whole archive in memory.
 */
export class UncFileRepository implements IFileRepository {
  async listFolder(
    ruc: string,
    dni: string,
    idAten: string,
    relativePath: string,
  ): Promise<FileSystemNode[]> {
    const folder = joinFolder(ruc, dni, idAten, relativePath);
    let names: string[];
    try {
      names = await fs.readdir(folder);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      console.warn('[UncFileRepository] readdir failed', { folder, err });
      throw err;
    }
    const folders: FolderNode[] = [];
    const files: FileNode[] = [];
    for (const name of names) {
      try {
        const st = await fs.stat(joinFile(folder, name));
        if (st.isDirectory()) {
          folders.push(createFolderNode({ name }));
        } else if (st.isFile()) {
          if (st.size > SIZE_WARN_BYTES) {
            console.warn('[UncFileRepository] large file', { folder, name, size: st.size });
          }
          files.push(
            createFileNode({
              name,
              sizeBytes: st.size,
              modifiedAt: st.mtime.toISOString(),
            }),
          );
        }
      } catch (err) {
        console.warn('[UncFileRepository] stat failed — skipping', { folder, name, err });
      }
    }
    folders.sort(byName);
    files.sort(byName);
    return [...folders, ...files];
  }

  async read(
    ruc: string,
    dni: string,
    idAten: string,
    relativePath: string,
    name: string,
  ): Promise<NodeJS.ReadableStream> {
    const folder = joinFolder(ruc, dni, idAten, relativePath);
    const filePath = joinFile(folder, name);
    console.log('[UncFileRepository.read]', {
      basePath: BASE_PATH,
      ruc,
      dni,
      idAten,
      relativePath,
      name,
      resolvedFolder: folder,
      resolvedFilePath: filePath,
    });
    try {
      return createReadStream(filePath);
    } catch (err) {
      console.error('[UncFileRepository.read] FAILED', {
        resolvedFilePath: filePath,
        code: (err as NodeJS.ErrnoException).code,
        message: err instanceof Error ? err.message : 'unknown error',
      });
      throw err;
    }
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
    const folder = joinFolder(ruc, dni, idAten, '');
    const archive = archiver('zip', { store: true });
    return { archive, folder };
  }
}
