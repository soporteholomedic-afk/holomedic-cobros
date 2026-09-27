'use client';

import { Inbox } from 'lucide-react';

/**
 * EstadoVacio (task 8.3, spec OP-3) — shown when the active tab +
 * search match no empresa. Copy verbatim from the design mock; the
 * "+ Anotar Empresa" CTA reports itself via onAnotar (PanelCrm wires
 * it: interim → /crm/empresas/nueva, replaced by the alta modal in
 * task 10.2).
 */

export interface EstadoVacioProps {
  onAnotar: () => void;
}

export function EstadoVacio({ onAnotar }: EstadoVacioProps) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Inbox className="h-8 w-8" aria-hidden="true" />
      </div>
      <h4 className="text-sm font-semibold text-slate-700">No hay empresas que mostrar</h4>
      <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
        Prueba quitando los filtros o registra una nueva empresa para empezar.
      </p>
      <button
        type="button"
        onClick={onAnotar}
        className="mt-4 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700"
      >
        + Anotar Empresa
      </button>
    </div>
  );
}
