'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';

import { useResumenConocimiento } from '../../hooks/useAuditoriaConfig';
import { useConfigAgente } from '../../hooks/useConfigAgente';
import { useConfigCanal } from '../../hooks/useConfigCanal';
import { useConfigMemoria } from '../../hooks/useConfigMemoria';
import { BarraKillSwitch } from './BarraKillSwitch';
import { HistorialCambios } from './HistorialCambios';
import { TabAgente } from './TabAgente';
import { TabCanal } from './TabCanal';
import { TabConocimiento } from './TabConocimiento';
import { TabMemoria } from './TabMemoria';

/**
 * PanelConfiguracion (agente-ia-crm E5·T6) — client half of
 * /admin/crm/configuracion: the sticky kill-switch bar and the four
 * accessible tabs (Agente / Canal Kapso / Memoria / Conocimiento) with
 * a collapsible change history per tab. Hooks live here so the kill
 * switch works from any tab; only the active tabpanel is mounted, and
 * leaving a tab discards the one-time regenerated webhook secret.
 */

type TabId = 'agente' | 'canal' | 'memoria' | 'conocimiento';

interface DefinicionTab {
  id: TabId;
  etiqueta: string;
  /** Audit key prefix; null = the tab has no history panel. */
  prefijo: string | null;
}

const TABS: readonly DefinicionTab[] = [
  { id: 'agente', etiqueta: 'Agente', prefijo: 'agente.' },
  { id: 'canal', etiqueta: 'Canal Kapso', prefijo: 'canal.kapso.' },
  { id: 'memoria', etiqueta: 'Memoria', prefijo: 'memoria.' },
  { id: 'conocimiento', etiqueta: 'Conocimiento', prefijo: null },
];

export function PanelConfiguracion() {
  const agente = useConfigAgente();
  const canal = useConfigCanal();
  const memoria = useConfigMemoria();
  const resumen = useResumenConocimiento();
  const [activa, setActiva] = useState<TabId>('agente');
  const base = useId();
  const refsTabs = useRef<Array<HTMLButtonElement | null>>([]);

  const idTab = (id: TabId): string => `${base}-tab-${id}`;
  const idPanel = `${base}-panel`;
  const definicionActiva = TABS.find((tab) => tab.id === activa) ?? TABS[0];

  function seleccionar(id: TabId): void {
    if (id !== activa) canal.descartarWebhookSecret();
    setActiva(id);
  }

  function alPulsarTecla(evento: KeyboardEvent<HTMLButtonElement>, indice: number): void {
    let destino: number;
    switch (evento.key) {
      case 'ArrowRight':
        destino = (indice + 1) % TABS.length;
        break;
      case 'ArrowLeft':
        destino = (indice - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        destino = 0;
        break;
      case 'End':
        destino = TABS.length - 1;
        break;
      default:
        return;
    }
    evento.preventDefault();
    seleccionar(TABS[destino].id);
    refsTabs.current[destino]?.focus();
  }

  return (
    <div className="space-y-6">
      <BarraKillSwitch
        habilitado={agente.config?.habilitado ?? null}
        cambiando={agente.cambiandoKillSwitch}
        error={agente.errorKillSwitch}
        onCambiar={agente.alternarKillSwitch}
      />

      <div
        role="tablist"
        aria-label="Secciones de configuración"
        className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800"
      >
        {TABS.map((tab, indice) => {
          const seleccionada = tab.id === activa;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refsTabs.current[indice] = el;
              }}
              id={idTab(tab.id)}
              type="button"
              role="tab"
              aria-selected={seleccionada}
              aria-controls={seleccionada ? idPanel : undefined}
              tabIndex={seleccionada ? 0 : -1}
              onClick={() => seleccionar(tab.id)}
              onKeyDown={(evento) => alPulsarTecla(evento, indice)}
              className={`whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 ${
                seleccionada
                  ? 'border-sky-700 dark:border-sky-400 text-sky-800 dark:text-sky-300'
                  : 'border-transparent text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              {tab.etiqueta}
            </button>
          );
        })}
      </div>

      <div id={idPanel} role="tabpanel" aria-labelledby={idTab(activa)} tabIndex={0} className="space-y-6 focus-visible:outline-none">
        {activa === 'agente' && <TabAgente agente={agente} />}
        {activa === 'canal' && <TabCanal canal={canal} />}
        {activa === 'memoria' && <TabMemoria memoria={memoria} />}
        {activa === 'conocimiento' && <TabConocimiento resumen={resumen} />}

        {definicionActiva.prefijo !== null && (
          <HistorialCambios key={definicionActiva.prefijo} prefijo={definicionActiva.prefijo} />
        )}
      </div>
    </div>
  );
}
