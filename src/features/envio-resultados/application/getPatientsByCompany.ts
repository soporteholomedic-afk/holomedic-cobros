import type { IPatientRepository } from '../domain/ports';
import type { Patient } from '../domain/entities';

export class GetPatientsByCompanyUseCase {
  constructor(private readonly patientRepo: IPatientRepository) {}

  async execute(companyId: string): Promise<Patient[]> {
    return this.patientRepo.getByCompanyId(companyId);
  }
}
