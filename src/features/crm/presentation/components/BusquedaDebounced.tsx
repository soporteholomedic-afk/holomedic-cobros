'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface BusquedaDebouncedProps {
  /** Controlled value owned by the parent (kept in sync for external clears). */
  valor: string;
  /** Fires at most once every `DEMORA_MS` after the last keystroke. */
  onBusca: (texto: string) => void;
  etiqueta: string;
}

const DEMORA_MS = 300;

/**
 * Debounced search box (S17): a plain styled text input — search has no
 * native-widget problem — with a clear (×) button that resets immediately.
 * The parent owns the committed value; keystrokes debounce 300 ms so each
 * filter change is one request, not one per keystroke.
 */
export function BusquedaDebounced({ valor, onBusca, etiqueta }: BusquedaDebouncedProps) {
  const [texto, setTexto] = useState(valor);
  const [valorRecibido, setValorRecibido] = useState(valor);
  const ultimaEnviada = useRef(valor);

  // External value changes (limpiar filtros) win over local text — adjusted
  // during render (react.dev "adjusting state when a prop changes"), not in
  // an effect.
  if (valor !== valorRecibido) {
    setValorRecibido(valor);
    setTexto(valor);
  }

  useEffect(() => {
    if (texto === ultimaEnviada.current) return;
    const timer = setTimeout(() => {
      ultimaEnviada.current = texto;
      onBusca(texto);
    }, DEMORA_MS);
    return () => clearTimeout(timer);
  }, [texto, onBusca]);

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="busqueda-inactivas">
        {etiqueta}
      </label>
      <input
        id="busqueda-inactivas"
        type="text"
        value={texto}
        placeholder={etiqueta}
        onChange={(e) => setTexto(e.target.value)}
        className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-1.5 pr-8 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
      />
      {texto !== '' && (
        <button
          type="button"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            setTexto('');
            ultimaEnviada.current = '';
            onBusca('');
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
