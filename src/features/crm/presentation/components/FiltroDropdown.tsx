'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

export interface OpcionDropdown {
  valor: string;
  etiqueta: string;
}

export interface FiltroDropdownProps {
  etiqueta: string;
  opciones: OpcionDropdown[];
  valor: string;
  onCambia: (valor: string) => void;
}

/**
 * Custom dropdown (S17, no native `<select>`): a labelled button opens a
 * popup listbox; options are buttons; it closes on selection, Escape and
 * outside click. The current value renders inline on the button with a
 * chevron.
 */
export function FiltroDropdown({ etiqueta, opciones, valor, onCambia }: FiltroDropdownProps): ReactElement {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuente(e: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuente);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickFuente);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const actual = opciones.find((o) => o.valor === valor) ?? opciones[0];

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto ? 'true' : 'false'}
        onClick={() => setAbierto((a) => !a)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
      >
        {etiqueta}
        {valor !== '' && actual && <span className="font-normal text-slate-500">· {actual.etiqueta}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
      </button>
      {abierto && (
        <ul role="listbox" aria-label={etiqueta} className="absolute z-30 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {opciones.map((opcion) => (
            <li key={opcion.valor || '__todos__'} role="none">
              <button
                type="button"
                role="option"
                aria-selected={opcion.valor === valor ? 'true' : 'false'}
                onClick={() => {
                  onCambia(opcion.valor);
                  setAbierto(false);
                }}
                className={
                  'block w-full px-3 py-2 text-left text-xs ' +
                  (opcion.valor === valor
                    ? 'bg-sky-50 font-semibold text-sky-700'
                    : 'text-slate-600 hover:bg-slate-50')
                }
              >
                {opcion.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
