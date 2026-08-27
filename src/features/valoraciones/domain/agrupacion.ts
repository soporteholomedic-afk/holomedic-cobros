import type { CodigoMoneda, EmpresaGrupo, RepFacturacion } from './entities';

/** IGV percentage mirroring SIGLA's `ParametrosGen.ImpIgv`. */
export const IGV_PORCENTAJE = 18;

/** Round to two decimals (avoids classic 0.1 + 0.2 drift). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Moneda-aware sale amount: `VVtaMN` for SOLES (1), `VVtaMO` for DOLARES (2). */
export function ventaPorMoneda(row: RepFacturacion, codMon: CodigoMoneda): number {
  return codMon === 2 ? row.VVtaMO : row.VVtaMN;
}

/** Moneda-aware taxable amount: `VImpMN` for SOLES (1), `VImpMO` for DOLARES (2). */
export function importePorMoneda(row: RepFacturacion, codMon: CodigoMoneda): number {
  return codMon === 2 ? row.VImpMO : row.VImpMN;
}

const SIN_EMPRESA = 'SIN EMPRESA';

/**
 * Group key for a row: facturar-a (`NomCFa`) first, falling back to the
 * client name (`NomCli`) for particulares without a facturar-a, then a
 * placeholder. Mirrors the legacy CSV grouping by "facturar a".
 */
export function nombreEmpresa(row: RepFacturacion): string {
  const facturarA = row.NomCFa?.trim() ?? '';
  if (facturarA !== '') return facturarA;
  const cliente = row.NomCli?.trim() ?? '';
  return cliente !== '' ? cliente : SIN_EMPRESA;
}

/**
 * Group rows by facturar-a with moneda-aware totals. Pure: no IO, no
 * mutation of the input rows. Groups come out alphabetically sorted so
 * the table renders a stable order; rows keep their original relative
 * order inside each group.
 */
export function agruparPorEmpresa(
  rows: RepFacturacion[],
  codMon: CodigoMoneda,
): EmpresaGrupo[] {
  const groups = new Map<string, { rows: RepFacturacion[]; simbol: string }>();

  for (const row of rows) {
    const key = nombreEmpresa(row);
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, { rows: [row], simbol: row.Simbol ?? '' });
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([empresa, { rows: groupRows, simbol }]) => {
      const subtotal = round2(
        groupRows.reduce((acc, row) => acc + ventaPorMoneda(row, codMon), 0),
      );
      const igv = round2((subtotal * IGV_PORCENTAJE) / 100);
      return {
        empresa,
        rows: groupRows,
        cantidad: groupRows.length,
        subtotal,
        igv,
        total: round2(subtotal + igv),
        simbol,
      };
    });
}
