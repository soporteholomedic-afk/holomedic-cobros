'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactElement } from 'react';

export interface EncabezadoOrdenableProps {
  etiqueta: string;
  campo: string;
  /** The active sort field; `null` when another column owns the sort. */
  orden: string | null;
  direccion: 'asc' | 'desc' | null;
  onOrden: (campo: string, direccion: 'asc' | 'desc') => void;
}

/**
 * Sortable column header (S15, no native widgets): a button inside the `th`
 * with `aria-sort`, cycling none → default → opposite. Defaults: text fields
 * (razonSocial) start ascending, the rest start descending (most relevant
 * first: most abandoned, oldest attention).
 */
export function EncabezadoOrdenable({ etiqueta, campo, orden, direccion, onOrden }: EncabezadoOrdenableProps): ReactElement {
  const activo = orden === campo;
  const ariaSort = !activo ? 'none' : direccion === 'asc' ? 'ascending' : 'descending';
  const direccionDefault = campo === 'razonSocial' ? 'asc' : 'desc';
  const Icono = !activo ? ArrowUpDown : direccion === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th scope="col" aria-sort={ariaSort} className="px-4 py-2.5">
      <button
        type="button"
        onClick={() =>
          onOrden(campo, activo ? (direccion === 'asc' ? 'desc' : 'asc') : direccionDefault)
        }
        className={
          'inline-flex items-center gap-1 uppercase tracking-wide ' +
          (activo ? 'text-sky-600' : 'text-slate-500 hover:text-slate-700')
        }
      >
        {etiqueta}
        <Icono className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </th>
  );
}
