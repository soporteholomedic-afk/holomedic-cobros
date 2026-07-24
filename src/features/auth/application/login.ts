import bcrypt from 'bcryptjs';
import { signJwt } from '@/lib/auth';
import type { IUsuarioRepository } from '../domain/ports';
import type { LoginInput, LoginResult } from '../domain/entities';
import { InvalidCredentialsError } from '../infrastructure/sqlserver';

export class LoginUseCase {
  constructor(private readonly repo: IUsuarioRepository) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const usuario = await this.repo.findByUsuario(input.usuario);
    if (!usuario) throw new InvalidCredentialsError();
    if (!usuario.activo) throw new InvalidCredentialsError();

    const valid = await bcrypt.compare(input.contrasena, usuario.contrasenaHash);
    if (!valid) throw new InvalidCredentialsError();

    const token = signJwt({
      sub: usuario.idUsuario,
      nombre: usuario.nombre,
      area: usuario.area,
      permisos: usuario.permisos,
    });

    const { contrasenaHash: _hash, ...usuarioSinHash } = usuario;
    return { usuario: usuarioSinHash, token };
  }
}
