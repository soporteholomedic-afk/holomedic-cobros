import { describe, it, expect } from 'vitest';

import type { IUsuarioRepository } from '../../domain/ports';
import type { UsuarioRow, CreateUsuarioInput, UpdateUsuarioInput } from '../../domain/entities';
import { CreateUsuarioUseCase } from '../crearUsuario';
import { UpdateUsuarioUseCase } from '../actualizarUsuario';

/**
 * Characterization checkpoint (usuarios-correo, task 1.1): the
 * create/update use cases must forward the WHOLE input object to the
 * repository without field-picking, so a future `correo` field on the
 * input types reaches persistence without touching this layer. If this
 * suite goes RED, the wiring plan must be re-planned before
 * implementing correo (STOP condition for the apply phase).
 */
describe('crear/actualizar usuario use cases — whole-input pass-through', () => {
  const row: UsuarioRow = {
    idUsuario: 'u-1',
    usuario: 'jdoe',
    nombre: 'John Doe',
    area: 'cobranza',
    correo: null,
    permisos: ['cobranza'],
    contrasenaHash: 'hash',
    firma: null,
    activo: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  function makeCapturingRepo() {
    const captured: {
      create: CreateUsuarioInput[];
      update: { id: string; input: UpdateUsuarioInput }[];
    } = { create: [], update: [] };

    const repo: IUsuarioRepository = {
      findByUsuario: async () => null,
      getById: async () => row,
      list: async () => [row],
      create: async (input: CreateUsuarioInput) => {
        captured.create.push(input);
        return row;
      },
      update: async (id: string, input: UpdateUsuarioInput) => {
        captured.update.push({ id, input });
        return row;
      },
      softDelete: async () => undefined,
      updateFirma: async () => undefined,
      getFirma: async () => null,
    };

    return { repo, captured };
  }

  it('CreateUsuarioUseCase forwards the whole input object to repo.create', async () => {
    const { repo, captured } = makeCapturingRepo();
    // Simulates the post-correo input shape: an extra `correo` key that
    // today's types do not model yet. Field-picking in the use case
    // would silently drop it.
    const input = {
      usuario: 'jdoe',
      nombre: 'John Doe',
      area: 'cobranza',
      permisos: ['cobranza' as const],
      contrasena: 'secret',
      correo: 'jdoe@holomedic.com',
    } as CreateUsuarioInput;

    await new CreateUsuarioUseCase(repo).execute(input);

    expect(captured.create).toHaveLength(1);
    expect(captured.create[0]).toEqual(input);
  });

  it('UpdateUsuarioUseCase forwards the whole input object to repo.update', async () => {
    const { repo, captured } = makeCapturingRepo();
    const input = {
      nombre: 'John D. Doe',
      correo: 'nueva@holomedic.com',
    } as UpdateUsuarioInput;

    await new UpdateUsuarioUseCase(repo).execute('u-1', input);

    expect(captured.update).toHaveLength(1);
    expect(captured.update[0]?.id).toBe('u-1');
    expect(captured.update[0]?.input).toEqual(input);
  });
});
