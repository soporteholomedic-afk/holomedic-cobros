import nodemailer from 'nodemailer';

// ---- Types ----

export interface SendEmailParams {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
}

export type SendEmailErrorCode =
  | 'SMTP_AUTH_ERROR'
  | 'SMTP_TIMEOUT'
  | 'SMTP_ERROR';

export type SendEmailResult =
  | { success: true; messageId: string }
  | { success: false; code: SendEmailErrorCode; error: string };

// ---- Lazy singleton transport ----

let transport: nodemailer.Transporter | null = null;

function getEnvOrThrow(): {
  host: string;
  port: number;
  user: string;
  pass: string;
} {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    const missing: string[] = [];
    if (!host) missing.push('SMTP_HOST');
    if (!port) missing.push('SMTP_PORT');
    if (!user) missing.push('SMTP_USER');
    if (!pass) missing.push('SMTP_PASS');
    throw new Error(`SMTP not configured: missing ${missing.join(', ')}`);
  }

  return { host, port: parseInt(port, 10), user, pass };
}

function getTransport(): nodemailer.Transporter {
  if (!transport) {
    const { host, port, user, pass } = getEnvOrThrow();
    transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
    });
  }
  return transport;
}

// ---- Main API ----

export async function sendEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  try {
    const tr = getTransport();
    const info = await tr.sendMail({
      from: process.env.SMTP_USER,
      to: params.to,
      ...(params.cc ? { cc: params.cc } : {}),
      subject: params.subject,
      html: params.html,
    });
    console.log(
      '[sendEmail] Email sent successfully.',
      `MessageId: ${info.messageId}`,
      `To: ${params.to}`
    );
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const err = error as Error;
    const message = err.message?.toLowerCase() ?? '';

    if (message.includes('auth') || message.includes('credentials')) {
      console.error(
        '[sendEmail] SMTP_AUTH_ERROR — the app password may be incorrect or expired.',
        `User: ${process.env.SMTP_USER}`,
        `Host: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`,
        `Nodemailer detail: ${err.message}`
      );
      return {
        success: false,
        code: 'SMTP_AUTH_ERROR',
        error: 'SMTP authentication failed',
      };
    }

    if (message.includes('timeout') || (err as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      console.error(
        '[sendEmail] SMTP_TIMEOUT — connection timed out.',
        `Host: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`,
        `Nodemailer detail: ${err.message}`
      );
      return {
        success: false,
        code: 'SMTP_TIMEOUT',
        error: 'SMTP connection timed out',
      };
    }

    console.error(
      '[sendEmail] SMTP_ERROR — unexpected failure.',
      `Host: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`,
      `Nodemailer detail: ${err.message}`
    );
    return {
      success: false,
      code: 'SMTP_ERROR',
      error: err.message || 'An unexpected SMTP error occurred',
    };
  }
}

// ---- Testing support ----

/** Reset the lazy transport singleton (for testing only). */
export function __resetTransport(): void {
  transport = null;
}
