import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  buildOutputDir,
  FILE_SERVER_BASE_PATH,
  LEGAJOS_FOLDER,
} from './constants';

/**
 * Resolve the output dir for PDF generation. For existing particular
 * patients (where `sigla\<dni>\<dni>\<idAten>` already exists), write to
 * the particular LEGAJOS path so generated PDFs land where the read
 * fallback will find them. For all other cases (company patients, or
 * brand-new patients where neither path exists yet), default to the
 * standard path.
 *
 * Server-only: imports `node:fs`, so it MUST NOT be imported from a
 * Client Component. `constants.ts` stays pure (no `node:fs`) so it
 * remains safe for client bundles; this module is the server-only seam
 * for path resolution that needs filesystem access.
 */
export async function resolveOutputDir(
  ruc: string,
  dni: string,
  idAten: string,
): Promise<string> {
  const partRoot = path.win32.join(FILE_SERVER_BASE_PATH, dni, dni, idAten);
  try {
    await fs.stat(partRoot);
    return path.win32.join(FILE_SERVER_BASE_PATH, dni, dni, idAten, LEGAJOS_FOLDER);
  } catch {
    return buildOutputDir(ruc, dni, idAten);
  }
}
