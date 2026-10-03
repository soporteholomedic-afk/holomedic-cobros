'use client';

import { useMemo, useState } from 'react';

import {
  enviarCorreoEmpresa,
  pausarEmpresa,
  type ResultadoAccionFila,
} from '../../accionesFila';
import { usePanelCrm } from '../../hooks/usePanelCrm';
import { filtrarFilas, type FilaDerivadaPanel, type TabPanel } from '../../panelDerivado';
import type { AccionFila } from '../../estadoPanel';
import { Buscador } from './Buscador';
import { KpiCards } from './KpiCards';
import { ModalAltaEmpresa } from './ModalAltaEmpresa';
import { ModalFichaEmpresa, plantillaSiguienteDeEstado } from './ModalFichaEmpresa';
import { ModalRespuesta } from './ModalRespuesta';
import { TablaEmpresas } from './TablaEmpresas';
import { TabsFiltro } from './TabsFiltro';

/**
 * PanelCrm (task 8.2, design D4, spec OP-1..OP-3) — the operator panel
 * orchestrator. Owns the tab + search state, re-runs the pure
 * `filtrarFilas` over the ONE derivation `usePanelCrm` produced, and
 * composes the tested leaves (KpiCards, TabsFiltro, Buscador,
 * TablaEmpresas) — zero classification here. Loading and error follow
 * the ColaHoy/EmpresaList pattern (spinner / alert + Reintentar).
 *
 * Wiring (batch 14 — tasks 9.x closure + decision 13): ver_ficha
 * (eye/empresa name) opens ModalFichaEmpresa; ¿Respondió? and the
 * ficha's quick actions open ModalRespuesta with the positive
 * preselect — its success closes the modal and refreshes the panel.
 * The send row actions (Enviar carta / +1 Sem / Reactivar ya) POST the
 * next template through the shared `accionesFila` seam and "Pausar 3m"
 * rides the T14 transition; buttons disable in flight (refresh-after,
 * ficha pattern) and API errors surface in a panel alert.
 *
 * Wiring (batch 15 — task 10.2): the alta CTA (header + empty state)
 * opens ModalAltaEmpresa — the LAST interim seam retired. Its success
 * closes the modal and refreshes the panel; a carta dispatch failure
 * still lands the alta (persist-before-dispatch) and surfaces the
 * warning in the same panel alert, pointing at the row's "Enviar
 * carta" retry.
 */
