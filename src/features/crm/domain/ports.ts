import type { Empresa, Etapa, NuevaEmpresa } from './entities';

export interface ICrmEmpresaRepository {
  getById(id: string): Promise<Empresa | null>;
  findByRuc(ruc: string): Promise<Empresa | null>;
  /** All empresas, oldest first inside each column is the caller's concern. */
  list(): Promise<Empresa[]>;
  create(input: NuevaEmpresa): Promise<Empresa>;
  /** Throws `EmpresaNotFoundError` when the id is unknown. */
  updateEtapa(id: string, etapa: Etapa): Promise<Empresa>;
}
