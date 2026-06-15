import { describe, expect, it, vi } from 'vitest';
import type { IFileRepository } from '@/features/envio-resultados/domain/ports';
import {
  createFileNode,
  type FileSystemNode,
  type FileSystemNodeVisitor,
} from '@/features/envio-resultados/domain/ports';
import {
  createFolderNode,
  type FolderNode,
} from '@/features/envio-resultados/domain/file-system/FolderNode';

/**
 * A no-op factory that returns a fully-formed mock `IFileRepository`
 * for `FolderNode` tests. Each call to `listFolder` is forwarded to
 * the supplied `impl` function (or a default that resolves `[]`).
 */
function makeMockRepo(
  impl: IFileRepository['listFolder'] = vi
    .fn<() => Promise<FileSystemNode[]>>()
    .mockResolvedValue([]),
): IFileRepository {
  return {
    listFolder: impl,
    read: vi.fn<() => Promise<NodeJS.ReadableStream>>().mockResolvedValue({} as NodeJS.ReadableStream),
  };
}

/**
 * Unit tests for the `FolderNode` Composite of the formal GoF Composite.
 *
 * Three correctness invariants are under test:
 *
 * 1. Lazy children — `children` is empty until `loadChildren` resolves.
 * 2. Idempotency — a second `loadChildren` call returns the cached
 *    value without re-fetching.
 * 3. In-flight de-dupe — two concurrent `loadChildren` calls share the
 *    same underlying promise (no double fetch).
 *
 * The path-composition behavior (REQ-FE-1) is also covered: the node
 * passes the FULL path (including its own name) to `repo.listFolder`.
 */
describe('FolderNode (Composite — lazy children)', () => {
  it('isLoaded() is false at construction and after first load becomes true', async () => {
    const repo = makeMockRepo();
    const folder = createFolderNode({ name: 'subfolder' });

    expect(folder.isLoaded()).toBe(false);

    await folder.loadChildren(repo, 'RUC', '12345678', 'AT-001', '');

    expect(folder.isLoaded()).toBe(true);
  });

  it('loadChildren calls repo.listFolder with the FULL path (name included)', async () => {
    const listFolder = vi
      .fn<() => Promise<FileSystemNode[]>>()
      .mockResolvedValue([]);
    const repo = makeMockRepo(listFolder);
    const folder = createFolderNode({ name: 'subfolder' });

    await folder.loadChildren(repo, 'RUC', '12345678', 'AT-001', '');

    expect(listFolder).toHaveBeenCalledTimes(1);
    expect(listFolder).toHaveBeenCalledWith('RUC', '12345678', 'AT-001', 'subfolder');
  });

  it('loadChildren composes nested paths by appending /<name> to relativePath', async () => {
    const listFolder = vi
      .fn<() => Promise<FileSystemNode[]>>()
      .mockResolvedValue([]);
    const repo = makeMockRepo(listFolder);
    const folder = createFolderNode({ name: 'inner' });

    await folder.loadChildren(repo, 'RUC', '12345678', 'AT-001', 'subfolder');

    expect(listFolder).toHaveBeenCalledWith('RUC', '12345678', 'AT-001', 'subfolder/inner');
  });

  it('getChildren throws before loadChildren has resolved (callers must await)', () => {
    // The repo is unused here — the test only constructs a folder and
    // asserts that getChildren() throws without ever calling
    // loadChildren. Keeping `makeMockRepo` in the test file for
    // consistency with the other tests; this test just does not need it.
    const folder = createFolderNode({ name: 'subfolder' });

    expect(() => folder.getChildren()).toThrow(/loadChildren/);
  });

  it('a second loadChildren call returns the cached value and does NOT re-fetch', async () => {
    const cached: FileSystemNode[] = [
      createFileNode({ name: 'cached.pdf', sizeBytes: 1, modifiedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const listFolder = vi.fn<() => Promise<FileSystemNode[]>>().mockResolvedValue(cached);
    const repo = makeMockRepo(listFolder);
    const folder = createFolderNode({ name: 'subfolder' });

    const first = await folder.loadChildren(repo, 'RUC', '12345678', 'AT-001', '');
    const second = await folder.loadChildren(repo, 'RUC', '12345678', 'AT-001', '');

    expect(listFolder).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(folder.getChildren()).toEqual(cached);
  });

  it('two concurrent loadChildren calls share the same promise (in-flight de-dupe)', async () => {
    let resolveListFolder!: (nodes: FileSystemNode[]) => void;
    const listFolder = vi
      .fn<() => Promise<FileSystemNode[]>>()
      .mockImplementation(
        () =>
          new Promise<FileSystemNode[]>((resolve) => {
            resolveListFolder = resolve;
          }),
      );
    const repo = makeMockRepo(listFolder);
    const folder = createFolderNode({ name: 'subfolder' });

    const p1 = folder.loadChildren(repo, 'RUC', '12345678', 'AT-001', '');
    const p2 = folder.loadChildren(repo, 'RUC', '12345678', 'AT-001', '');

    // Both promises must be the same instance — no second fetch issued.
    expect(p1).toBe(p2);
    expect(listFolder).toHaveBeenCalledTimes(1);

    resolveListFolder([]);
    await Promise.all([p1, p2]);
    expect(folder.isLoaded()).toBe(true);
  });

  it('accept(visitor) dispatches to visitor.visitFolder(this)', () => {
    const folder: FolderNode = createFolderNode({ name: 'subfolder' });
    const visitFile = vi.fn();
    const visitFolder = vi.fn();
    const visitor: FileSystemNodeVisitor = { visitFile, visitFolder };

    folder.accept(visitor);

    expect(visitFolder).toHaveBeenCalledTimes(1);
    expect(visitFolder).toHaveBeenCalledWith(folder);
    expect(visitFile).not.toHaveBeenCalled();
  });

  it('kind is the literal "folder"', () => {
    const folder = createFolderNode({ name: 'subfolder' });
    const kind: 'folder' = folder.kind;
    expect(kind).toBe('folder');
  });
});
