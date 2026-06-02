import { ClienteGroup } from '../types';
import { formatNumber } from './excelParser';

/** Returns a plain-text list of outstanding documents for mailto: fallback. */
export function buildDocsTextList(client: ClienteGroup): string {
  const outstandingDocs = client.documentos.filter((d) => d.saldo > 0.01);
  return outstandingDocs
    .map(
      (d) =>
        `- Doc: ${d.tipoDoc} ${d.serie}-${d.numero} | Venc.: ${d.fechaVen || 'S/V'} | Saldo Pendiente: ${d.moneda} ${formatNumber(d.saldo)}`
    )
    .join('\n');
}

/** Returns a formatted string of outstanding totals per currency. */
export function buildOutstandingTotalsText(client: ClienteGroup): string {
  return Object.keys(client.saldosPorMoneda)
    .map((mon) => `${mon} ${formatNumber(client.saldosPorMoneda[mon].saldo)}`)
    .join(' / ');
}
