import type { Company, Patient, Spitch, SpitchType, EmailAttachment } from './entities';

export interface ICompanyRepository {
  getAll(): Promise<Company[]>;
}

export interface IPatientRepository {
  getByCompanyId(companyId: string): Promise<Patient[]>;
}

export interface ISpitchRepository {
  getByType(type: SpitchType): Promise<Spitch[]>;
}

export interface IEmailService {
  sendWithAttachments(
    to: string[],
    subject: string,
    html: string,
    attachments: EmailAttachment[]
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;
}
