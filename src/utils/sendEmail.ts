import nodemailer from 'nodemailer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// ---- Types ----

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  /** Content-ID the html body references (`src="cid:<id>"`) — used by
   *  the embedded signature logo and any future inline image. */
  cid?: string;
}

export type Purpose = 'consolidados' | 'facturacion' | 'cobranza';

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

/**
 * Resolve the SMTP config for a purpose, with the cobranza fallback
 * (REQ-01 DIR-10, design D6): when `cobranza` creds are missing BUT the
 * facturacion creds exist, cobranza dispatches through facturacion.
 * Every other purpose (and every other error type) propagates untouched —
 * only the cobranza + MissingSmtpCredsError combination falls back. If the
 * facturacion resolution also throws, that error surfaces (so a totally
 * unconfigured environment still fails fast, naming the facturacion vars).
 */
function resolveCredsWithFallback(purpose: Purpose): {
  host: string;
  port: number;
  user: string;
  pass: string;
} {
  try {
    return resolveCreds(purpose);
  } catch (err) {
    if (purpose === 'cobranza' && err instanceof MissingSmtpCredsError) {
      return resolveCreds('facturacion');
    }
    throw err;
  }
}

/** Return the cached transport for `purpose`, or create one from `creds` on a
 *  cache miss. `creds` is resolved by the caller so the same values feed both
 *  the transport and the `from` field / log lines. The cache key stays the
 *  purpose — a cobranza send under facturacion creds still gets its OWN
 *  transport entry (no cross-purpose cache aliasing). */
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

// ---- Embedded signature logo (firma-correo redesign) ----

const LOGO_CID = 'holomedic-logo';
const LOGO_FILENAME = 'logo-holomedic.png';
const LOGO_PATH = path.resolve(process.cwd(), 'public', 'logo-holomedic.png');

/**
 * Lazily-read, module-cached logo buffer. The file is read ONCE per
 * process; a failed read resolves to `null` (warned, also cached) so a
 * missing logo NEVER fails a send — the email just goes out without
 * the embedded image.
 */
let logoBufferPromise: Promise<Buffer | null> | null = null;

function loadLogoBuffer(): Promise<Buffer | null> {
  if (logoBufferPromise === null) {
    logoBufferPromise = readFile(LOGO_PATH).then(
      (content) => content,
      (error: unknown) => {
        console.warn(
          '[sendEmail] Could not read the signature logo — sending without it.',
          `Path: ${LOGO_PATH}`,
          `Reason: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      },
    );
  }
  return logoBufferPromise;
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

  // Signature logo embedding: when the body references the logo cid and
  // no attachment already carries it, append the cached public asset.
  // Runs before the try block on purpose — logo resolution can never be
  // misclassified as an SMTP error.
  let attachments = params.attachments;
  if (
    params.html.includes(`cid:${LOGO_CID}`) &&
    !(params.attachments ?? []).some((attachment) => attachment.cid === LOGO_CID)
  ) {
    const logo = await loadLogoBuffer();
    if (logo !== null) {
      attachments = [
        ...(params.attachments ?? []),
        {
          filename: LOGO_FILENAME,
          content: logo,
          contentType: 'image/png',
          cid: LOGO_CID,
        },
      ];
    }
  }

  try {
    const creds = resolveCredsWithFallback(purpose);
    resolvedHost = creds.host;
    resolvedPort = creds.port;
    resolvedUser = creds.user;

    const tr = getTransport(purpose, creds);
    const info = await tr.sendMail({
      from: creds.user,
      to: params.to,
      ...(params.cc ? { cc: params.cc } : {}),
      ...(attachments ? { attachments } : {}),
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

/** Reset the module-level logo cache (for testing only) so each test
 *  controls the outcome of the lazy `public/logo-holomedic.png` read. */
export function __resetLogoCache(): void {
  logoBufferPromise = null;
}
