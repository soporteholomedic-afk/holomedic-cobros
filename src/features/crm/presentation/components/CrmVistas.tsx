'use client';

import { useState } from 'react';

import { CrmBoard } from './CrmBoard';
import { CrmInactivas } from './CrmInactivas';
import { CrmViewTabs, type CrmVista } from './CrmViewTabs';
import { RegistrarContactoPanel } from './RegistrarContactoPanel';
import { useRegistroDesdeInactivas } from './useRegistroDesdeInactivas';

/**
 * Owner of the `/crm` view switch (feature crm-vista-inactivas, S1): the
 * kanban stays the default "Pipeline" tab; "Inactivas" mounts its list
 * lazily (the SIGLA lookup only runs when the tab is actually opened) and
 * keeps the loaded count as the tab badge. "Registrar contacto" from a row
 * opens the board's own `RegistrarContactoPanel` for that empresa (S6);
 * saving a contact closes the panel and bumps `recargas` so the list (and
 * its último-contacto column) refetches — the row itself stays until SIGLA
 * records a new attention.
 */
export function CrmVistas() {
  const [vista, setVista] = useState<CrmVista>('pipeline');
  const [inactivasCount, setInactivasCount] = useState<number | null>(null);
  const [recargas, setRecargas] = useState(0);
  const registro = useRegistroDesdeInactivas(() => setRecargas((k) => k + 1));

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
        <CrmInactivas
          onCargado={setInactivasCount}
          reloadKey={recargas}
          onRegistrar={(idEmpresa) => void registro.abrir(idEmpresa)}
        />
      )}
      {registro.listo && (
        <RegistrarContactoPanel
          key={registro.listo.empresa.idEmpresa}
          empresa={registro.listo.empresa}
          empresas={registro.listo.empresas}
          oportunidades={registro.listo.oportunidades}
          oportunidadInicial={null}
          direccion="saliente"
          hoy={registro.listo.hoy}
          onCerrar={registro.cerrar}
          onGuardado={registro.guardado}
        />
      )}
    </div>
  );
}
