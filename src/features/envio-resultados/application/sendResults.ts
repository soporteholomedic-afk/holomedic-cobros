import type { IEmailService } from '../domain/ports';
import type { EmailAttachment } from '../domain/entities';

export interface SendResultsParams {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments: EmailAttachment[];
}

/**
 * PR #1 — thin orchestration over `IEmailService`.
 * PR #2 — constructor signature unchanged; `execute` now forwards
 * the new `cc?` field through the widened `IEmailService` options
 * object. The real change (file-resolver + sanitisation + bytes
 * streaming) lands in the next commit; this is the minimal
 * one-line ripple to keep the port widening compilable.
 */
export class SendResultsUseCase {
  constructor(private readonly emailService: IEmailService) {}

  async execute(params: SendResultsParams) {
    return this.emailService.sendWithAttachments({
      to: params.to,
      ...(params.cc ? { cc: params.cc } : {}),
      subject: params.subject,
      html: params.html,
      attachments: params.attachments,
    });
  }
}
