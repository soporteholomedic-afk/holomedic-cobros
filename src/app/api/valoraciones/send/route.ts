import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { EdgeUnavailableError } from '@/features/musculoesqueletica-pdf/domain/errors';
import { nombreEmpresa } from '@/features/valoraciones/domain/agrupacion';
import { parseEmpresaField, parseFiltroDto } from '@/features/valoraciones/domain/parseFiltroDto';
import { getValoracionesDb } from '@/features/valoraciones/infrastructure/getValoracionesDb';
import { generarFormato35Workbook } from '@/features/valoraciones/infrastructure/excel/formato35';
import { nombreArchivoExportacion } from '@/features/valoraciones/infrastructure/filename';
import {
  nombrePdf,
  renderValoracionesPdf,
} from '@/features/valoraciones/infrastructure/pdf/renderValoracionesPdf';
import { sendEmail, type EmailAttachment } from '@/utils/sendEmail';

/**
 * POST /api/valoraciones/send (REQ-03 M-R1/M-R4, slice 3)
 *
 * Dedicated dispatch route under permiso `valoraciones` (prefix
 * registration in `RUTAS_PROTEGIDAS`; the shared `/api/send-email`
 * requires `cobranza`). SMTP purpose `facturacion` — existing creds, no
 * new env pair (design D5). v1 writes NO audit rows to HOLOMEDIC.
 *
 * FormData contract (no operator file uploads — M-R4: attachments
 * regenerate server-side from the posted filter, D4 tamper-proof):
 *   filtro       — JSON string of the ValoracionesFilter
 *   to           — comma-separated recipients (required, ≤10 with cc)
 *   cc           — comma-separated copies (optional)
 *   subject/html — required non-empty strings
 *   adjuntarPdf / adjuntarExcel — 'true' | 'false' (default 'false')
 *   empresa      — optional U6 per-empresa scope (group key); attachments
 *                  regenerate from ONLY that empresa's rows and are named
 *                  `[NombreEmpresa]_[fecIni].[ext]`
 *
 * Failures are user-safe: SMTP codes map to 503/500 with the safe
 * transport message, Edge-unavailable → 502, anything else → a fixed
 * Spanish 500 (no SP names, hosts, credentials or stack).
 */

// ---- Response types ----

interface SuccessResponse {
  success: true;
  messageId: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  code:
    | 'VALIDATION_ERROR'
    | 'SMTP_AUTH_ERROR'
    | 'SMTP_TIMEOUT'
    | 'SMTP_ERROR'
    | 'PDF_UNAVAILABLE'
    | 'INTERNAL_ERROR';
}

type ApiResponse = SuccessResponse | ErrorResponse;

// ---- Helpers ----

function buildError(
  code: ErrorResponse['code'],
  error: string,
  status: number,
): NextResponse<ErrorResponse> {
  return NextResponse.json({ success: false, error, code }, { status });
}

/** Same email shape convention as /api/send-email. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Split a comma-joined recipient list into trimmed, non-empty entries. */
function splitRecipientList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

const MAX_RECIPIENTS = 10;

interface ParsedSendForm {
  filtroJson: string;
  to: string[];
  cc: string[] | undefined;
  subject: string;
  html: string;
  adjuntarPdf: boolean;
  adjuntarExcel: boolean;
  empresa: string | undefined;
}

/**
 * Parse + validate the FormData body. Returns the normalized fields or a
 * 400 response (validation runs BEFORE any DB/SMTP work).
 */
