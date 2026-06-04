import type { ICompanyRepository } from '../domain/ports';
import type { Company } from '../domain/entities';

export class GetCompaniesUseCase {
  constructor(private readonly companyRepo: ICompanyRepository) {}

  async execute(): Promise<Company[]> {
    return this.companyRepo.getAll();
  }
}
