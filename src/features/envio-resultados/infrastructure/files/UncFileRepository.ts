import archiver from 'archiver';
import { createReadStream, promises as fs } from 'node:fs';
import { createFileNode, type FileNode } from '@/features/envio-resultados/domain/file-system/FileNode';
import {
  createFolderNode,
  type FolderNode,
} from '@/features/envio-resultados/domain/file-system/FolderNode';
import type { FileSystemNode } from '@/features/envio-resultados/domain/ports';
import type { IFileRepository } from '@/features/envio-resultados/domain/ports';
import { pathOs } from '@/lib/platform';
import {
  standardFolder,
  particularFolder,
  resolveExistingFile,
  resolveExistingFolder,
} from './patientPathResolver';

/** Files larger than this emit a structured `console.warn`. Not surfaced. */
const SIZE_WARN_BYTES = 50 * 1024 * 1024;

function joinFile(folder: string, name: string): string {
  return pathOs.join(folder, name);
}

/** Case-insensitive alphabetical comparator. */
function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * Production adapter for `IFileRepository` backed by Node `fs` against
 * the LAN file share.
 *
 * Path resolution uses the fallback helpers from `patientPathResolver`:
 * the standard path (`<BASE>\<ruc>\<dni>\<idAten>\<relPath>`) is tried
 * first; when it does not exist, the "cliente particular" path
 * (`<BASE>\<ruc>\<ruc>\<dni>\<relPath>`) is tried instead. This covers
 * patients whose DNI is reused as the RUC, where the share duplicates
 * the RUC folder and omits the `idAten` level.
 *
 * - `listFolder` returns `[]` when neither path exists and SKIPS
 *   per-file stat failures (logging a warning) so a single bad file
 *   does not poison the whole listing. Folders come first, then files,
 *   both sorted case-insensitively.
 * - `read` resolves the file path with the same fallback and returns
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
    const stdFolder = standardFolder(ruc, dni, idAten, relativePath);
    let folder: string;
    let names: string[];
    try {
      names = await fs.readdir(stdFolder);
      folder = stdFolder;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // Fallback: try the particular path (DNI reused as RUC).
        const partFolder = particularFolder(dni, idAten, relativePath);
        try {
          names = await fs.readdir(partFolder);
          folder = partFolder;
        } catch (err2) {
          if ((err2 as NodeJS.ErrnoException).code === 'ENOENT') return [];
          console.warn('[UncFileRepository] readdir(particular) failed', { folder: partFolder, err: err2 });
          throw err2;
        }
      } else {
        console.warn('[UncFileRepository] readdir failed', { folder: stdFolder, err });
        throw err;
      }
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
    const filePath = await resolveExistingFile(ruc, dni, idAten, relativePath, name);
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
  async zipAll(
    ruc: string,
    dni: string,
    idAten: string,
  ): Promise<{ archive: archiver.Archiver; folder: string }> {
    const folder = await resolveExistingFolder(ruc, dni, idAten, '');
    const archive = archiver('zip', { store: true });
    return { archive, folder };
  }
}
