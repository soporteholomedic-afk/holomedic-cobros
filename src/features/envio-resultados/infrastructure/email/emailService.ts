import { sendEmail } from '@/utils/sendEmail';
import type {
  IEmailService,
  SendWithAttachmentsOptions,
  SendWithAttachmentsResult,
} from '@/features/envio-resultados/domain/ports';

/**
 * PR #2 — production adapter for `IEmailService`. Wraps the
 * `@/utils/sendEmail` transport (a thin Nodemailer facade) behind
 * the hexagonal port so the use case depends on the contract, not
 * the implementation. The widened options-object signature lets
 * the use case forward `cc` without smuggling it through other
 * fields.
 */
export class EmailService implements IEmailService {
  async sendWithAttachments(
    options: SendWithAttachmentsOptions,
  ): Promise<SendWithAttachmentsResult> {
    try {
      const result = await sendEmail({
        to: options.to,
        ...(options.cc && options.cc.length > 0 ? { cc: options.cc } : {}),
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      });
      if (result.success) {
        return { success: true, messageId: result.messageId };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * PR #2 — factory used by the API route to obtain an
 * `IEmailService` instance. Returns the concrete `EmailService`
 * by default; a future seam (e.g. an in-memory spy for E2E tests)
 * can be added here without touching the route or the use case.
 */
export function makeEmailService(): IEmailService {
  return new EmailService();
}
