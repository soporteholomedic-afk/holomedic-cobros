import type { IPatientRepository } from '../../domain/ports';
import type { Patient } from '../../domain/entities';

const MOCK_PATIENTS: Patient[] = [
  // Clínica San Pablo — 4 patients
  {
    id: 'pat-001',
    companyId: 'comp-001',
    name: 'María Elena García López',
    dni: '12345678',
    files: [
      { id: 'file-001', patientId: 'pat-001', name: 'CAMO.pdf', type: 'application/pdf', size: 245760 },
      { id: 'file-002', patientId: 'pat-001', name: 'EMO.pdf', type: 'application/pdf', size: 184320 },
    ],
  },
  {
    id: 'pat-002',
    companyId: 'comp-001',
    name: 'Carlos Alberto Mendoza Rivas',
    dni: '23456789',
    files: [
      { id: 'file-003', patientId: 'pat-002', name: 'Legajo.pdf', type: 'application/pdf', size: 512000 },
      { id: 'file-004', patientId: 'pat-002', name: 'CAMO.pdf', type: 'application/pdf', size: 198656 },
      { id: 'file-005', patientId: 'pat-002', name: 'EMO.pdf', type: 'application/pdf', size: 172032 },
    ],
  },
  {
    id: 'pat-003',
    companyId: 'comp-001',
    name: 'Rosa Isabel Torres Paredes',
    dni: '34567890',
    files: [
      { id: 'file-006', patientId: 'pat-003', name: 'CAMO.pdf', type: 'application/pdf', size: 221184 },
    ],
  },
  {
    id: 'pat-004',
    companyId: 'comp-001',
    name: 'José Luis Fernández Castro',
    dni: '45678901',
    files: [
      { id: 'file-007', patientId: 'pat-004', name: 'Legajo.pdf', type: 'application/pdf', size: 602112 },
      { id: 'file-008', patientId: 'pat-004', name: 'EMO.pdf', type: 'application/pdf', size: 196608 },
    ],
  },
  // Laboratorio Médico — 3 patients
  {
    id: 'pat-005',
    companyId: 'comp-002',
    name: 'Ana María Huamán Quispe',
    dni: '56789012',
    files: [
      { id: 'file-009', patientId: 'pat-005', name: 'CAMO.pdf', type: 'application/pdf', size: 233472 },
      { id: 'file-010', patientId: 'pat-005', name: 'EMO.pdf', type: 'application/pdf', size: 188416 },
    ],
  },
  {
    id: 'pat-006',
    companyId: 'comp-002',
    name: 'Pedro Antonio Sánchez Vega',
    dni: '67890123',
    files: [
      { id: 'file-011', patientId: 'pat-006', name: 'Legajo.pdf', type: 'application/pdf', size: 524288 },
      { id: 'file-012', patientId: 'pat-006', name: 'CAMO.pdf', type: 'application/pdf', size: 212992 },
    ],
  },
  {
    id: 'pat-007',
    companyId: 'comp-002',
    name: 'Dora Luz Mamani Ccama',
    dni: '78901234',
    files: [
      { id: 'file-013', patientId: 'pat-007', name: 'CAMO.pdf', type: 'application/pdf', size: 249856 },
      { id: 'file-014', patientId: 'pat-007', name: 'EMO.pdf', type: 'application/pdf', size: 176128 },
      { id: 'file-015', patientId: 'pat-007', name: 'Legajo.pdf', type: 'application/pdf', size: 491520 },
    ],
  },
  // Centro de Diagnóstico — 3 patients
  {
    id: 'pat-008',
    companyId: 'comp-003',
    name: 'Luis Miguel Chávez Domínguez',
    dni: '89012345',
    files: [
      { id: 'file-016', patientId: 'pat-008', name: 'CAMO.pdf', type: 'application/pdf', size: 204800 },
      { id: 'file-017', patientId: 'pat-008', name: 'Legajo.pdf', type: 'application/pdf', size: 573440 },
    ],
  },
  {
    id: 'pat-009',
    companyId: 'comp-003',
    name: 'Carmen Elena Pizarro Flores',
    dni: '90123456',
    files: [
      { id: 'file-018', patientId: 'pat-009', name: 'EMO.pdf', type: 'application/pdf', size: 192512 },
    ],
  },
  {
    id: 'pat-010',
    companyId: 'comp-003',
    name: 'Ricardo Andrés Castillo Morales',
    dni: '10123456',
    files: [
      { id: 'file-019', patientId: 'pat-010', name: 'CAMO.pdf', type: 'application/pdf', size: 237568 },
      { id: 'file-020', patientId: 'pat-010', name: 'EMO.pdf', type: 'application/pdf', size: 180224 },
      { id: 'file-021', patientId: 'pat-010', name: 'Legajo.pdf', type: 'application/pdf', size: 536576 },
    ],
  },
];

export class MockPatientRepo implements IPatientRepository {
  async getByCompanyId(companyId: string): Promise<Patient[]> {
    return MOCK_PATIENTS.filter((p) => p.companyId === companyId);
  }
}