export function PanelCrm() {
  const { panel, status, error, retry } = usePanelCrm();
  const [tab, setTab] = useState<TabPanel>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [ficha, setFicha] = useState<FilaDerivadaPanel | null>(null);
  const [respuesta, setRespuesta] = useState<{
    empresaId: number;
    nombreEmpresa: string;
    preseleccion: 'positivo' | 'negativo';
  } | null>(null);
  // Row-action in flight (decision 13): the row's buttons disable and
  // API failures surface in a panel-level alert (ficha precedent).
  const [empresaEnCurso, setEmpresaEnCurso] = useState<number | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);

  const filasFiltradas = useMemo(
    () => (panel === null ? [] : filtrarFilas(panel.filas, tab, busqueda)),
    [panel, tab, busqueda],
  );

  function anotarEmpresa(): void {
    // ModalAltaEmpresa since batch 15 (task 10.2) — the interim
    // /crm/empresas/nueva navigation is retired; the old page goes in
    // Phase 5 (task 11.1).
    setAltaAbierta(true);
  }

  function abrirRespuesta(
    derivada: FilaDerivadaPanel,
    preseleccion: 'positivo' | 'negativo',
  ): void {
    setRespuesta({
      empresaId: derivada.fila.empresaId,
      nombreEmpresa: derivada.fila.razonSocial,
      preseleccion,
    });
  }

  async function manejarAccion(derivada: FilaDerivadaPanel, accion: AccionFila): Promise<void> {
    setErrorAccion(null);
    if (accion === 'ver_ficha') {
      setFicha(derivada);
      return;
    }
    if (accion === 'registrar_respuesta') {
      abrirRespuesta(derivada, 'positivo');
      return;
    }
    const empresaId = derivada.fila.empresaId;
    setEmpresaEnCurso(empresaId);
    let resultado: ResultadoAccionFila;
    if (accion === 'pausar_3m') {
      resultado = await pausarEmpresa(empresaId);
    } else {
      const plantilla = plantillaSiguienteDeEstado(derivada.estado);
      if (plantilla === null) {
        // Defensive: ACCIONES_POR_ESTADO never pairs a send action with
        // a status whose next template is null.
        setEmpresaEnCurso(null);
        setErrorAccion('Esta empresa no tiene un correo pendiente por enviar.');
        return;
      }
      resultado = await enviarCorreoEmpresa(empresaId, plantilla);
    }
    if (resultado.ok) {
      retry(); // refresh-after (ficha pattern): the derivation re-runs on fresh data
    } else {
      setErrorAccion(resultado.error);
    }
    setEmpresaEnCurso(null);
  }

  return (
    <section aria-label="Panel Sencillo" className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">CRM</h1>
            <span className="rounded-full border border-teal-200 dark:border-teal-900/50 bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
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
          <span className="ml-3 text-sm text-slate-500 dark:text-slate-400">Cargando panel…</span>
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-400"
        >
          <span>{error ?? 'Error al cargar el panel'}</span>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-red-300 dark:border-red-800/60 px-3 py-1.5 font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            Reintentar
          </button>
        </div>
      )}

      {status === 'ready' && panel !== null && (
        <>
          <KpiCards conteos={panel.conteos} />
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 p-4 md:flex-row md:items-center md:justify-between">
              <TabsFiltro conteos={panel.conteos} activa={tab} onSeleccionar={setTab} />
              <Buscador valor={busqueda} onCambiar={setBusqueda} />
            </div>
            <TablaEmpresas
              filas={filasFiltradas}
              total={panel.conteos.todas}
              onAccion={(derivada, accion) => void manejarAccion(derivada, accion)}
              onAnotar={anotarEmpresa}
              accionEnCurso={empresaEnCurso}
            />
          </div>

          {errorAccion !== null && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-3 text-xs font-medium text-red-700 dark:text-red-400"
            >
              {errorAccion}
            </p>
          )}
        </>
      )}

      {ficha !== null && (
        <ModalFichaEmpresa
          derivada={ficha}
          onSalir={() => setFicha(null)}
          onRegistrarRespuesta={(preseleccion) => {
            // The respuesta modal REPLACES the ficha (batch-14 brief).
            abrirRespuesta(ficha, preseleccion);
            setFicha(null);
          }}
        />
      )}

      {respuesta !== null && (
        <ModalRespuesta
          empresaId={respuesta.empresaId}
          nombreEmpresa={respuesta.nombreEmpresa}
          preseleccion={respuesta.preseleccion}
          onSalir={() => setRespuesta(null)}
          onExito={() => {
            setRespuesta(null);
            retry(); // refresh-after: badges/KPIs re-derive from fresh data
          }}
        />
      )}

      {altaAbierta && (
        <ModalAltaEmpresa
          onSalir={() => setAltaAbierta(false)}
          onExito={(empresa, advertenciaCarta) => {
            setAltaAbierta(false);
            if (advertenciaCarta !== null) {
              // The alta LANDED (persist-before-dispatch): the empresa
              // sits in Falta carta and its row button is the retry.
              setErrorAccion(
                `${empresa.razonSocial} quedó registrada, pero no se pudo enviar la carta: ${advertenciaCarta}. Usa "Enviar carta" en su fila para reintentar.`,
              );
            }
            retry(); // refresh-after: the new row enters the derivation
          }}
        />
      )}
    </section>
  );
}
