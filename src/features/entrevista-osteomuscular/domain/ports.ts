import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';

/**
 * Puerto de persistencia de la entrevista de cuestionario anamnésico
 * osteomuscular, asociada al registro del paciente por `idAtencion`.
 */
export interface IEntrevistaOsteomuscularRepository {
  save(entrevista: EntrevistaOsteomuscular): Promise<void>;
  loadByAtencion(idAtencion: string): Promise<EntrevistaOsteomuscular | null>;
}
