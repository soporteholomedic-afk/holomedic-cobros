import { describe, expect, it } from 'vitest';

import type { Permiso } from '@/features/auth/domain/entities';

import { ListarUsuariosAsignablesUseCase } from '../listarUsuariosAsignables';

/**
 * Use-case contract for listarUsuariosAsignables (agente-ia-crm
 * E3·T3) — the escalar target list: users whose permisos include
 * 'crm_conversaciones'. ONLY {id, nombre} crosses the boundary — id
 * is the LOGIN NAME (dbo.usuarios.usuario, the currency asignadaA
 * stores, empresas asignar precedent), never the opaque idUsuario;
 * no other field (area, correo, permisos, hash) leaks. The dep is a
 * narrow structural source the route wires over getUsuarioDb()
 * (/api/usuarios route precedent — list() and nothing else).
 */

interface UsuarioFuente {
  usuario: string;
  nombre: string;
  area: string;
  correo: string | null;
  permisos: Permiso[];
  activo: boolean;
}

class FakeFuenteUsuarios {
  constructor(readonly filas: UsuarioFuente[]) {}

  async list(): Promise<UsuarioFuente[]> {
    return this.filas;
  }
}

const USUARIOS: UsuarioFuente[] = [
  {
    usuario: 'jperez',
    nombre: 'Juan Perez',
    area: 'ventas',
    correo: 'jperez@x.com',
    permisos: ['crm', 'crm_conversaciones'],
    activo: true,
  },
  {
    usuario: 'alborges',
    nombre: 'Ana Borges',
    area: 'ventas',
    correo: null,
    permisos: ['crm_conversaciones'],
    activo: true,
  },
  {
    usuario: 'mlopes',
    nombre: 'Mario Lopes',
    area: 'cobranza',
    correo: null,
    permisos: ['crm'],
    activo: true,
  },
  {
    usuario: 'admin',
    nombre: 'Admin General',
    area: 'sistemas',
    correo: null,
    permisos: ['admin'],
    activo: true,
  },
];

describe('ListarUsuariosAsignablesUseCase — targets del escalar (E3·T3)', () => {
  it('devuelve SOLO usuarios con permiso crm_conversaciones, {id = login, nombre} y nada más', async () => {
    const useCase = new ListarUsuariosAsignablesUseCase(new FakeFuenteUsuarios(USUARIOS));

    const usuarios = await useCase.ejecutar();

    // toEqual exacto: id+nombre ÚNICAMENTE (no area/correo/permisos/hash).
    expect(usuarios).toEqual([
      { id: 'alborges', nombre: 'Ana Borges' },
      { id: 'jperez', nombre: 'Juan Perez' },
    ]);
  });

  it('ningún usuario con el permiso → [] (la lista es una lista, no un error)', async () => {
    const useCase = new ListarUsuariosAsignablesUseCase(
      new FakeFuenteUsuarios([USUARIOS[2]!, USUARIOS[3]!]),
    );

    await expect(useCase.ejecutar()).resolves.toEqual([]);
  });

  it('orden estable por nombre y luego login (determinismo en el selector del UI)', async () => {
    const useCase = new ListarUsuariosAsignablesUseCase(
      new FakeFuenteUsuarios([...USUARIOS].reverse()),
    );

    const usuarios = await useCase.ejecutar();

    expect(usuarios.map((u) => u.id)).toEqual(['alborges', 'jperez']);
  });
});
