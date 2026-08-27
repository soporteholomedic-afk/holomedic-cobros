import type { CodigoMoneda, RepFacturacion } from '../../domain/entities';
import { MONEDAS } from '../../domain/entities';
import type { DestinoGrupo } from '../../domain/agrupacion';
import { ventaPorMoneda } from '../../domain/agrupacion';

/**
 * Pure HTML template for the membretado A4 valorización report (REQ-03
 * E-R1/E-R2, slice 2). Everything renders from the input — no IO, no
 * network (the logo travels as a data URI), fully deterministic.
 *
 * Multi-page pagination (spike 2.0 outcome): `@page { size: A4 }` drives
 * the page breaks (`preferCSSPageSize` is on in EdgePrinter); page
 * numbering comes from the printer's footer overrides, NOT from CSS
 * margin boxes (unsupported in Chromium).
 */

/** Institutional membrete data (RUC sourced from `paymentInfo.ts`). */
export interface Membrete {
  nombre: string;
  ruc: string;
  direccion?: string;
  telefono?: string;
}

export const MEMBRETE_HOLOMEDIC: Membrete = {
  nombre: 'HOLOMEDIC SERVICIOS INTEGRALES S.A.C.',
  ruc: '20556200328',
  // Address/phone are not yet sourced from a system of record — render
  // only when provided (ops can extend `Membrete` without template work).
};

export interface ValoracionPdfInput {
  /** Logo as a `data:` URI; empty string renders a text-only membrete. */
  logoDataUri: string;
  membrete: Membrete;
  /** Client header; `null` for clientless exports. */
  cliente: { nombre: string; ruc: string } | null;
  fecIni: string;
  fecFin: string;
  moneda: string;
  /** Emission date, pre-formatted `dd/MM/yyyy`. */
  fechaEmision: string;
  /** Destino groups (the row's `Simbol` labels every amount). */
  grupos: DestinoGrupo[];
}

/** Escape HTML-sensitive characters — SP data is untrusted for markup. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** `YYYY-MM-DD` (or ISO datetime) → `dd/MM/yyyy` (domain display contract). */
function fechaDisplay(iso: string): string {
  const [datePart] = iso.split('T');
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const MONTO_FORMATTER = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function monto(value: number): string {
  return MONTO_FORMATTER.format(value);
}

function filaHtml(row: RepFacturacion, codMon: CodigoMoneda): string {
  const ficha = `${row.IdAten} - ${row.ItemEx}`;
  return `        <tr>
          <td>${escapeHtml(ficha)}</td>
          <td>${escapeHtml(row.Pacien)}</td>
          <td>${escapeHtml(row.NroDId)}</td>
          <td>${escapeHtml(row.DesTCh)}</td>
          <td>${fechaDisplay(row.FecAte)}</td>
          <td>${escapeHtml(row.Result)}</td>
          <td style="text-align:right; white-space:nowrap;">${escapeHtml(row.Simbol)} ${monto(ventaPorMoneda(row, codMon))}</td>
        </tr>`;
}

function grupoHtml(grupo: DestinoGrupo, codMon: CodigoMoneda): string {
  const filas = grupo.rows.map((row) => filaHtml(row, codMon)).join('\n');
  return `      <h2 style="font-size:11px; margin:14px 0 4px; color:#0f172a;">${escapeHtml(grupo.destino)}</h2>
      <table>
        <thead>
          <tr>
            <th>Ficha</th>
            <th>Paciente</th>
            <th>Documento</th>
            <th>Tipo de chequeo</th>
            <th>Fecha</th>
            <th>Resultado</th>
            <th style="text-align:right;">Venta</th>
          </tr>
        </thead>
        <tbody>
${filas}
        </tbody>
        <tfoot>
          <tr class="totales">
            <td colspan="6" style="text-align:right;">SubTotal</td>
            <td style="text-align:right;">${escapeHtml(grupo.simbol)} ${monto(grupo.subtotal)}</td>
          </tr>
          <tr class="totales">
            <td colspan="6" style="text-align:right;">IGV 18%</td>
            <td style="text-align:right;">${escapeHtml(grupo.simbol)} ${monto(grupo.igv)}</td>
          </tr>
          <tr class="total-final">
            <td colspan="6" style="text-align:right;">Total</td>
            <td style="text-align:right;">${escapeHtml(grupo.simbol)} ${monto(grupo.total)}</td>
          </tr>
        </tfoot>
      </table>`;
}

function codMonDesdeMoneda(moneda: string): CodigoMoneda {
  return moneda === 'DOLARES' ? 2 : 1;
}

/**
 * Build the full offline HTML document. Pure and deterministic — the
 * caller supplies the logo data URI and the grouped rows.
 */
export function buildValoracionHtml(input: ValoracionPdfInput): string {
  const { membrete } = input;
  const codMon = codMonDesdeMoneda(input.moneda);
  const grupos = input.grupos.map((g) => grupoHtml(g, codMon)).join('\n');
  const direccion = membrete.direccion?.trim();
  const telefono = membrete.telefono?.trim();

  const clienteHtml = input.cliente
    ? `<tr><td style="color:#64748b;">Cliente</td><td>${escapeHtml(input.cliente.nombre)}</td></tr>
        <tr><td style="color:#64748b;">RUC del cliente</td><td>${escapeHtml(input.cliente.ruc)}</td></tr>`
    : '';

  const logoHtml = input.logoDataUri
    ? `<img src="${input.logoDataUri}" alt="logo">`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm 10mm 18mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #0f172a; margin: 0; }
  .membrete { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #0f172a; padding-bottom: 6px; }
  .membrete img { width: 52px; height: 52px; object-fit: contain; }
  .membrete .nombre { font-size: 13px; font-weight: bold; }
  .membrete .datos { font-size: 8.5px; color: #475569; line-height: 1.5; }
  h1 { font-size: 12px; margin: 10px 0 2px; }
  .cabecera { width: 100%; border-collapse: collapse; margin: 6px 0 8px; }
  .cabecera td { padding: 2px 6px 2px 0; font-size: 9px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { background: #0f172a; color: #fff; font-size: 8px; padding: 4px 5px; text-align: left; }
  td { border-bottom: 1px solid #e2e8f0; padding: 3px 5px; }
  tr.totales td { background: #f1f5f9; font-weight: bold; }
  tr.total-final td { background: #e2e8f0; font-weight: bold; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
  <div class="membrete">
    ${logoHtml}
    <div>
      <div class="nombre">${escapeHtml(membrete.nombre)}</div>
      <div class="datos">
        RUC: ${escapeHtml(membrete.ruc)}${direccion ? `<br>Direcci&oacute;n: ${escapeHtml(direccion)}` : ''}${telefono ? `<br>Tel&eacute;fono: ${escapeHtml(telefono)}` : ''}
      </div>
    </div>
  </div>

  <h1>VALORIZACI&Oacute;N DE SERVICIOS</h1>
  <table class="cabecera">
    <tr><td style="color:#64748b;">Per&iacute;odo</td><td>${fechaDisplay(input.fecIni)} al ${fechaDisplay(input.fecFin)}</td></tr>
    <tr><td style="color:#64748b;">Moneda</td><td>${escapeHtml(input.moneda)} (${escapeHtml(MONEDAS[codMon].simbol)})</td></tr>
${clienteHtml}
    <tr><td style="color:#64748b;">Fecha de emisi&oacute;n</td><td>${escapeHtml(input.fechaEmision)}</td></tr>
  </table>

${grupos}
</body>
</html>`;
}
