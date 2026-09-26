import * as XLSX from 'xlsx';

import { HOJA_DATOS, type FilaImportCrm } from '../../domain/importar/columnas';
import { mapearFilasImportCrm } from '../../domain/importar/mapearFilas';

/**
 * Browser-side template reader for the import wizard (tasks pr8/WU3;
 * cobranza `excelParser` precedent — the client parses the .xlsx with
 * `xlsx` and posts RAW rows, the server re-validates EVERYTHING).
 *
 * Looks up the data sheet BY NAME using the shared `HOJA_DATOS`
 * constant (the pr7 template pins 'Empresas' as the first sheet), so a
 * wrong file fails fast with a clear Spanish message instead of
 * producing garbage rows. Row objects are mapped to `FilaImportCrm`
 * through the shared `mapearFilasImportCrm` normalization (G3
 * anti-drift: asterisked headers, spacing and case all resolve to the
 * column claves; the 2000-row cap is enforced by the same mapper).
 *
 * Runs in the browser (no Node APIs) — only `xlsx` + pure domain code.
 */
export class PlantillaSinHojaDatosError extends Error {
  constructor() {
    super(
      `La planilla no contiene la hoja "${HOJA_DATOS}". Descargue la plantilla oficial y vuelva a intentarlo.`,
    );
    this.name = 'PlantillaSinHojaDatosError';
  }
}

/** Parse an .xlsx file buffer into raw import rows (never validated here). */
export function parsearPlantillaCrm(buffer: ArrayBuffer): FilaImportCrm[] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const hoja = workbook.Sheets[HOJA_DATOS];
  if (!hoja) throw new PlantillaSinHojaDatosError();

  const filasBrutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, {
    defval: '',
  });
  return mapearFilasImportCrm(filasBrutas);
}
