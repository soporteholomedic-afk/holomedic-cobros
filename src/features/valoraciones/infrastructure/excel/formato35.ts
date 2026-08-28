import * as XLSX from 'xlsx';

import { round2, ventaPorMoneda } from '../../domain/agrupacion';
import type { CodigoMoneda, RepFacturacion } from '../../domain/entities';

/**
 * Formato 35 `.xlsx` export (REQ-03 E-R3, slice 2).
 *
 * The 30-column header is EXACTLY SIGLA's CSV export contract
 * (`RptFacturacionForm.GenerarData`, header assembled at lines 303–308);
 * the web export writes native `.xlsx` cells, so SIGLA's CSV-only
 * sanitization is intentionally NOT applied — values keep their hyphens
 * (DNIs like `DNI 46145583` are cleaner than the legacy CSV's stripped
 * output, a documented improvement) and NULL dates render as empty
 * cells (the SIGLA `'-'` placeholder was stripped to '' by its own
 * global hyphen-removal pass, so '' is the faithful contract).
 *
 * The `total` column is moneda-aware: `VVtaMN` for SOLES (1), `VVtaMO`
 * for DOLARES (2), rounded to 2 decimals (SIGLA's raw `VVtaMo` usage
 * assumed the SP had already picked the moneda column).
 */
export const FORMATO_35_HEADER: readonly string[] = Object.freeze([
  'facturar a',
  'contratades',
  'proyectodes',
  'cr_proy',
  'dociden',
  'nombre',
  'edad',
  'Fecha de Nacimiento',
  'ocupacion',
  'tipotrab',
  'feorden',
  'fesoliciTramAdm',
  'tipo_examen',
  'perfil',
  'resultado',
  'anexo7d',
  'total',
  'solicitado',
  'administrador',
  'ficha',
  'item',
  'tcompro',
  'nrodoc',
  'nrovalor',
  'ordpedi',
  'cod_em',
  'fec_rec',
  'cancela',
  'sede_cob',
  'nro_cob',
]);

/** `YYYY-MM-DD`/ISO → `dd/MM/yyyy`; NULL → '' (see module doc). */
function fechaCelda(iso: string | null): string {
  if (!iso) return '';
  const [datePart] = iso.split('T');
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Map a `RepFacturacion` row to the 30 Formato 35 cells. */
export function filaFormato35(row: RepFacturacion, codMon: CodigoMoneda): (string | number)[] {
  return [
    row.NomCFa,
    row.NomCom,
    row.DesDes,
    row.CenCos,
    row.NroDId,
    row.Pacien,
    row.EdaPac,
    fechaCelda(row.FecNac),
    row.DesPue,
    row.DsTiTr,
    fechaCelda(row.FecAte),
    fechaCelda(row.FecSTA),
    row.DesTCh,
    row.NomPro,
    row.Result,
    row.Anex7D,
    round2(ventaPorMoneda(row, codMon)),
    row.Solici,
    row.Admini,
    `Id: ${row.IdAten}`,
    row.ItemEx,
    row.TipDov,
    row.NumDov ?? '',
    row.NroVal,
    row.NroOPe,
    row.CodiEM,
    fechaCelda(row.FecRec),
    row.EstCob,
    row.CodSeC ?? '',
    row.NumCob ?? '',
  ];
}

/** Build the one-sheet Formato 35 workbook (header + one row per atención). */
export function generarFormato35Workbook(
  rows: readonly RepFacturacion[],
  codMon: CodigoMoneda,
): XLSX.WorkBook {
  const aoa: (string | number)[][] = [
    [...FORMATO_35_HEADER],
    ...rows.map((row) => filaFormato35(row, codMon)),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Formato 35');
  return workbook;
}
