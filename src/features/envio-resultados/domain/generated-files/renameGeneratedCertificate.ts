import { sanitizeComponent } from '@/lib/sanitize-filename';
import type { ReadyFileTipo } from '../ready-files/parseReadyFile';

/**
 * CLI report names written by `SIGLA.PdfCli.exe`:
 * `{idAten}_{idePMe}_{arcPla}.pdf` — e.g.
 * `012110597_39183_CERTIFICADO MEDICO DE APTITUD (GEMO Y ANEXO 16).pdf`.
 * Only certificate templates (`arcPla` contains "CERTIFICADO") get a
 * delivery name; every other generated file keeps its CLI name.
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
 * - `tipoExamen`      — optional explicit exam type. `'ADICIONAL'`
 *                       switches the delivery prefix to `ADICIONAL_`
 *                       (ADICIONALES orders, spec S-3) and takes
 *                       precedence over the raw-name CAMO inference.
 *                       `'CAMO'`/`'EMO'` keep `CAMO_` (generated certs
 *                       are CAMO-only). Omitted → `CAMO_` as today.
 */
export interface RenameGeneratedCertificateInput {
  rawName: string;
  nombreCompleto: string;
  tipoExamen?: ReadyFileTipo;
}

/**
 * Build the `CAMO_{nombreCompleto}.pdf` (or `ADICIONAL_{nombreCompleto}.pdf`
 * for ADICIONALES orders) delivery name for a CLI generated medical
 * certificate.
 *
 * - `nombreCompleto` is trimmed and run through `sanitizeComponent`
 *   (Windows-illegal chars → `_`, whitespace runs collapsed).
 * - If `nombreCompleto` is empty after sanitization, the raw name is
 *   returned unchanged (no bare `CAMO_.pdf` / `ADICIONAL_.pdf`).
 * - An explicit `tipoExamen: 'ADICIONAL'` wins over the raw-name CAMO
 *   inference (spec S-3); no input → `CAMO_` prefix as before.
 * - Any other name — non-certificate CLI files, ready-to-send files
 *   (handled by `renameReadyFile`), arbitrary user files — passes
 *   through verbatim.
 */
export function renameGeneratedCertificate(input: RenameGeneratedCertificateInput): string {
  const { rawName, nombreCompleto, tipoExamen } = input;
  if (!CLI_CERTIFICATE_PATTERN.test(rawName.trim())) return rawName;
  const nombre = sanitizeComponent(nombreCompleto.trim());
  if (nombre === '') return rawName;
  if (tipoExamen === 'ADICIONAL') return `ADICIONAL_${nombre}.pdf`;
  return `CAMO_${nombre}.pdf`;
}
