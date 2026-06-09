import type { SpResultRow, WorkerRow, CompanyGroup } from '@/types/sp-result';

/**
 * Groups raw SP rows by company name (NomCom column).
 *
 * Each row maps to a WorkerRow. Rows with the same NomCom are aggregated
 * into a single CompanyGroup. Workers with different exam types produce
 * separate entries (rows are NOT deduplicated).
 *
 * Result is sorted alphabetically by companyName.
 *
 * @param rows - Raw rows from SP_RPT_MATRIZICCGSA execution.
 * @returns CompanyGroup[] sorted by companyName ASC.
 */
export function groupByCompany(rows: SpResultRow[]): CompanyGroup[] {
  if (rows.length === 0) return [];

  // Aggregate rows into a Map<NomCom, WorkerRow[]>
  const companyMap = new Map<string, WorkerRow[]>();

  for (const row of rows) {
    const companyName = row.NomCom.trim();
    const existing = companyMap.get(companyName);

    const worker: WorkerRow = {
      nombre: row.Pacien,
      tipoExamen: row.DesTCh,
      proyecto: row.DesDes,
    };

    if (existing) {
      existing.push(worker);
    } else {
      companyMap.set(companyName, [worker]);
    }
  }

  // Convert Map to CompanyGroup[], sorted alphabetically by companyName
  const result: CompanyGroup[] = Array.from(
    companyMap,
    ([companyName, workers]) => ({
      companyName,
      workers,
      workerCount: workers.length,
    }),
  );

  result.sort((a, b) => a.companyName.localeCompare(b.companyName));

  return result;
}
