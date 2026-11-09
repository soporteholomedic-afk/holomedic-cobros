'use client';

import { Layers, UserX } from 'lucide-react';
import type { ReactElement } from 'react';

export type CrmVista = 'pipeline' | 'inactivas';

export interface CrmViewTabsProps {
  activeView: CrmVista;
  onViewChange: (view: CrmVista) => void;
  /** Rows once the Inactivas list loaded; `null` while unknown (no badge). */
  inactivasCount: number | null;
}

interface VistaDef {
  id: CrmVista;
  label: string;
  icono: ReactElement;
}

const VISTAS: readonly VistaDef[] = [
  { id: 'pipeline', label: 'Pipeline', icono: <Layers className="h-4 w-4" aria-hidden="true" /> },
  { id: 'inactivas', label: 'Inactivas', icono: <UserX className="h-4 w-4" aria-hidden="true" /> },
];

/**
 * Controlled tablist that switches between "Pipeline" (kanban) and
 * "Inactivas" on the `/crm` route (feature crm-vista-inactivas, S1).
 *
 * - Mirrors `ConsolidadosViewSwitch` (envio-resultados): `role="tablist"`,
 *   `aria-selected`, accent `text-sky-500 border-sky-500` for the active
 *   tab, `text-slate-500 border-transparent` for inactive.
 * - Controlled — no internal state; the parent owns the active view.
 * - The count badge only renders once the list has actually loaded a
 *   positive count: `null` means "not loaded yet", `0` means the list is
 *   empty (nothing to claim).
 */
export function CrmViewTabs({ activeView, onViewChange, inactivasCount }: CrmViewTabsProps): ReactElement {
  return (
    <div role="tablist" aria-label="Vistas del CRM" className="flex border-b border-slate-200">
      {VISTAS.map((vista) => {
        const activa = vista.id === activeView;
        return (
          <button
            key={vista.id}
            type="button"
            role="tab"
            aria-selected={activa ? 'true' : 'false'}
            onClick={() => onViewChange(vista.id)}
            className={
              'flex items-center gap-2 border-b-2 -mb-px px-4 py-2.5 text-sm font-semibold transition-colors ' +
              (activa ? 'text-sky-500 border-sky-500' : 'text-slate-500 border-transparent hover:text-slate-700')
            }
          >
            {vista.icono}
            <span>{vista.label}</span>
            {vista.id === 'inactivas' && inactivasCount !== null && inactivasCount > 0 && (
              <span className="ml-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                {inactivasCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
