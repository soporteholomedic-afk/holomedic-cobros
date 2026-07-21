'use client';

export type FormTab = 'datos' | 'preguntas';

interface JjcFormTabsProps {
  activeTab: FormTab;
  onTabChange: (tab: FormTab) => void;
}

const TABS: { id: FormTab; label: string }[] = [
  { id: 'datos', label: 'Datos' },
  { id: 'preguntas', label: 'Preguntas' },
];

export function JjcFormTabs({ activeTab, onTabChange }: JjcFormTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Formulario"
      className="flex border-b border-slate-200 mb-6"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={
              'flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px ' +
              (isActive
                ? 'text-sky-500 border-sky-500'
                : 'text-slate-500 border-transparent hover:text-slate-700')
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
