import nodemailer from 'nodemailer';

// ---- Types ----

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export type Purpose = 'consolidados' | 'facturacion';

export interface SendEmailParams {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  /** WU-1: optional (defaults to 'facturacion'). WU-2 makes it required. */
  purpose?: Purpose;
}

export type SendEmailErrorCode =
  | 'SMTP_AUTH_ERROR'
  | 'SMTP_TIMEOUT'
  | 'SMTP_ERROR';

export type SendEmailResult =
  | { success: true; messageId: string }
  | { success: false; code: SendEmailErrorCode; error: string };

// ---- Per-purpose transport cache ----

const transports = new Map<Purpose, nodemailer.Transporter>();

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

function getTransport(purpose: Purpose): nodemailer.Transporter {
  const cached = transports.get(purpose);
  if (cached) return cached;
  const { host, port, user, pass } = getEnvOrThrow();
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
  });
  transports.set(purpose, transport);
  return transport;
}

// ---- Main API ----

export async function sendEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  const purpose: Purpose = params.purpose ?? 'facturacion';
  try {
    const tr = getTransport(purpose);
    const info = await tr.sendMail({
      from: process.env.SMTP_USER,
      to: params.to,
      ...(params.cc ? { cc: params.cc } : {}),
      ...(params.attachments ? { attachments: params.attachments } : {}),
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

/** Reset the per-purpose transport cache (for testing only).
 *  No argument clears all transports; a purpose clears only that entry. */
export function __resetTransport(purpose?: Purpose): void {
  if (purpose === undefined) {
    transports.clear();
  } else {
    transports.delete(purpose);
  }
}

// ---- Errors ----

/** Thrown when a purpose's SMTP env vars are missing. The message lists the
 *  missing variable NAMES only — it never includes resolved values (the
 *  password is never part of the message). WU-1 declares the class; WU-2
 *  throws it from the per-purpose resolver. */
export class MissingSmtpCredsError extends Error {
  readonly purpose: string;
  readonly missing: string[];
  constructor(purpose: string, missing: string[]) {
    super(`SMTP not configured for ${purpose}: missing ${missing.join(', ')}`);
    this.name = 'MissingSmtpCredsError';
    this.purpose = purpose;
    this.missing = missing;
  }
}
