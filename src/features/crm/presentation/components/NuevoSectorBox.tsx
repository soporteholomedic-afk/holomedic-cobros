'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { ICONOS_SECTOR, ICONO_SECTOR_LABELS, type IconoSector, type Sector } from '../../domain/entities';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, ERROR_CAMPO, INPUT_VALIDABLE, iconoDeSector } from './crmUi';

/** Result of storing a sector: the stored one, or an error (`duplicado` when the server says it exists). */
export type ResultadoSector = Sector | { error: string; duplicado?: boolean };

interface Props {
  /** Prefix of the element ids. */
  base: string;
  /** Sectors already stored, to catch a repeated name without calling the server. */
  sectores: Sector[];
  /** Message under "Nombre"; owned by the parent so it can also show "Agrega el sector nuevo o cancélalo.". */
  error: string;
  onError: (mensaje: string) => void;
  /** Stores the sector. */
  onCrear: (nombre: string, icono: IconoSector) => Promise<ResultadoSector>;
  /** The sector was stored. */
  onCreado: (sector: Sector) => void;
  onCancelar: () => void;
}

const TECLA_ICONO =
  'relative grid h-10 cursor-pointer place-items-center rounded-[10px] border has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-500';
const ICONO_NORMAL =
  'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';
const ICONO_ELEGIDO = 'border-transparent bg-gradient-to-tr from-sky-600 to-blue-600 text-white shadow-md shadow-sky-600/25';

/** Inline box "Nuevo sector" (spec S12): a name and one icon out of the closed list of twelve. */
export function NuevoSectorBox({ base, sectores, error, onError, onCrear, onCreado, onCancelar }: Props) {
  const [nombre, setNombre] = useState('');
  const [icono, setIcono] = useState<IconoSector>(ICONOS_SECTOR[0]);
  const [guardando, setGuardando] = useState(false);
  const idNombre = `${base}-sec-nom`;
  const idError = `${idNombre}-err`;

  const enfocar = () => document.getElementById(idNombre)?.focus();

  function fallar(mensaje: string) {
    onError(mensaje);
    enfocar();
  }

  async function agregar() {
    if (guardando) return;
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    if (!limpio) return fallar('Escribe el nombre del sector.');
    const ya = sectores.find((s) => s.nombre.toLowerCase() === limpio.toLowerCase());
    if (ya) return fallar(`«${ya.nombre}» ya existe. Elígelo en la lista.`);
    onError('');
    setGuardando(true);
    const r = await onCrear(limpio, icono);
    setGuardando(false);
    if ('error' in r) return fallar(r.duplicado ? `«${limpio}» ya existe. Elígelo en la lista.` : r.error);
    onCreado(r);
  }

  return (
    <div
      role="group"
      aria-labelledby={`${base}-sec-t`}
      className="grid gap-3 rounded-xl border border-sky-300 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950/40"
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          onCancelar();
        } else if (ev.key === 'Enter' && ev.target instanceof HTMLInputElement && ev.target.type === 'text') {
          ev.preventDefault();
          void agregar();
        }
      }}
    >
      <h4 id={`${base}-sec-t`} className="text-[13px] font-bold text-sky-800 dark:text-sky-200">
        Nuevo sector
      </h4>
      <div className="grid gap-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">
        <label htmlFor={idNombre}>Nombre</label>
        <input
          id={idNombre}
          autoFocus
          autoComplete="off"
          maxLength={50}
          value={nombre}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          onChange={(ev) => {
            setNombre(ev.target.value);
            onError('');
          }}
          placeholder="Ej. Salud y Clínicas"
          className={INPUT_VALIDABLE}
        />
        {error && (
          <p id={idError} role="alert" className={ERROR_CAMPO}>
            {error}
          </p>
        )}
      </div>
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-semibold text-slate-800 dark:text-slate-200">Ícono</legend>
        <div role="radiogroup" aria-label="Ícono" className="grid grid-cols-6 gap-1.5">
          {ICONOS_SECTOR.map((k) => {
            const Icono = iconoDeSector(k);
            return (
              <label key={k} title={ICONO_SECTOR_LABELS[k]} className={`${TECLA_ICONO} ${icono === k ? ICONO_ELEGIDO : ICONO_NORMAL}`}>
                <input
                  type="radio"
                  name={`${base}-sec-ic`}
                  value={k}
                  aria-label={ICONO_SECTOR_LABELS[k]}
                  checked={icono === k}
                  onChange={() => setIcono(k)}
                  className="absolute inset-0 m-0 cursor-pointer opacity-0"
                />
                <Icono className="h-[18px] w-[18px]" aria-hidden="true" />
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="text-xs text-slate-600 dark:text-slate-400">Queda disponible para todas las empresas.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className={`${BOTON_SECUNDARIO} !h-9`}>
          Cancelar
        </button>
        <button type="button" disabled={guardando} onClick={() => void agregar()} className={`${BOTON_PRIMARIO} inline-flex !h-9 items-center gap-1.5`}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Agregar sector
        </button>
      </div>
    </div>
  );
}
