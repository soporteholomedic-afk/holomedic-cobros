'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import type { ClienteLookupItem } from '../../domain/entities';
import { useLookup } from '../hooks/useLookup';

/**
 * Cliente / facturar-a autocomplete backed by
 * `GET /api/valoraciones/lookups/clientes?q=` (spec Q-R4). Fetching lives
 * in `useLookup` — this component only renders and reports selections.
 */
export interface ClienteAutocompleteProps {
  id: string;
  etiqueta: string;
  /** Display label of the current selection ('' = nothing selected). */
  seleccionado: string;
  onSeleccionar: (item: ClienteLookupItem) => void;
  onLimpiar: () => void;
  placeholder?: string;
}

export function ClienteAutocomplete({
  id,
  etiqueta,
  seleccionado,
  onSeleccionar,
  onLimpiar,
  placeholder = 'Buscar por nombre o RUC…',
}: ClienteAutocompleteProps) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const bloqueado = seleccionado !== '';
  const consulta = texto.trim();
  const { items, cargando, error } = useLookup<ClienteLookupItem>(
    'clientes',
    consulta ? { q: consulta } : {},
    { habilitado: !bloqueado && consulta.length >= 2 },
  );

  // Close the suggestion list on outside mousedown.
  useEffect(() => {
    if (!abierto) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (containerRef.current && target && !containerRef.current.contains(target)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [abierto]);

  const elegir = (item: ClienteLookupItem) => {
    onSeleccionar(item);
    setTexto('');
    setAbierto(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5"
      >
        {etiqueta}
      </label>
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={abierto && !bloqueado && items.length > 0}
          aria-controls={`${id}-sugerencias`}
          placeholder={placeholder}
          value={bloqueado ? seleccionado : texto}
          readOnly={bloqueado}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && abierto && items.length > 0) {
              e.preventDefault();
              elegir(items[0]);
            } else if (e.key === 'Escape') {
              setAbierto(false);
            }
          }}
          className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100 read-only:text-slate-500"
        />
        {bloqueado && (
          <button
            type="button"
            aria-label={`Limpiar ${etiqueta}`}
            onClick={() => {
              onLimpiar();
              setTexto('');
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {abierto && !bloqueado && (
        <div
          id={`${id}-sugerencias`}
          role="listbox"
          aria-label={`Sugerencias de ${etiqueta}`}
          className="absolute z-20 left-0 right-0 mt-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
        >
          {cargando && (
            <p className="px-3 py-2.5 text-xs text-slate-400">Buscando…</p>
          )}
          {!cargando && error && (
            <p className="px-3 py-2.5 text-xs text-rose-500">{error}</p>
          )}
          {!cargando && !error && consulta.length < 2 && (
            <p className="px-3 py-2.5 text-xs text-slate-400">
              Ingrese al menos 2 caracteres
            </p>
          )}
          {!cargando && !error && consulta.length >= 2 && items.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-slate-400">Sin resultados</p>
          )}
          {items.length > 0 && (
            <ul className="max-h-56 overflow-y-auto">
              {items.map((item) => (
                <li key={item.codCli} role="option" aria-selected="false">
                  <button
                    type="button"
                    onClick={() => elegir(item)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-sm text-slate-700 dark:text-slate-200 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{item.nomCom}</span>
                    {item.nroRuc && (
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        RUC {item.nroRuc}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
