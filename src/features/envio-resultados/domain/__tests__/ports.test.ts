import { describe, expectTypeOf, it } from 'vitest';
import type { FileEntry, IFileRepository } from '@/features/envio-resultados/domain/ports';

/**
 * Compilation tests for the `IFileRepository` hexagonal port.
 *
 * The port is intentionally tiny — it only describes what the API routes
 * need (list + stream) — so this file asserts structural conformance
 * rather than runtime behavior.
 */
describe('IFileRepository port', () => {
  it('exposes a FileEntry shape with name, sizeBytes, modifiedAt', () => {
    expectTypeOf<FileEntry>().toMatchObjectType<{
      name: string;
      sizeBytes: number;
      modifiedAt: string;
    }>();
  });

  it('requires list(ruc, dni, idAten) returning Promise<FileEntry[]>', () => {
    type ListSig = IFileRepository['list'];
    expectTypeOf<ListSig>().toEqualTypeOf<
      (ruc: string, dni: string, idAten: string) => Promise<FileEntry[]>
    >();
  });

  it('requires stream(ruc, dni, idAten, name) returning Promise<ReadableStream>', () => {
    type StreamSig = IFileRepository['stream'];
    expectTypeOf<StreamSig>().toEqualTypeOf<
      (
        ruc: string,
        dni: string,
        idAten: string,
        name: string,
      ) => Promise<NodeJS.ReadableStream>
    >();
  });

  it('can be implemented by a class (compile-time check)', () => {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    class MockFileRepository implements IFileRepository {
      async list(_ruc: string, _dni: string, _idAten: string): Promise<FileEntry[]> {
        return [];
      }
      async stream(
        _ruc: string,
        _dni: string,
        _idAten: string,
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
