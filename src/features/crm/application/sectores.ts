import type { ICrmEmpresaRepository } from '../domain/ports';
import { DatosEmpresaInvalidosError } from '../domain/errors';

export class ListarSectoresUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(): Promise<string[]> {
    return this.repo.listSectores();
  }
}

const MAX_SECTOR = 50;

/** Create a sector. Duplicates (any case) are rejected by the repository. */
export class CrearSectorUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(nombre: string): Promise<string> {
    const limpio = (nombre ?? '').trim().replace(/\s+/g, ' ');
    if (limpio.length === 0) throw new DatosEmpresaInvalidosError('Escribe el nombre del sector');
    if (limpio.length > MAX_SECTOR) {
      throw new DatosEmpresaInvalidosError(`El sector admite hasta ${MAX_SECTOR} caracteres`);
    }
    return this.repo.createSector(limpio);
  }
}
