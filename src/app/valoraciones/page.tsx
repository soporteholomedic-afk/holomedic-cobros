'use client';

import { useCallback, useState } from 'react';
import { ClipboardList, FileDown, FileSpreadsheet, Loader2 } from 'lucide-react';

import type {
  DestinoLookupItem,
  EmpresaGrupo,
  SedeLookupItem,
  TipoTrabajadorItem,
} from '@/features/valoraciones/domain/entities';
import { ConsolidadoTable } from '@/features/valoraciones/presentation/components/ConsolidadoTable';
import { EmpresaDetailModal } from '@/features/valoraciones/presentation/components/EmpresaDetailModal';
import { EmpresaList } from '@/features/valoraciones/presentation/components/EmpresaList';
import { FiltersPanel } from '@/features/valoraciones/presentation/components/FiltersPanel';
import { useConsolidado } from '@/features/valoraciones/presentation/hooks/useConsolidado';
import { useExportarValoraciones } from '@/features/valoraciones/presentation/hooks/useExportarValoraciones';
import { useLookup } from '@/features/valoraciones/presentation/hooks/useLookup';
import { useValoraciones } from '@/features/valoraciones/presentation/hooks/useValoraciones';
import {
  toFiltro,
  useValoracionesFilters,
} from '@/features/valoraciones/presentation/hooks/useValoracionesFilters';

/**
 * Valorizaciones page (REQ-03): realtime SIGLA query with the 11-filter
 * panel replacing the legacy CSV upload flow. Slice 2 adds the
 * client-gated consolidado mode (per-destino totals) next to the detail
 * mode, plus the server-side PDF export. All fetching lives in hooks
 * (`useLookup`, `useValoraciones`, `useConsolidado`,
 * `useExportarValoraciones`) — the page only wires state.
 *
 * The rendered table follows the mode of the LAST executed query
 * (`modoConsulta`), so toggling the checkbox does not flip the view away
 * from results already on screen.
 */
export default function ValoracionesPage() {
  const { filtros, dispatch, limpiar } = useValoracionesFilters();
  const { grupos, status, error, moneda, totalRegistros, buscar } = useValoraciones();
  const consolidadoQuery = useConsolidado();
  const { exportar: exportarPdf, exportando: exportandoPdf, error: errorPdf } =
    useExportarValoraciones('pdf');
  const { exportar: exportarExcel, exportando: exportandoExcel, error: errorExcel } =
    useExportarValoraciones('excel');
  const [grupoSeleccionado, setGrupoSeleccionado] = useState<EmpresaGrupo | null>(null);
  const [modoConsulta, setModoConsulta] = useState<'detalle' | 'consolidado'>('detalle');

  // Panel lookups: sedes and tipos trabajador load once; destinos are
  // gated by the selected client (spec Q-R4/Q-R5 — no client, no fetch).
  const sedes = useLookup<SedeLookupItem>('sedes', {}, { habilitado: true });
  const tiposTrabajador = useLookup<TipoTrabajadorItem>('tipos-trabajador', {}, { habilitado: true });
  const destinos = useLookup<DestinoLookupItem>(
    'destinos',
    filtros.codCli !== undefined ? { codCli: String(filtros.codCli) } : {},
    { habilitado: filtros.codCli !== undefined },
  );

  const consultar = useCallback(() => {
    setGrupoSeleccionado(null);
    const filtro = toFiltro(filtros);
    if (filtros.consolidado && filtros.codCli !== undefined) {
      setModoConsulta('consolidado');
      consolidadoQuery.buscar(filtro);
      return;
    }
    setModoConsulta('detalle');
    buscar(filtro);
  }, [buscar, consolidadoQuery, filtros]);

  const hayResultados =
    modoConsulta === 'consolidado'
      ? consolidadoQuery.status === 'ready' && consolidadoQuery.filas.length > 0
      : status === 'ready' && totalRegistros > 0;

  const descargarPdf = useCallback(() => {
    exportarPdf(toFiltro(filtros));
  }, [exportarPdf, filtros]);

  const descargarExcel = useCallback(() => {
    exportarExcel(toFiltro(filtros));
  }, [exportarExcel, filtros]);

  const errorExportar = errorPdf ?? errorExcel;

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20">
            <ClipboardList className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
              Valorizaciones
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Consulta en tiempo real desde SIGLA
            </p>
          </div>
          {hayResultados && (
            <div className="ml-auto flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={descargarExcel}
                  disabled={exportandoExcel}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {exportandoExcel ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  Descargar Excel
                </button>
                <button
                  type="button"
                  onClick={descargarPdf}
                  disabled={exportandoPdf}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold shadow-lg shadow-rose-600/20 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {exportandoPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4" />
                  )}
                  Descargar PDF
                </button>
              </div>
              {errorExportar && (
                <p role="alert" className="text-xs text-rose-500 max-w-xs text-right">
                  {errorExportar}
                </p>
              )}
            </div>
          )}
        </header>

        <FiltersPanel
          filtros={filtros}
          onCambio={dispatch}
          onConsultar={consultar}
          onLimpiar={limpiar}
          consultando={status === 'loading' || consolidadoQuery.status === 'loading'}
          destinos={destinos.items}
          destinosCargando={destinos.cargando}
          sedes={sedes.items}
          tiposTrabajador={tiposTrabajador.items}
        />

        {modoConsulta === 'consolidado' ? (
          <ConsolidadoTable
            filas={consolidadoQuery.filas}
            totales={consolidadoQuery.totales}
            status={consolidadoQuery.status}
            error={consolidadoQuery.error}
          />
        ) : (
          <EmpresaList
            grupos={grupos}
            status={status}
            error={error}
            totalRegistros={totalRegistros}
            onSelectEmpresa={setGrupoSeleccionado}
          />
        )}
      </div>

      {modoConsulta === 'detalle' && grupoSeleccionado && moneda !== null && (
        <EmpresaDetailModal
          grupo={grupoSeleccionado}
          codMon={moneda}
          onClose={() => setGrupoSeleccionado(null)}
        />
      )}
    </main>
  );
}
