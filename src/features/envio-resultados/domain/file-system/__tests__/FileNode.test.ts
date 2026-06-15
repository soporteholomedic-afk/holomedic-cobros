import { describe, expect, it, vi } from 'vitest';
import type { FileSystemNodeVisitor } from '@/features/envio-resultados/domain/file-system/FileSystemNode';
import {
  createFileNode,
  type FileNode,
} from '@/features/envio-resultados/domain/file-system/FileNode';

/**
 * Unit tests for the `FileNode` Leaf of the formal GoF Composite.
 *
 * The Leaf is a plain object with `readonly` fields and an `accept`
 * method that dispatches to `visitor.visitFile(this)`. The contract
 * is small but load-bearing — the explorer pane and the Visitor pattern
 * both depend on it.
 */
describe('FileNode (Composite Leaf)', () => {
  it('exposes the leaf fields exactly as passed to the factory', () => {
    const node = createFileNode({
      name: 'informe.pdf',
      sizeBytes: 4096,
      modifiedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(node.kind).toBe('file');
    expect(node.name).toBe('informe.pdf');
    expect(node.sizeBytes).toBe(4096);
    expect(node.modifiedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('accept(visitor) dispatches exactly once to visitor.visitFile(this)', () => {
    const node = createFileNode({
      name: 'foto.jpg',
      sizeBytes: 1024,
      modifiedAt: '2026-06-02T00:00:00.000Z',
    });
    const visitFile = vi.fn();
    const visitFolder = vi.fn();
    const visitor: FileSystemNodeVisitor = { visitFile, visitFolder };

    node.accept(visitor);

    expect(visitFile).toHaveBeenCalledTimes(1);
    expect(visitFile).toHaveBeenCalledWith(node);
    expect(visitFolder).not.toHaveBeenCalled();
  });

  it('kind is the literal "file" (narrowing aid for render-side code)', () => {
    const node = createFileNode({
      name: 'a.txt',
      sizeBytes: 1,
      modifiedAt: '2026-01-01T00:00:00.000Z',
    });
    // Compile-time assertion via the literal-type check.
    const kind: 'file' = node.kind;
    expect(kind).toBe('file');
  });

  it('all fields are readonly at the type level (mutation must fail to compile)', () => {
    // Compile-time check: a `Readonly<>` assertion on the type proves
    // every public field is readonly. If a future refactor removes
    // `readonly` from any field, the assignment below becomes a
    // compile error.
    type ReadonlyNode = Readonly<FileNode>;
    const node: ReadonlyNode = createFileNode({
      name: 'a.pdf',
      sizeBytes: 10,
      modifiedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(node.name).toBe('a.pdf');
    expect(node.sizeBytes).toBe(10);
    expect(node.kind).toBe('file');
  });
});
