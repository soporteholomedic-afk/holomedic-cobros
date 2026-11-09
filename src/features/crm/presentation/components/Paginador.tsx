'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { ReactElement } from 'react';

export interface PaginadorProps {
  pagina: number;
  paginas: number;
  onPagina: (pagina: number) => void;
}

/** Custom pager (S16, no native widgets): first/prev/next/last + indicator. */
export function Paginador({ pagina, paginas, onPagina }: PaginadorProps): ReactElement {
  const boton = (label: string, destino: number, icono: ReactElement, deshabilitado: boolean) => (
    <button
      type="button"
      aria-label={label}
      disabled={deshabilitado}
      onClick={() => onPagina(destino)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
    >
      {icono}
    </button>
  );

  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
      {boton('Primera página', 1, <ChevronsLeft className="h-4 w-4" aria-hidden="true" />, pagina <= 1)}
      {boton('Página anterior', pagina - 1, <ChevronLeft className="h-4 w-4" aria-hidden="true" />, pagina <= 1)}
      <span>
        Página {pagina} de {paginas}
      </span>
      {boton('Página siguiente', pagina + 1, <ChevronRight className="h-4 w-4" aria-hidden="true" />, pagina >= paginas)}
      {boton('Última página', paginas, <ChevronsRight className="h-4 w-4" aria-hidden="true" />, pagina >= paginas)}
    </div>
  );
}
