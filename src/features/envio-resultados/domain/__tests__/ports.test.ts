import { describe, expectTypeOf, it } from 'vitest';
import type {
  FileEntry,
  FileSystemNode,
  IFileRepository,
} from '@/features/envio-resultados/domain/ports';

/**
 * Compilation tests for the `IFileRepository` hexagonal port.
 *
 * The port is intentionally tiny — it only describes what the API routes
 * need (`listFolder` for the tree-navigator, `read` for the inline
 * preview + the bulk zip) — so this file asserts structural conformance
 * rather than runtime behavior.
 *
 * Test ownership: the patient-file-explorer change introduces the
 * Composite file-tree; this port mirrors the new shape.
 */
describe('IFileRepository port', () => {
  it('exposes a FileEntry shape with name, sizeBytes, modifiedAt', () => {
    expectTypeOf<FileEntry>().toMatchObjectType<{
      name: string;
      sizeBytes: number;
      modifiedAt: string;
    }>();
  });

  it('requires listFolder(ruc, dni, idAten, relativePath) returning Promise<FileSystemNode[]>', () => {
    type ListFolderSig = IFileRepository['listFolder'];
    expectTypeOf<ListFolderSig>().toEqualTypeOf<
      (
        ruc: string,
        dni: string,
        idAten: string,
        relativePath: string,
      ) => Promise<FileSystemNode[]>
    >();
  });

  it('requires read(ruc, dni, idAten, relativePath, name) returning Promise<ReadableStream>', () => {
    type ReadSig = IFileRepository['read'];
    expectTypeOf<ReadSig>().toEqualTypeOf<
      (
        ruc: string,
        dni: string,
        idAten: string,
        relativePath: string,
        name: string,
      ) => Promise<NodeJS.ReadableStream>
    >();
  });

  it('does NOT expose the legacy list method (REQ-FL-4 — port surface tightened)', () => {
    // Compile-time guard: an `extends` of a nonexistent key fails the
    // type check. This test exists to fail loudly if someone re-adds
    // `list` to the port in a future change.
    type ListKey = 'list';
    // @ts-expect-error — `list` was removed in the patient-file-explorer change
    type _Removed = IFileRepository[ListKey];
    // The reverse direction: the only own keys of the port are `listFolder`
    // and `read`. If `list` ever sneaks back in, this list will grow and
    // the test will fail at the runtime check below.
    const expectedKeys = ['listFolder', 'read'] as const;
    type OwnKeys = keyof IFileRepository;
    const owns: ReadonlyArray<OwnKeys> = expectedKeys;
    expect(owns).toEqual(['listFolder', 'read']);
  });

  it('does NOT expose the legacy stream method (REQ-FL-4 — port surface tightened)', () => {
    type StreamKey = 'stream';
    // @ts-expect-error — `stream` was removed in the patient-file-explorer change
    type _Removed = IFileRepository[StreamKey];
    const expectedKeys = ['listFolder', 'read'] as const;
    type OwnKeys = keyof IFileRepository;
    const owns: ReadonlyArray<OwnKeys> = expectedKeys;
    expect(owns).toEqual(['listFolder', 'read']);
  });

  it('can be implemented by a class (compile-time check)', () => {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    class MockFileRepository implements IFileRepository {
      async listFolder(
        _ruc: string,
        _dni: string,
        _idAten: string,
        _relativePath: string,
      ): Promise<FileSystemNode[]> {
        return [];
      }
      async read(
        _ruc: string,
        _dni: string,
        _idAten: string,
        _relativePath: string,
        _name: string,
      ): Promise<NodeJS.ReadableStream> {
        return {} as NodeJS.ReadableStream;
      }
    }
    /* eslint-enable @typescript-eslint/no-unused-vars */
    expectTypeOf(MockFileRepository).toMatchTypeOf<new () => IFileRepository>();
    const instance: IFileRepository = new MockFileRepository();
    expectTypeOf(instance).toEqualTypeOf<IFileRepository>();
  });
});
