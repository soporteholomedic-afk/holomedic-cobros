import type { IFileRepository } from '@/features/envio-resultados/domain/ports';
import type {
  FileSystemNode,
  FileSystemNodeVisitor,
} from './FileSystemNode';

/**
 * Composite of the formal GoF Composite (see `FileSystemNode`). A
 * `FolderNode` represents a directory in the patient's archive tree.
 *
 * Two correctness invariants are enforced by the factory's closure:
 *
 * - **Lazy children**: `children` is `null` until `loadChildren` has
 *   resolved. `getChildren()` throws if called before the load — a
 *   structural guard against render-side "show me what's in the folder"
 *   calls that have not yet triggered a fetch.
 * - **Idempotency + in-flight de-dupe**: a second `loadChildren` call
 *   returns the cached value without re-fetching. Two concurrent calls
 *   share the same underlying `Promise`, so React strict-mode
 *   double-invokes (and a rapid double-click) issue exactly one HTTP
 *   request.
 *
 * The `loadChildren` signature takes the FULL `relativePath` (including
 * this folder's own name) so the node stays a pure data carrier — the
 * caller (`useFileTree`) owns the path. The repo resolves it server-side.
 */
export interface FolderNode extends FileSystemNode {
  readonly kind: 'folder';
  isLoaded(): boolean;
  loadChildren(
    repo: IFileRepository,
    ruc: string,
    dni: string,
    idAten: string,
    relativePath: string,
  ): Promise<readonly FileSystemNode[]>;
  getChildren(): readonly FileSystemNode[];
  accept(visitor: FileSystemNodeVisitor): void;
}

/**
 * Construct a `FolderNode` backed by a closure that owns the lazy
 * `children` slot and the in-flight de-dupe promise.
 */
export function createFolderNode(args: { name: string }): FolderNode {
  let cachedChildren: readonly FileSystemNode[] | null = null;
  let loadPromise: Promise<readonly FileSystemNode[]> | null = null;

  return {
    kind: 'folder',
    name: args.name,
    isLoaded(): boolean {
      return cachedChildren !== null;
    },
    loadChildren(
      repo: IFileRepository,
      ruc: string,
      dni: string,
      idAten: string,
      relativePath: string,
    ): Promise<readonly FileSystemNode[]> {
      // 1. Already loaded → return the cached array.
      if (cachedChildren !== null) return Promise.resolve(cachedChildren);
      // 2. In-flight → return the existing promise (de-dupe).
      if (loadPromise !== null) return loadPromise;
      // 3. Compose the full path: the node's own name is appended to
      //    the caller's relative path. Empty relativePath means this
      //    folder is at the patient's root, so we use just the name.
      const fullPath = relativePath === '' ? args.name : `${relativePath}/${args.name}`;
      // 4. Issue the fetch and cache the promise.
      loadPromise = repo
        .listFolder(ruc, dni, idAten, fullPath)
        .then((nodes) => {
          cachedChildren = nodes;
          loadPromise = null;
          return nodes;
        })
        .catch((err: unknown) => {
          // Clear the in-flight slot so a retry can re-issue the fetch.
          loadPromise = null;
          throw err;
        });
      return loadPromise;
    },
    getChildren(): readonly FileSystemNode[] {
      if (cachedChildren === null) {
        throw new Error(
          'FolderNode.getChildren() called before loadChildren() resolved',
        );
      }
      return cachedChildren;
    },
    accept(visitor: FileSystemNodeVisitor): void {
      visitor.visitFolder(this);
    },
  };
}
