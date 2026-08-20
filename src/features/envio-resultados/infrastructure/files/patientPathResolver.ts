import { promises as fs } from 'node:fs';
import { pathOs, FILE_SERVER_BASE_PATH } from '@/lib/platform';

const BASE_PATH = FILE_SERVER_BASE_PATH;

/**
 * Standard patient folder path: `<BASE>\<ruc>\<dni>\<idAten>\<relPath>`.
 * Used for company patients (RUC of 11 digits). Includes path-traversal
 * containment check (mirrors the original `joinFolder` defense).
 */
export function standardFolder(
  ruc: string,
  dni: string,
  idAten: string,
  relPath: string,
): string {
  const root = pathOs.join(BASE_PATH, ruc, dni, idAten);
  if (relPath === '') return root;
  const full = pathOs.resolve(root, relPath);
  const resolvedRoot = pathOs.resolve(root);
  if (full !== resolvedRoot && !full.startsWith(resolvedRoot + pathOs.sep)) {
    throw new Error('path inválido');
  }
  return full;
}

/**
 * "Cliente particular" folder path: `<BASE>\<dni>\<dni>\<idAten>\<relPath>`.
 * Particular patients reuse their DNI as RUC, so the first two levels
 * of the standard layout carry the SAME value (the DNI). There is no
 * company RUC level. The `ruc` value from the order row is unreliable
 * for these patients (the SP surfaces it as `"null"`), so the fallback
 * keys everything off the DNI + idAten only.
 */
export function particularFolder(
  dni: string,
  idAten: string,
  relPath: string,
): string {
  return standardFolder(dni, dni, idAten, relPath);
}

/** Check if a path exists (any type). ENOENT-safe. */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the patient folder, trying the standard path first and
 * falling back to the particular path if the standard one does not
 * exist. Returns the resolved folder path, or the standard path if
 * neither exists (so the caller's readdir throws ENOENT and returns
 * [] — preserving legacy "missing folder = empty" behavior).
 */
export async function resolveExistingFolder(
  ruc: string,
  dni: string,
  idAten: string,
  relPath: string,
): Promise<string> {
  const std = standardFolder(ruc, dni, idAten, relPath);
  if (await pathExists(std)) return std;
  const part = particularFolder(dni, idAten, relPath);
  if (await pathExists(part)) return part;
  return std;
}

/**
 * Resolve the file path for a specific file, trying the standard
 * folder first and falling back to the particular folder.
 */
export async function resolveExistingFile(
  ruc: string,
  dni: string,
  idAten: string,
  relPath: string,
  name: string,
): Promise<string> {
  const stdFolder = standardFolder(ruc, dni, idAten, relPath);
  const stdFile = pathOs.join(stdFolder, name);
  if (await pathExists(stdFile)) return stdFile;
  const partFolder = particularFolder(dni, idAten, relPath);
  const partFile = pathOs.join(partFolder, name);
  return partFile;
}
