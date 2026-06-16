import { describe, it, expect } from 'vitest';
import type {
  Company,
  Patient,
  PatientFile,
  SelectedFileRef,
  Spitch,
  EmailAttachment,
  SpitchType,
} from '../entities';

describe('Company entity', () => {
  it('should create a valid Company object', () => {
    const company: Company = {
      id: 'comp-001',
      name: 'Clínica San Pablo',
      ruc: '20123456789',
      email: 'info@sanpablo.pe',
    };

    expect(company.id).toBe('comp-001');
    expect(company.name).toBe('Clínica San Pablo');
    expect(company.ruc).toBe('20123456789');
    expect(company.email).toBe('info@sanpablo.pe');
  });
});

describe('Patient entity', () => {
  it('should create a valid Patient with files', () => {
    const file: PatientFile = {
      id: 'file-001',
      patientId: 'pat-001',
      name: 'CAMO.pdf',
      type: 'application/pdf',
      size: 245760,
    };

    const patient: Patient = {
      id: 'pat-001',
      companyId: 'comp-001',
      name: 'María Elena García',
      dni: '12345678',
      files: [file],
    };

    expect(patient.id).toBe('pat-001');
    expect(patient.companyId).toBe('comp-001');
    expect(patient.name).toBe('María Elena García');
    expect(patient.dni).toBe('12345678');
    expect(patient.files).toHaveLength(1);
    expect(patient.files[0].name).toBe('CAMO.pdf');
  });

  it('should allow empty files array', () => {
    const patient: Patient = {
      id: 'pat-002',
      companyId: 'comp-001',
      name: 'Paciente Sin Archivos',
      dni: '87654321',
      files: [],
    };

    expect(patient.files).toHaveLength(0);
  });
});

describe('Spitch entity', () => {
  it('should create a company-type spitch', () => {
    const spitch: Spitch = {
      id: 'spitch-001',
      type: 'company',
      name: 'Resumen general',
      subject: 'Informe consolidado',
      bodyHtml: '<p>Test</p>',
    };

    expect(spitch.type).toBe('company');
    expect(spitch.bodyHtml).toContain('<p>');
  });

  it('should create a patient-type spitch', () => {
    const spitch: Spitch = {
      id: 'spitch-002',
      type: 'patient',
      name: 'Notificación personal',
      subject: 'Resultados de {{paciente}}',
      bodyHtml: '<p>Hola {{paciente}}</p>',
    };

    expect(spitch.type).toBe('patient');
  });
});

describe('EmailAttachment entity', () => {
  it('should create an attachment with Buffer content', () => {
    const attachment: EmailAttachment = {
      filename: 'resultado.pdf',
      content: Buffer.from('fake-pdf-content'),
      contentType: 'application/pdf',
    };

    expect(attachment.filename).toBe('resultado.pdf');
    expect(attachment.content).toBeInstanceOf(Buffer);
  });

  it('should create an attachment with string content', () => {
    const attachment: EmailAttachment = {
      filename: 'report.html',
      content: '<html></html>',
    };

    expect(typeof attachment.content).toBe('string');
  });
});

describe('SpitchType', () => {
  it('should only allow "company" or "patient"', () => {
    const validTypes: SpitchType[] = ['company', 'patient'];
    expect(validTypes).toHaveLength(2);
  });
});

/**
 * PR #1 — new send-payload entity.
 * `SelectedFileRef` carries the LAN-share location triple
 * (`ruc`/`dni`/`idAten`) plus the relative `path` and `name` that
 * `IFileRepository.read` needs. It is distinct from `PatientFile` (the
 * display entity) by design.
 */
describe('SelectedFileRef entity', () => {
  it('should create a ref for a subfolder file (explorer pane path)', () => {
    const ref: SelectedFileRef = {
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      name: 'cert.pdf',
    };

    expect(ref).toEqual({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      name: 'cert.pdf',
    });
  });

  it('should allow an empty path (ready-pane root selection)', () => {
    const ref: SelectedFileRef = {
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: '',
      name: 'cert.pdf',
    };

    expect(ref.path).toBe('');
  });

  it('should allow a nested path (explorer-pane deep selection)', () => {
    const ref: SelectedFileRef = {
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'EXAMENES/2024',
      name: 'emo.pdf',
    };

    expect(ref.path).toBe('EXAMENES/2024');
    expect(ref.name).toBe('emo.pdf');
  });
});
