import type { DatosEmpresa, Empresa, EstadoEmpresa, NuevaEmpresa } from './entities';

export interface ICrmEmpresaRepository {
  getById(id: string): Promise<Empresa | null>;
  findByRuc(ruc: string): Promise<Empresa | null>;
  /** All empresas with their contacts. */
  list(): Promise<Empresa[]>;
  /** Throws `RucDuplicadoError` when the RUC is already stored. */
  create(input: NuevaEmpresa): Promise<Empresa>;
  /**
   * Replace the empresa data and its whole contacts list in one step.
   * Throws `EmpresaNotFoundError` for an unknown id and `RucDuplicadoError`
   * when the new RUC belongs to another empresa.
   */
  update(id: string, datos: DatosEmpresa): Promise<Empresa>;
  /** Write stage, medium and loss reason together. Throws `EmpresaNotFoundError`. */
  updateEstado(id: string, estado: EstadoEmpresa): Promise<Empresa>;
  /** Sector names, alphabetical. */
  listSectores(): Promise<string[]>;
  /** Throws `SectorDuplicadoError` (case-insensitive). Returns the stored name. */
  createSector(nombre: string): Promise<string>;
}
