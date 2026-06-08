export type SpitchType = 'company' | 'patient';

export interface Company {
  id: string;
  name: string;
  ruc: string;
  email: string;
}

export interface Patient {
  id: string;
  companyId: string;
  name: string;
  dni: string;
  files: PatientFile[];
}

export interface PatientFile {
  id: string;
  patientId: string;
  name: string;
  type: string;
  size: number;
}

export interface Spitch {
  id: string;
  type: SpitchType;
  name: string;
  subject: string;
  bodyHtml: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}
