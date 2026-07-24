import type { UsuarioRow, CreateUsuarioInput, UpdateUsuarioInput } from './entities';

export interface IUsuarioRepository {
  findByUsuario(nombre: string): Promise<UsuarioRow | null>;
  getById(id: string): Promise<UsuarioRow | null>;
  list(): Promise<UsuarioRow[]>;
  create(input: CreateUsuarioInput): Promise<UsuarioRow>;
  update(id: string, input: UpdateUsuarioInput): Promise<UsuarioRow>;
  softDelete(id: string): Promise<void>;
  updateFirma(id: string, firma: Buffer): Promise<void>;
  getFirma(id: string): Promise<Buffer | null>;
}