async function parseSendForm(request: Request): Promise<ParsedSendForm | NextResponse<ErrorResponse>> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return buildError('VALIDATION_ERROR', 'Cuerpo de la solicitud inválido (FormData requerido)', 400);
  }

  const str = (name: string): string => {
    const v = formData.get(name);
    return typeof v === 'string' ? v : '';
  };
  const flag = (name: string): boolean => str(name) === 'true';

  const filtroJson = str('filtro');
  if (filtroJson === '') {
    return buildError('VALIDATION_ERROR', 'Missing required field: filtro', 400);
  }

  const subject = str('subject');
  const html = str('html');
  if (subject === '' || html === '') {
    return buildError('VALIDATION_ERROR', 'Missing required fields: subject, html', 400);
  }

  const to = splitRecipientList(str('to'));
  if (to.length === 0) {
    return buildError('VALIDATION_ERROR', 'At least one recipient required', 400);
  }
  for (const email of to) {
    if (!isValidEmail(email)) {
      return buildError('VALIDATION_ERROR', `Invalid email address: ${email}`, 400);
    }
  }

  const ccRaw = str('cc');
  const cc = ccRaw === '' ? undefined : splitRecipientList(ccRaw);
  if (cc) {
    for (const email of cc) {
      if (!isValidEmail(email)) {
        return buildError('VALIDATION_ERROR', `Invalid email address in CC: ${email}`, 400);
      }
    }
  }

  if (to.length + (cc?.length ?? 0) > MAX_RECIPIENTS) {
    return buildError('VALIDATION_ERROR', `Max ${MAX_RECIPIENTS} recipients allowed`, 400);
  }

  // U6 per-empresa scoping (optional): validate BEFORE any DB/SMTP work,
  // same rules as the export routes.
  const scoped = parseEmpresaField(str('empresa') === '' ? undefined : str('empresa'));
  if (scoped.error) {
    return buildError('VALIDATION_ERROR', scoped.error, 400);
  }

  return {
    filtroJson,
    to,
    cc,
    subject,
    html,
    adjuntarPdf: flag('adjuntarPdf'),
    adjuntarExcel: flag('adjuntarExcel'),
    empresa: scoped.empresa,
  };
}

/** Regenerate the Formato 35 `.xlsx` buffer from the filter (D4, U6-scoped). */
async function generarExcelAttachment(
  repo: Awaited<ReturnType<typeof getValoracionesDb>>,
  filtro: ReturnType<typeof parseFiltroDto>['filtro'] & object,
  empresa: string | undefined,
): Promise<EmailAttachment> {
  const todas = await repo.buscarValoraciones(filtro);
  const rows =
    empresa === undefined ? todas : todas.filter((row) => nombreEmpresa(row) === empresa);
  const workbook = generarFormato35Workbook(rows, filtro.codMon);
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return {
    filename: nombreArchivoExportacion(empresa, filtro.fecIni, 'xlsx', filtro.fecFin),
    content: buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

// ---- POST handler ----

export async function POST(request: Request): Promise<NextResponse<ApiResponse>> {
  try {
    const parsed = await parseSendForm(request);
    if (parsed instanceof NextResponse) return parsed;

    let filtroDto: unknown;
    try {
      filtroDto = JSON.parse(parsed.filtroJson);
    } catch {
      return buildError('VALIDATION_ERROR', '"filtro" debe ser un JSON válido', 400);
    }
    const { filtro, error } = parseFiltroDto(filtroDto);
    if (error || !filtro) {
      return buildError('VALIDATION_ERROR', error ?? 'Solicitud inválida', 400);
    }

    // M-R4: attachments regenerate server-side from the filter (D4),
    // scoped to the posted empresa when present (U6) — the operator never
    // uploads files.
    const attachments: EmailAttachment[] = [];
    const repo = await getValoracionesDb();
    if (parsed.adjuntarPdf) {
      const pdf = await renderValoracionesPdf(repo, filtro, parsed.empresa);
      attachments.push({
        filename: nombrePdf(filtro, parsed.empresa),
        content: Buffer.from(pdf),
        contentType: 'application/pdf',
      });
    }
    if (parsed.adjuntarExcel) {
      attachments.push(await generarExcelAttachment(repo, filtro, parsed.empresa));
    }

    // D5: purpose 'facturacion' reuses the existing SMTP creds — no new
    // env pair, no cobranza fallback involved.
    const result = await sendEmail({
      to: parsed.to,
      ...(parsed.cc ? { cc: parsed.cc } : {}),
      subject: parsed.subject,
      html: parsed.html,
      ...(attachments.length > 0 ? { attachments } : {}),
      purpose: 'facturacion',
    });

    if (!result.success) {
      switch (result.code) {
        case 'SMTP_TIMEOUT':
          return buildError(result.code, result.error, 503);
        case 'SMTP_AUTH_ERROR':
        case 'SMTP_ERROR':
        default:
          return buildError(result.code, result.error, 500);
      }
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error) {
    if (error instanceof EdgeUnavailableError) {
      return buildError(
        'PDF_UNAVAILABLE',
        'El generador de PDF no está disponible en este servidor. Contacte al administrador.',
        502,
      );
    }
    // User-safe message — never expose SP names, hosts or credentials.
    console.error('valoraciones send route error:', error);
    return buildError('INTERNAL_ERROR', 'Error al enviar el correo. Intente nuevamente.', 500);
  }
}
