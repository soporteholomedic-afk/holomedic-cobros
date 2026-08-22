/**
 * `buildCobranzaAuditMetadata` — pure ClienteGroup → audit metadata
 * mapper for the cobranza send payload (REQ-02 R6, decision D3).
 *
 * The spread of this object into the POST /api/send-email payload is
 * what makes each audited attempt carry `ruc`, `razonSocial`,
 * `montoReclamado`, `moneda` and `comprobantesCount`:
 *  - `ruc`/`razonSocial` are trimmed;
 *  - `montoReclamado`/`moneda` reflect the demanded amount in the
 *    client's MAIN currency — the SAME `selectMainCurrency` definition
 *    the interpolation flow uses, so "max saldo, tie → 'S/'" has one
 *    source (design §4.4);
 *  - `montoReclamado` is the RAW number (not the formatted
 *    `montoTotal` string) so it binds DECIMAL(18,2) directly;
 *  - `comprobantesCount` counts documents with saldo > 0.01 (the
 *    pending-document convention shared with the interpolation flow);
 *  - an empty-debt client (no currencies) carries null
 *    moneda/montoReclamado, stored NULL server-side.
 */
import type { ClienteGroup } from '../../../../types';
import { selectMainCurrency } from './buildCobranzaInterpolationContext';

/**
 * Audit metadata transported on the cobranza send payload. `ruc` is
 * audited as-is after trimming — junk keys (non 8–11 digit) are NOT
 * filtered client-side (writes are unfiltered per R6.2; the history
 * READ side is what gates them).
 */
export interface CobranzaAuditMetadata {
  ruc: string;
  razonSocial: string;
  moneda: string | null;
  montoReclamado: number | null;
  comprobantesCount: number;
}

export function buildCobranzaAuditMetadata(client: ClienteGroup): CobranzaAuditMetadata {
  const moneda = selectMainCurrency(client.saldosPorMoneda);
  return {
    ruc: client.clienteId.trim(),
    razonSocial: client.razonSocial.trim(),
    moneda: moneda === '' ? null : moneda,
    montoReclamado: moneda === '' ? null : client.saldosPorMoneda[moneda].saldo,
    comprobantesCount: client.documentos.filter((d) => d.saldo > 0.01).length,
  };
}
