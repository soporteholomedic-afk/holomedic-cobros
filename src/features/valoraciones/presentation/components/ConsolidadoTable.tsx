'use client';

import { Loader2, Table2 } from 'lucide-react';

import type { ConsolidadoFila, DestinoTotal } from '../../domain/consolidado';
import type { ValoracionesStatus } from '../hooks/useValoraciones';
import { formatMonto } from '../helpers/format';

/**
 * Consolidado results table (REQ-03 Q-R6, slice 2): adjusted filas grouped
 * by destino with per-destino SubTotal / IGV 18% / Total rows — mirroring
 * SIGLA's `ConsolidadoFacturacionTotales`. Amounts are always MN (soles):
 * SIGLA's consolidado branch drops the moneda filter and reports MN only.
 */
export interface ConsolidadoTableProps {
  filas: ConsolidadoFila[];
  totales: DestinoTotal[];
  status: ValoracionesStatus;
  error: string | null;
}

interface GrupoDestino {
  clave: string;
  desDes: string;
  codDes: number | null;
  filas: ConsolidadoFila[];
}

/** Group filas by destino preserving first-appearance order (null → its own group). */
function agruparPorDestino(filas: readonly ConsolidadoFila[]): GrupoDestino[] {
  const grupos = new Map<string, GrupoDestino>();
  for (const fila of filas) {
    const clave = fila.codDes === null ? '__null__' : String(fila.codDes);
    const existing = grupos.get(clave);
    if (existing) existing.filas.push(fila);
    else
      grupos.set(clave, {
        clave,
        desDes: fila.desDes || 'SIN DESTINO',
        codDes: fila.codDes,
        filas: [fila],
      });
  }
  return [...grupos.values()];
}

export function ConsolidadoTable({ filas, totales, status, error }: ConsolidadoTableProps) {
  const grupos = agruparPorDestino(filas);
  const totalDestinos = totales.length;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-md shadow-slate-100/50 dark:shadow-none animate-fade-in delay-100">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Consolidado por destino
        </h2>
        {status === 'ready' && (
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">
            {filas.length} filas · {totalDestinos} destinos · montos en soles (MN)
          </p>
        )}
      </div>

      <div className="overflow-x-auto -mx-6">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 font-semibold bg-slate-50/50 dark:bg-slate-950/20">
              <th className="px-6 py-3.5">Destino</th>
              <th className="px-6 py-3.5">Tipo de chequeo</th>
              <th className="px-6 py-3.5 text-right">Cant. eval.</th>
              <th className="px-6 py-3.5 text-right">Importe</th>
              <th className="px-6 py-3.5 text-right">Venta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {status === 'loading' && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center">
                  <span className="inline-flex items-center gap-2 text-slate-400 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Consultando consolidado…
                  </span>
                </td>
              </tr>
            )}
            {status === 'error' && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-rose-500 font-medium"
                  role="alert"
                >
                  {error ?? 'Error al consultar el consolidado.'}
                </td>
              </tr>
            )}
            {status === 'idle' && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium"
                >
                  <Table2 className="w-5 h-5 mx-auto mb-2 opacity-60" />
                  Seleccione un cliente, marque Consolidado y presione Consultar.
                </td>
              </tr>
            )}
            {status === 'ready' &&
              (grupos.length > 0 ? (
                grupos.flatMap((grupo) => {
                  const total = totales.find((t) => t.codDes === grupo.codDes);
                  const filasGrupo = grupo.filas.map((fila) => (
                    <tr
                      key={`${grupo.clave}-${fila.desTCh}`}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-950/30"
                    >
                      <td className="px-6 py-3 text-slate-600 dark:text-slate-400">{grupo.desDes}</td>
                      <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {fila.desTCh}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-700 dark:text-slate-300">
                        {fila.canEva}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                        s/. {formatMonto(fila.importe)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                        s/. {formatMonto(fila.venta)}
                      </td>
                    </tr>
                  ));
                  // SIGLA-style totals block: SubTotal / IGV 18% / Total rows
                  // per destino (only when the destino produced totals).
                  if (!total) return filasGrupo;
                  const filaTotales = (
                    <tr key={`total-${grupo.clave}`} className="border-t-2 border-slate-200 dark:border-slate-700">
                      <td colSpan={5} className="px-6 py-1" />
                    </tr>
                  );
                  const filaSubtotal = (
                    <tr key={`subtotal-${grupo.clave}`} className="bg-slate-50/70 dark:bg-slate-950/40">
                      <td colSpan={4} className="px-6 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        {grupo.desDes} — SubTotal
                      </td>
                      <td className="px-6 py-2.5 text-right font-mono text-sm font-semibold text-slate-700 dark:text-slate-300">
                        s/. {formatMonto(total.subtotal)}
                      </td>
                    </tr>
                  );
                  const filaIgv = (
                    <tr key={`igv-${grupo.clave}`} className="bg-slate-50/70 dark:bg-slate-950/40">
                      <td colSpan={4} className="px-6 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                        IGV 18%
                      </td>
                      <td className="px-6 py-2.5 text-right font-mono text-sm text-slate-700 dark:text-slate-300">
                        s/. {formatMonto(total.igv)}
                      </td>
                    </tr>
                  );
                  const filaTotal = (
                    <tr key={`total-amount-${grupo.clave}`} className="bg-slate-50/70 dark:bg-slate-950/40">
                      <td colSpan={4} className="px-6 py-2.5 text-right font-bold text-slate-900 dark:text-slate-100">
                        Total
                      </td>
                      <td className="px-6 py-2.5 text-right font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                        s/. {formatMonto(total.total)}
                      </td>
                    </tr>
                  );
                  return [...filasGrupo, filaTotales, filaSubtotal, filaIgv, filaTotal];
                })
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 font-medium"
                  >
                    No se encontraron valorizaciones para los filtros seleccionados.
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
