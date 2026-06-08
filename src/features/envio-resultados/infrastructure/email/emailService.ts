import { sendEmail } from '@/utils/sendEmail';
import type { EmailAttachment } from '@/utils/sendEmail';

export interface SendWithAttachmentsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWithAttachments(
  to: string[],
  subject: string,
  html: string,
  attachments: EmailAttachment[]
): Promise<SendWithAttachmentsResult> {
  try {
    const result = await sendEmail({
      to,
      subject,
      html,
      attachments,
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
