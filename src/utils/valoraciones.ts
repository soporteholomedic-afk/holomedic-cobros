import fs from 'fs';
import path from 'path';

export type {
  ValoracionRow,
  CompanyGroup,
  GroupedData,
} from './valoracionesCore';
export {
  parseValoracionesCsvContent,
  generateValoracionesWorkbook,
} from './valoracionesCore';

// ---- I/O wrapper that reads from disk ----

const DEFAULT_CSV_PATH = path.join(
  process.cwd(),
  'src/features/valorizaciones/archivos-crudos.csv',
);

/**
 * Read the valoraciones CSV from disk, parse, filter, and group by company.
 * @param csvPath Optional path override; defaults to the project CSV location.
 */
export async function parseAndGroupValoraciones(
  csvPath?: string,
): Promise<import('./valoracionesCore').GroupedData> {
  const resolvedPath = csvPath || DEFAULT_CSV_PATH;

  if (!fs.existsSync(resolvedPath)) {
    throw new Error('CSV file not found');
  }

  const csvContent = fs.readFileSync(resolvedPath, 'utf-8');
  // Use dynamic import to avoid bundling fs/path in client-side chunks
  const { parseValoracionesCsvContent } = await import('./valoracionesCore');
  return parseValoracionesCsvContent(csvContent);
}
