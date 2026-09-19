import { NotFoundError, ValidationError } from '../domain/errors';
import type { CrmEmpresaRepositoryPort, CrmHandoffsRepositoryPort } from '../domain/ports';

export interface RegistrarHandoffInput {
  empresaId: number;
  area: string;
  nota?: string | null;
  usuario: string;
}

export interface ResultadoRegistrarHandoff {
  id: number;
}

const AREA_MAX = 100; // CRM_Handoffs.area NV(100)

/**
 * RegistrarHandoffUseCase (design application map / spec G4 "Handoff
 * recorded"): a standalone internal handoff record (área, nota, user)
 * an empresa can carry at any time — separate from the T5 transition,
 * whose handoff rides the transition transaction. Single-row write →
 * single-statement insert on the port (design §2 transaction
 * strategy).
 */
export class RegistrarHandoffUseCase {
  constructor(
    private readonly empresas: CrmEmpresaRepositoryPort,
    private readonly handoffs: CrmHandoffsRepositoryPort,
  ) {}

  async execute(input: RegistrarHandoffInput): Promise<ResultadoRegistrarHandoff> {
    const area = input.area.trim();
    if (area === '') {
      throw new ValidationError('El área es obligatoria para registrar el handoff');
    }
    if (area.length > AREA_MAX) {
      throw new ValidationError(`El área no puede exceder ${AREA_MAX} caracteres`);
    }
    const nota = input.nota?.trim();

    const empresa = await this.empresas.obtenerPorId(input.empresaId);
    if (!empresa) {
      throw new NotFoundError('Empresa no encontrada');
    }

    const id = await this.handoffs.registrar({
      empresaId: input.empresaId,
      area,
      nota: nota ? nota : null,
      usuario: input.usuario,
    });
    return { id };
  }
}
