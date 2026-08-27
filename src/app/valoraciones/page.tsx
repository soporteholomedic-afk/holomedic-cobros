'use client';

import { useCallback, useState } from 'react';
import { ClipboardList } from 'lucide-react';

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
 * mode. All fetching lives in hooks (`useLookup`, `useValoraciones`,
 * `useConsolidado`) — the page only wires state.
 *
 * The rendered table follows the mode of the LAST executed query
 * (`modoConsulta`), so toggling the checkbox does not flip the view away
 * from results already on screen.
 */
export default function ValoracionesPage() {
  const { filtros, dispatch, limpiar } = useValoracionesFilters();
  const { grupos, status, error, moneda, totalRegistros, buscar } = useValoraciones();
  const consolidadoQuery = useConsolidado();
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
