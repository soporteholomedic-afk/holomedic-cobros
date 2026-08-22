/**
 * `buildInfocorteExtract` — pure builder of the copyable plain-text
 * cobranza chronology (REQ-02 R5, user-confirmed format, design §4.3).
 *
 * The extract is documentary support for service-cutoff (Infocorte)
 * derivation, so it must be timezone-STABLE: every timestamp (the
 * `Generado` clock and each `fechaEnvio`) is rendered in
 * `America/Lima` via `Intl.DateTimeFormat(...).formatToParts()` —
 * never browser-local. Lines are most-recent-first (the API already
 * orders rows that way) and every line ends LF.
 *
 * Segment omission rules (design §4.3 template):
 *  - the `cc:` segment is omitted when `copias` is null/empty;
 *  - the ENTIRE amount segment is omitted when `montoReclamado` is
 *    null (a NULL amount says nothing to Infocorte);
 *  - the `error:` segment appears only on FAILED rows that carry an
 *    `errorDetalle`.
 */
import type { CobranzaEnvioHistorial } from '../../../domain/entities';
import { formatNumber } from '../../../../utils/excelParser';

const LIMA_TIMEZONE = 'America/Lima';
const SEPARATOR_LINE = '-'.repeat(64);

/**
 * `yyyy-MM-dd HH:mm` (24h) in America/Lima, assembled from
 * `formatToParts` so the output is identical on every runtime
 * timezone. `hourCycle: 'h23'` keeps midnight as `00`, never `24`.
 */
function formatLimaTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: LIMA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function comprobanteWord(count: number): string {
  return count === 1 ? 'comprobante' : 'comprobantes';
}

function buildEntryLine(envio: CobranzaEnvioHistorial): string {
  const segments: string[] = [];
  segments.push(`para: ${envio.destinatarios.join(', ')}`);
  if (envio.copias !== null && envio.copias.length > 0) {
    segments.push(`cc: ${envio.copias.join(', ')}`);
  }
  if (envio.montoReclamado !== null) {
    const amount = `${envio.moneda ?? ''} ${formatNumber(envio.montoReclamado)}`.trim();
    const countText =
      envio.comprobantesCount !== null
        ? ` (${envio.comprobantesCount} ${comprobanteWord(envio.comprobantesCount)})`
        : '';
    segments.push(`${amount}${countText}`);
  }
  if (envio.estadoEnvio === 'FAILED' && envio.errorDetalle !== null) {
    segments.push(`error: ${envio.errorDetalle}`);
  }
  segments.push(`por: ${envio.enviadoPor}`);
  const timestamp = formatLimaTimestamp(new Date(envio.fechaEnvio));
  return `[${timestamp}] ${envio.estadoEnvio} | ${segments.join(' | ')}`;
}

export function buildInfocorteExtract(
  envios: CobranzaEnvioHistorial[],
  ruc: string,
  razonSocial: string,
  now: Date = new Date(),
): string {
  const lines: string[] = [
    `HISTORIAL DE COBRANZA — ${razonSocial} (RUC/DNI: ${ruc})`,
    `Generado: ${formatLimaTimestamp(now)} hora Lima | Envíos registrados: ${envios.length}`,
    SEPARATOR_LINE,
    ...envios.map(buildEntryLine),
  ];
  return lines.map((line) => `${line}\n`).join('');
}
