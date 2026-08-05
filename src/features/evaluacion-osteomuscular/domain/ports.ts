import type { EvaluacionOsteomuscular } from '@/types/evaluacion-osteomuscular';

/**
 * Puerto de persistencia de la evaluación clínica osteomuscular,
 * asociada al registro del paciente por `idAtencion`.
 */
export interface IEvaluacionOsteomuscularRepository {
  save(evaluacion: EvaluacionOsteomuscular): Promise<void>;
  loadByAtencion(idAtencion: string): Promise<EvaluacionOsteomuscular | null>;
}
