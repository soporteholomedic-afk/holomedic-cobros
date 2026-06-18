'use client';

import { Users, Building2 } from 'lucide-react';
import type { ReactElement } from 'react';

export type ConsolidadosView = 'pacientes' | 'empresas';

export interface ConsolidadosViewSwitchProps {
  activeView: ConsolidadosView;
  onViewChange: (view: ConsolidadosView) => void;
}

interface ViewDef {
  id: ConsolidadosView;
  label: string;
  icon: ReactElement;
}

const VIEWS: readonly ViewDef[] = [
  {
    id: 'pacientes',
    label: 'Lista de pacientes',
    icon: <Users className="w-4 h-4" aria-hidden="true" />,
  },
  {
    id: 'empresas',
    label: 'Lista de empresas',
    icon: <Building2 className="w-4 h-4" aria-hidden="true" />,
  },
];

/**
 * Controlled tablist that switches between "Lista de pacientes" and
 * "Lista de empresas" on the `/consolidados` route.
 *
 * - Mirrors the `FilesTabs` visual pattern: `role="tablist"`,
 *   `aria-selected`, accent `text-sky-500 border-sky-500` for the
 *   active tab, `text-slate-500 border-transparent` for inactive.
 * - Controlled — no internal state. The parent owns the active view
 *   via `useState<'pacientes' | 'empresas'>('pacientes')`.
 * - Default view is `pacientes` (R-SW-1) — enforced at the page level,
 *   not in this component, so it stays controlled.
 */
export function ConsolidadosViewSwitch({
  activeView,
  onViewChange,
}: ConsolidadosViewSwitchProps): ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Vista de consolidados"
      className="flex border-b border-slate-200"
    >
      {VIEWS.map((view) => {
        const isActive = view.id === activeView;
        return (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={isActive ? 'true' : 'false'}
            onClick={() => onViewChange(view.id)}
            className={
              'flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ' +
              (isActive
                ? 'text-sky-500 border-sky-500'
                : 'text-slate-500 border-transparent hover:text-slate-700')
            }
          >
            {view.icon}
            <span>{view.label}</span>
          </button>
        );
      })}
    </div>
  );
}
