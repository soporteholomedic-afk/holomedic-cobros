import type { FileNode } from './FileNode';
import type { FolderNode } from './FolderNode';

/**
 * The discriminator for the formal GoF Composite implemented in this
 * directory. `file` is a leaf (`FileNode`) and `folder` is the composite
 * (`FolderNode`).
 */
export type FileNodeKind = 'file' | 'folder';

/**
 * Component interface for the formal GoF Composite. Every node in the
 * patient's archive tree implements this contract:
 *
 * - `name` is the basename shown in the explorer pane (no path
 *   separators).
 * - `kind` discriminates `FileNode` (leaf) from `FolderNode` (composite)
 *   for render-side narrowing.
 * - `accept(visitor)` is the Visitor seam. It lets future bulk
 *   operations (e.g. "download all descendants of this folder", "validate
 *   this subtree") walk the tree uniformly without `instanceof` checks.
 */
export interface FileSystemNode {
  readonly name: string;
  readonly kind: FileNodeKind;
  accept(visitor: FileSystemNodeVisitor): void;
}

/**
 * Visitor interface for the formal GoF Composite. Concrete visitors
 * implement `visitFile` for leaves and `visitFolder` for composites.
 * Nodes dispatch to the right method via `accept(visitor)`.
 */
export interface FileSystemNodeVisitor {
  visitFile(node: FileNode): void;
  visitFolder(node: FolderNode): void;
}
