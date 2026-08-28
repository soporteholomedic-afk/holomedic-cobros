/**
 * Export filename contract (REQ-03 U6 user fix): PDF/Excel downloads are
 * named `[NombreEmpresa]_[fecIni].[ext]` — the empresa name sanitized for
 * Windows-invalid characters (`\ / : * ? " < > |`, plus control chars and
 * trailing dots/spaces), the date being the queried period's `fecIni` in
 * ISO `YYYY-MM-DD` (documented assumption). `Content-Disposition` values
 * carry an ASCII fallback filename plus an RFC 5987 `filename*` so
 * accented company names survive the HTTP round trip.
 */

/** Characters Windows forbids in a filename, plus control characters. */
const WINDOWS_INVALID = /[\x00-\x1F\\/:*?"<>|]/g;

/**
 * Sanitize an empresa name for use inside a filename: strip control
 * characters, replace every Windows-invalid character with `_`, collapse
 * whitespace runs and trim surrounding whitespace. Trailing dots are kept
 * — Peruvian company suffixes (`S.A.C.`, `S.R.L.`) end in one and the
 * caller always appends `_<date>`, so a dot never lands at filename-end.
 * Falls back to `empresa` when nothing survives (whitespace-only input).
 */
export function sanitizeEmpresaFilename(nombre: string): string {
  const sane = nombre
    .replace(WINDOWS_INVALID, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return sane !== '' ? sane : 'empresa';
}

/**
 * Build the export filename: `[Empresa]_[fecIni].[ext]` when empresa-scoped,
 * the legacy `valoraciones_[fecIni]_[fecFin].[ext]` for clientless exports.
 */
export function nombreArchivoExportacion(
  empresa: string | undefined,
  fecIni: string,
  ext: 'pdf' | 'xlsx',
  fecFin?: string,
): string {
  if (empresa !== undefined) {
    return `${sanitizeEmpresaFilename(empresa)}_${fecIni}.${ext}`;
  }
  return `valoraciones_${fecIni}_${fecFin ?? fecIni}.${ext}`;
}

/** RFC 5987 encoding: `encodeURIComponent` leaves `!'()*` unescaped. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** ASCII transliteration fallback (strip diacritics, drop the rest). */
function asciiFallback(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/"/g, "'");
}

/**
 * Build a download `Content-Disposition` header value: `attachment` with
 * the ASCII fallback filename plus `filename*=UTF-8''…` for non-ASCII
 * names (accents in company names).
 */
export function dispositionAttachment(nombre: string): string {
  return `attachment; filename="${asciiFallback(nombre)}"; filename*=UTF-8''${encodeRfc5987(nombre)}`;
}
