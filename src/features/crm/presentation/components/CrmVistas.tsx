'use client';

import { useState } from 'react';

import { CrmBoard } from './CrmBoard';
import { CrmInactivas } from './CrmInactivas';
import { CrmViewTabs, type CrmVista } from './CrmViewTabs';

/**
 * Owner of the `/crm` view switch (feature crm-vista-inactivas, S1): the
 * kanban stays the default "Pipeline" tab; "Inactivas" mounts its list lazily
 * (the SIGLA lookup only runs when the tab is actually opened) and keeps the
 * loaded count as the tab badge.
 */
export function CrmVistas() {
  const [vista, setVista] = useState<CrmVista>('pipeline');
  const [inactivasCount, setInactivasCount] = useState<number | null>(null);

  return (
    <div>
      <div className="border-b border-slate-200 bg-white px-4">
        <div className="mx-auto max-w-7xl">
          <CrmViewTabs activeView={vista} onViewChange={setVista} inactivasCount={inactivasCount} />
        </div>
      </div>
      {vista === 'pipeline' ? (
        <CrmBoard />
      ) : (
        <CrmInactivas onCargado={setInactivasCount} />
      )}
    </div>
  );
}
