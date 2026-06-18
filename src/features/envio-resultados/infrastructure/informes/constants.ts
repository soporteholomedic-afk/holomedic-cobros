import * as path from 'node:path';

/**
 * Hard-coded credentials and business constants for the
 * `SIGLA.PdfCli.exe` invocation. These are the legacy v1 values
 * agreed on 2026-06-18 with the user — they will be externalized
 * once the auth team ships their migration.
 *
 * Per spec REQ-7: this file is the SINGLE source of truth for these
 * literals. Other files in the change MUST import them from here
 * instead of re-declaring them.
 *
 * The `FILE_SERVER_BASE_PATH` env var is the only runtime knob —
 * everything else is a constant the route layer can rely on without
 * further env-var lookups.
 */

export const COD_EMP = 1;
export const COD_SED = 1;
export const COD_TCL = 2;
export const CLI_USER = 'soporte';
export const CLI_PASS = 'soporte';

/**
 * Absolute path to the `SIGLA.PdfCli.exe` binary on the Windows host
 * that runs the Next.js server. The default points to the dev build
 * on the operator's desktop — production hosts MUST set the
 * `PDFCLI_EXE_PATH` env var to the deployed install location
 * (legacy: `C:\Program Files\SIGLA\PdfCli\SIGLA.PdfCli.exe`).
 */
export const CLI_EXE_PATH =
  process.env.PDFCLI_EXE_PATH ??
  'C:\\Users\\soporte\\Desktop\\SIGLA\\SIGLA.PdfCli\\bin\\Debug\\SIGLA.PdfCli.exe';

/**
 * Timeout for a single CLI invocation, in milliseconds. Crystal
 * Reports boot + render of a multi-page report can take ~90s on the
 * production box, so 120s is the safe upper bound.
 */
export const CLI_TIMEOUT_MS = 120_000;

/**
 * Base path of the LAN share where PDFs are written. Mirrors
 * `download-all/route.ts`. The route layer appends
 * `\\<ruc>\\<dni>\\<idAten>\\LEGAJOS` to this root.
 */
export const FILE_SERVER_BASE_PATH = process.env.FILE_SERVER_BASE_PATH ?? '\\\\172.16.10.12\\sigla';

/**
 * Name of the subfolder under the patient root where the CLI writes
 * generated PDFs.
 */
export const LEGAJOS_FOLDER = 'LEGAJOS';

/**
 * Name of the manifest file the CLI writes next to the PDFs. The
 * route reads it after the CLI exits to surface per-template
 * success/failure rows.
 */
export const MANIFEST_FILENAME = 'manifest.json';

/**
 * Compose the absolute `OutputDir` for a given patient. The join
 * uses `path.win32` so the route produces backslashes even when the
 * test runner is POSIX.
 */
export function buildOutputDir(ruc: string, dni: string, idAten: string): string {
  return path.win32.join(FILE_SERVER_BASE_PATH, ruc, dni, idAten, LEGAJOS_FOLDER);
}
