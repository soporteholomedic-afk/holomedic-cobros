import type { FileSystemNode, FileSystemNodeVisitor } from './FileSystemNode';

/**
 * Leaf of the formal GoF Composite (see `FileSystemNode`). A `FileNode`
 * represents a single file in the patient's archive tree. It carries
 * the metadata the explorer pane renders (`sizeBytes`, `modifiedAt`)
 * and the basename shown in the listing.
 *
 * Created via the `createFileNode` factory — this keeps the Composite
 * idiomatic in modern TypeScript (no `class` / `private` gymnastics,
 * plain `readonly` object with a closure-free `accept`).
 */
export interface FileNode extends FileSystemNode {
  readonly kind: 'file';
  readonly sizeBytes: number;
  readonly modifiedAt: string;
  accept(visitor: FileSystemNodeVisitor): void;
}

/**
 * Construct a `FileNode`. `modifiedAt` is an ISO 8601 string so it
 * serializes cleanly across the HTTP boundary without an extra
 * `Date<->string` conversion layer.
 */
export function createFileNode(args: {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}): FileNode {
  return {
    kind: 'file',
    name: args.name,
    sizeBytes: args.sizeBytes,
    modifiedAt: args.modifiedAt,
    accept(visitor: FileSystemNodeVisitor): void {
      visitor.visitFile(this);
    },
  };
}
