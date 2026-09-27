'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { usePanelCrm } from '../../hooks/usePanelCrm';
import { filtrarFilas, type FilaDerivadaPanel, type TabPanel } from '../../panelDerivado';
import type { AccionFila } from '../../estadoPanel';
import { Buscador } from './Buscador';
import { FlowExplainer } from './FlowExplainer';
import { KpiCards } from './KpiCards';
import { TablaEmpresas } from './TablaEmpresas';
import { TabsFiltro } from './TabsFiltro';

/**
 * PanelCrm (task 8.2, design D4, spec OP-1..OP-3) — the operator panel
 * orchestrator. Owns the tab + search state, re-runs the pure
 * `filtrarFilas` over the ONE derivation `usePanelCrm` produced, and
 * composes the tested leaves (KpiCards, FlowExplainer, TabsFiltro,
 * Buscador, TablaEmpresas) — zero classification here. Loading and
 * error follow the ColaHoy/EmpresaList pattern (spinner / alert +
 * Reintentar).
 *
 * Wiring (interim, disclosed in the tasks artifact): `ver_ficha` and
 * the empresa-name affordance navigate to the existing ficha page and
 * both "+ Anotar Empresa" paths to the alta page — the ficha/preview/
 * respuesta modals (9.x) and the alta modal (10.2) replace these
 * navigation stubs; the remaining row actions stay inert until their
 * modals exist (do not invent modal scope here).
 */
export function PanelCrm() {
  const router = useRouter();
  const { panel, status, error, retry } = usePanelCrm();
  const [tab, setTab] = useState<TabPanel>('todas');
  const [busqueda, setBusqueda] = useState('');

  const filasFiltradas = useMemo(
    () => (panel === null ? [] : filtrarFilas(panel.filas, tab, busqueda)),
    [panel, tab, busqueda],
  );

  function anotarEmpresa(): void {
    // Interim: alta page until ModalAltaEmpresa (task 10.2).
    router.push('/crm/empresas/nueva');
  }

  function manejarAccion(derivada: FilaDerivadaPanel, accion: AccionFila): void {
    if (accion === 'ver_ficha') {
      // Interim: ficha page until ModalFichaEmpresa (task 9.1).
      router.push(`/crm/empresas/${derivada.fila.empresaId}`);
    }
    // ¿Respondió? / Pausar 3m / ... stay inert until tasks 9.x/10.x.
  }

  return (
    <section aria-label="Panel Sencillo" className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">CRM</h1>
            <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700">
              Panel Sencillo
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Gestión de empresas, contactos y seguimiento comercial.
          </p>
        </div>
        <button
          type="button"
          onClick={anotarEmpresa}
          className="inline-flex items-center rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700 sm:text-sm"
        >
          Anotar Nueva Empresa
        </button>
      </header>

      {status === 'loading' && (
        <div role="status" className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
          <span className="ml-3 text-sm text-slate-500">Cargando panel…</span>
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <span>{error ?? 'Error al cargar el panel'}</span>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-red-300 px-3 py-1.5 font-medium text-red-700 hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      )}

      {status === 'ready' && panel !== null && (
        <>
          <KpiCards conteos={panel.conteos} />
          <FlowExplainer />
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50/50 p-4 md:flex-row md:items-center md:justify-between">
              <TabsFiltro conteos={panel.conteos} activa={tab} onSeleccionar={setTab} />
              <Buscador valor={busqueda} onCambiar={setBusqueda} />
            </div>
            <TablaEmpresas
              filas={filasFiltradas}
              total={panel.conteos.todas}
              onAccion={manejarAccion}
              onAnotar={anotarEmpresa}
            />
          </div>
        </>
      )}
    </section>
  );
}
