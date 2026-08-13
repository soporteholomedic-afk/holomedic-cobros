import { sanitizeComponent } from '@/lib/sanitize-filename';

/**
 * CLI report names written by `SIGLA.PdfCli.exe`:
 * `{idAten}_{idePMe}_{arcPla}.pdf` — e.g.
 * `012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf`.
 * Only certificate templates (`arcPla` contains "CERTIFICADO") get the
 * `CAMO_` delivery name; every other generated file keeps its CLI name.
 */
const CLI_CERTIFICATE_PATTERN = /^\d+_\d+_.*CERTIFICADO.*\.pdf$/i;

/**
 * Input shape for `renameGeneratedCertificate`.
 *
 * - `rawName`         — the CLI-reported file name on disk. Only names
 *                       matching `{idAten}_{idePMe}_{arcPla}.pdf` with
 *                       "CERTIFICADO" in `arcPla` are renamed.
 * - `nombreCompleto`  — patient full name. When empty/whitespace after
 *                       sanitization the raw name is returned unchanged.
 */
export interface RenameGeneratedCertificateInput {
  rawName: string;
  nombreCompleto: string;
}

/**
 * Build the `CAMO_{nombreCompleto}.pdf` delivery name for a CLI
 * generated medical certificate.
 *
 * - `nombreCompleto` is trimmed and run through `sanitizeComponent`
 *   (Windows-illegal chars → `_`, whitespace runs collapsed).
 * - If `nombreCompleto` is empty after sanitization, the raw name is
 *   returned unchanged (no bare `CAMO_.pdf`).
 * - Any other name — non-certificate CLI files, ready-to-send files
 *   (handled by `renameReadyFile`), arbitrary user files — passes
 *   through verbatim.
 */
export function renameGeneratedCertificate(input: RenameGeneratedCertificateInput): string {
  const { rawName, nombreCompleto } = input;
  if (!CLI_CERTIFICATE_PATTERN.test(rawName.trim())) return rawName;
  const nombre = sanitizeComponent(nombreCompleto.trim());
  if (nombre === '') return rawName;
  return `CAMO_${nombre}.pdf`;
}
