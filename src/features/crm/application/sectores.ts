import { esIconoSector, type Sector } from '../domain/entities';
import type { ICrmEmpresaRepository } from '../domain/ports';
import { DatosEmpresaInvalidosError } from '../domain/errors';

export class ListarSectoresUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(): Promise<Sector[]> {
    return this.repo.listSectores();
  }
}

export const MAX_SECTOR = 50;

/** Trim and collapse inner whitespace: the form a sector name is stored in. */
export function limpiarSector(nombre: string): string {
  return (nombre ?? '').trim().replace(/\s+/g, ' ');
}

/** Create a sector with an optional icon. Duplicates (any case) are rejected by the repository. */
export class CrearSectorUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(nombre: string, icono?: string | null): Promise<Sector> {
    const limpio = limpiarSector(nombre);
    if (limpio.length === 0) throw new DatosEmpresaInvalidosError('Escribe el nombre del sector');
    if (limpio.length > MAX_SECTOR) {
      throw new DatosEmpresaInvalidosError(`El sector admite hasta ${MAX_SECTOR} caracteres`);
    }
    if (icono !== undefined && icono !== null && !esIconoSector(icono)) {
      throw new DatosEmpresaInvalidosError('Ícono desconocido');
    }
    return this.repo.createSector(limpio, icono ?? null);
  }
}
