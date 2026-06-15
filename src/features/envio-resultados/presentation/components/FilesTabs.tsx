'use client';

import { Star } from 'lucide-react';
import type { ReactElement } from 'react';

export type FilesTab = 'ready' | 'all';

export interface FilesTabsProps {
  activeTab: FilesTab;
  onTabChange: (tab: FilesTab) => void;
}

interface TabDef {
  id: FilesTab;
  label: string;
  icon?: ReactElement;
}

const TABS: readonly TabDef[] = [
  {
    id: 'ready',
    label: 'Listo para enviar',
    icon: <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" aria-hidden="true" />,
  },
  { id: 'all', label: 'Todos' },
];

/**
 * Tab strip shown in the explorer pane header. Two tabs:
 *
 * - `ready` — show only the LEGAJOS files that match the
 *   `^\d+(CERT|EXPED)\.pdf$` pattern (driven by `useReadyFiles`).
 * - `all` — show the full navigable tree (driven by `useFileTree`).
 *
 * Controlled — the parent owns the active tab state so it can route
 * the matching hook into the matching pane.
 */
export function FilesTabs({ activeTab, onTabChange }: FilesTabsProps): ReactElement {
  return (
    <div
      role="tablist"
      aria-label="Vista de archivos"
      className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/10"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive ? 'true' : 'false'}
            onClick={() => onTabChange(tab.id)}
            className={
              'flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px ' +
              (isActive
                ? 'text-sky-500 border-sky-500'
                : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200')
            }
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
