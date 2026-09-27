'use client';

import type { ConteosPanel, TabPanel } from '../../panelDerivado';
import { TABS_PANEL } from '../../panelDerivado';

/**
 * TabsFiltro (task 8.3, design D4, spec OP-3) — the 7 filter tabs of
 * the operator panel. Labels come VERBATIM from TABS_PANEL (the same
 * list the KPI counts were tallied into, so tab and KPI can never
 * disagree) and each tab shows its live count from `conteos`. The
 * active tab is announced with aria-pressed; selection flows up via
 * onSeleccionar (PanelCrm owns the state and re-runs filtrarFilas).
 */

const CONTEO_POR_TAB: Record<TabPanel, (c: ConteosPanel) => number> = {
  todas: (c) => c.todas,
  en_espera: (c) => c.enEspera,
  positivos: (c) => c.positivos,
  pausa_3m: (c) => c.pausa3m,
  reactivados: (c) => c.reactivados,
  sin_interes: (c) => c.sinInteres,
  falta_carta: (c) => c.faltaCarta,
};

export interface TabsFiltroProps {
  /** Live counts from derivarPanel — the tabs render them as-is. */
  conteos: ConteosPanel;
  /** Currently selected tab key (owned by PanelCrm). */
  activa: TabPanel;
  onSeleccionar: (tab: TabPanel) => void;
}

export function TabsFiltro({ conteos, activa, onSeleccionar }: TabsFiltroProps) {
  return (
    <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0 text-xs sm:text-sm">
      {TABS_PANEL.map(({ clave, etiqueta }) => {
        const activaTab = clave === activa;
        return (
          <button
            key={clave}
            type="button"
            aria-pressed={activaTab}
            onClick={() => onSeleccionar(clave)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition ${
              activaTab
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {etiqueta} ({CONTEO_POR_TAB[clave](conteos)})
          </button>
        );
      })}
    </div>
  );
}
