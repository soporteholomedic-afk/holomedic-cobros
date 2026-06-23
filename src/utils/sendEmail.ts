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
  /** REQUIRED — each purpose resolves its own SMTP_USER_<PURPOSE> /
   *  SMTP_PASS_<PURPOSE> env vars. No implicit default. */
  purpose: Purpose;
}

export type SendEmailErrorCode =
  | 'SMTP_AUTH_ERROR'
  | 'SMTP_TIMEOUT'
  | 'SMTP_ERROR';

export type SendEmailResult =
  | { success: true; messageId: string }
  | { success: false; code: SendEmailErrorCode; error: string };

// ---- Errors ----

/** Thrown when a purpose's SMTP env vars are missing. The message lists the
 *  missing variable NAMES only — it never includes resolved values (the
 *  password is never part of the message). */
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

// ---- Per-purpose transport cache ----

const transports = new Map<Purpose, nodemailer.Transporter>();

/** Resolve the SMTP config for a purpose. Env-var names are derived uniformly
 *  from the purpose: `SMTP_USER_${purpose.toUpperCase()}` and
 *  `SMTP_PASS_${purpose.toUpperCase()}`. `SMTP_HOST` / `SMTP_PORT` are shared.
 *  Throws `MissingSmtpCredsError` (names only) if any are missing — never
 *  falls back to another purpose's vars. */
function resolveCreds(purpose: Purpose): {
  host: string;
  port: number;
  user: string;
  pass: string;
} {
  const userKey = `SMTP_USER_${purpose.toUpperCase()}`;
  const passKey = `SMTP_PASS_${purpose.toUpperCase()}`;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env[userKey];
  const pass = process.env[passKey];

  if (!host || !port || !user || !pass) {
    const missing: string[] = [];
    if (!host) missing.push('SMTP_HOST');
    if (!port) missing.push('SMTP_PORT');
    if (!user) missing.push(userKey);
    if (!pass) missing.push(passKey);
    throw new MissingSmtpCredsError(purpose, missing);
  }

  return { host, port: parseInt(port, 10), user, pass };
}

/** Return the cached transport for `purpose`, or create one from `creds` on a
 *  cache miss. `creds` is resolved by the caller so the same values feed both
 *  the transport and the `from` field / log lines. */
function getTransport(
  purpose: Purpose,
  creds: { host: string; port: number; user: string; pass: string },
): nodemailer.Transporter {
  const cached = transports.get(purpose);
  if (cached) return cached;
  const transport = nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.port === 465,
    auth: { user: creds.user, pass: creds.pass },
    connectionTimeout: 10000,
  });
  transports.set(purpose, transport);
  return transport;
}

// ---- Main API ----

export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const purpose = params.purpose;
  // Captured outside the send path so the error branches can log the resolved
  // identity (not a re-read of process.env) — see discovery #271.
  let resolvedHost: string | undefined;
  let resolvedPort: number | undefined;
  let resolvedUser: string | undefined;
  try {
    const creds = resolveCreds(purpose);
    resolvedHost = creds.host;
    resolvedPort = creds.port;
    resolvedUser = creds.user;

    const tr = getTransport(purpose, creds);
    const info = await tr.sendMail({
      from: creds.user,
      to: params.to,
      ...(params.cc ? { cc: params.cc } : {}),
      ...(params.attachments ? { attachments: params.attachments } : {}),
      subject: params.subject,
      html: params.html,
    });
    console.log(
      '[sendEmail] Email sent successfully.',
      `MessageId: ${info.messageId}`,
      `To: ${params.to}`,
      `Purpose: ${purpose}`,
    );
    return { success: true, messageId: info.messageId };
  } catch (error) {
    const err = error as Error;
    const message = err.message?.toLowerCase() ?? '';
    const hostPort = `${resolvedHost ?? 'unknown'}:${resolvedPort ?? 'unknown'}`;

    if (message.includes('auth') || message.includes('credentials')) {
      console.error(
        '[sendEmail] SMTP_AUTH_ERROR — the app password may be incorrect or expired.',
        `User: ${resolvedUser ?? 'unknown'}`,
        `Host: ${hostPort}`,
        `Purpose: ${purpose}`,
        `Nodemailer detail: ${err.message}`,
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
        `Host: ${hostPort}`,
        `Purpose: ${purpose}`,
        `Nodemailer detail: ${err.message}`,
      );
      return {
        success: false,
        code: 'SMTP_TIMEOUT',
        error: 'SMTP connection timed out',
      };
    }

    console.error(
      '[sendEmail] SMTP_ERROR — unexpected failure.',
      `Host: ${hostPort}`,
      `Purpose: ${purpose}`,
      `Nodemailer detail: ${err.message}`,
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
