'use client';

import { Search } from 'lucide-react';

/**
 * Buscador (task 8.3, design D4, spec OP-3) — the panel search box.
 * Controlled input: every keystroke reports the new value through
 * onCambiar so PanelCrm re-runs filtrarFilas (live filtering, the
 * mock's oninput behavior — no submit step). The matching itself
 * (nombre/contacto/RUC/sector) is pure-tested in panelDerivado.
 */

export interface BuscadorProps {
  /** Current search term (owned by PanelCrm). */
  valor: string;
  onCambiar: (valor: string) => void;
}

export function Buscador({ valor, onCambiar }: BuscadorProps) {
  return (
    <div className="relative w-full md:w-72">
      <Search
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
      <input
        type="text"
        aria-label="Buscar"
        placeholder="Buscar por nombre de empresa o persona..."
        value={valor}
        onChange={(evento) => onCambiar(evento.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500 sm:text-sm"
      />
    </div>
  );
}
