import type { ICompanyRepository } from '../../domain/ports';
import type { Company } from '../../domain/entities';

const MOCK_COMPANIES: Company[] = [
  {
    id: 'comp-001',
    name: 'Clínica San Pablo',
    ruc: '20123456789',
    email: 'resultados@clinicasanpablo.pe',
  },
  {
    id: 'comp-002',
    name: 'Laboratorio Médico',
    ruc: '20234567890',
    email: 'lab@labmedico.pe',
  },
  {
    id: 'comp-003',
    name: 'Centro de Diagnóstico',
    ruc: '20345678901',
    email: 'resultados@centrodiagnostico.pe',
  },
];

export class MockCompanyRepo implements ICompanyRepository {
  async getAll(): Promise<Company[]> {
    return MOCK_COMPANIES;
  }
}
