'use client';

import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { BOTON_SECUNDARIO, INPUT } from './crmUi';

interface Props {
  id: string;
  sectores: string[];
  valor: string;
  onCambio: (sector: string) => void;
  /** Resolves to the stored name, or `{ error }` to show under the mini form. */
  onCrear: (nombre: string) => Promise<string | { error: string }>;
}

/** Sector dropdown with a small "Nuevo sector" form that creates the sector on the spot. */
export function SectorSelect({ id, sectores, valor, onCambio, onCrear }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const abrirBoton = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);

  useEffect(() => {
    // The button is mounted again only after the mini form closes.
    if (!abierto && devolverFoco.current) {
      devolverFoco.current = false;
      abrirBoton.current?.focus();
    }
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setNombre('');
    setError('');
    devolverFoco.current = true;
  }

  async function agregar() {
    if (guardando) return;
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    if (!limpio) return setError('Escribe el nombre del sector.');
    if (sectores.some((s) => s.toLowerCase() === limpio.toLowerCase())) return setError('Ese sector ya existe.');
    setError('');
    setGuardando(true);
    const r = await onCrear(limpio);
    setGuardando(false);
    if (typeof r !== 'string') return setError(r.error);
    onCambio(r);
    cerrar();
  }

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">
        Sector
      </label>
      <select id={id} value={valor} onChange={(ev) => onCambio(ev.target.value)} className={INPUT}>
        <option value="">Sin definir</option>
        {sectores.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {abierto ? (
        <div
          className="grid gap-2 rounded-xl border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60"
          onKeyDown={(ev) => {
            if (ev.key === 'Escape') {
              ev.stopPropagation();
              cerrar();
            }
            if (ev.key === 'Enter' && ev.target instanceof HTMLInputElement) {
              ev.preventDefault();
              void agregar();
            }
          }}
        >
          <label className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
            <span>Sector nuevo</span>
            <input
              autoFocus
              value={nombre}
              maxLength={50}
              onChange={(ev) => {
                setNombre(ev.target.value);
                setError('');
              }}
              placeholder="Ej. Educación"
              className={INPUT}
            />
          </label>
          {error && (
            <p role="alert" className="text-[13px] text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cerrar} className={`${BOTON_SECUNDARIO} !h-9`}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={() => void agregar()}
              className="h-9 rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              Agregar sector
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={abrirBoton}
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-sky-700 hover:underline dark:text-sky-300"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Nuevo sector
        </button>
      )}
    </div>
  );
}
