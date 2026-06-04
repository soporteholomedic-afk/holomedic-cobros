import type { IEmailService } from '../domain/ports';
import type { EmailAttachment } from '../domain/entities';

export interface SendResultsParams {
  to: string[];
  subject: string;
  html: string;
  attachments: EmailAttachment[];
}

export class SendResultsUseCase {
  constructor(private readonly emailService: IEmailService) {}

  async execute(params: SendResultsParams) {
    return this.emailService.sendWithAttachments(
      params.to,
      params.subject,
      params.html,
      params.attachments
    );
  }
}
