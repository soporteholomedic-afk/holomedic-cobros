'use client';

import { useState } from 'react';
import { Brain, Pencil, Pin, Plus, Trash2, X } from 'lucide-react';

import type {
  MemoriaLista,
  NivelMemoria,
  TipoObservacionDestilada,
} from '../../../domain/entities';

/**
 * MemoriasPanel (agente-ia-crm E3·T5) — the right column's memory
 * list (mockup .side '🧠 Memorias de la gente'): rows `<tipo>
 * contenido` with 📌 on pineadas, per-row pinear/eliminar (eliminar
 * confirms first), the edit flow (inline prefilled form → eliminar +
 * guardar through onGuardar's reemplazaObservacionId) and '+ Nueva
 * memoria' (nivel selector + tipo + titulo + contenido). All writes
 * live in useHiloConversacion; this component only renders and
 * reports the payloads.
 */

export interface EntradaMemoriaForm {
  nivel: NivelMemoria;
  tipo: TipoObservacionDestilada;
  titulo: string;
  contenido: string;
  /** Edit flow: the observation replaced by eliminar + guardar. */
  reemplazaObservacionId?: number;
}

export interface MemoriasPanelProps {
  memorias: MemoriaLista[];
  /** The scoping empresa (null → conversation sin vincular). */
  empresaId: number | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  gestionando: boolean;
  errorAccion: string | null;
  onPinear: (observacionId: number) => Promise<boolean>;
  onEliminar: (observacionId: number) => Promise<boolean>;
  onGuardar: (entrada: EntradaMemoriaForm) => Promise<boolean>;
}

const TIPOS: readonly TipoObservacionDestilada[] = [
  'hecho_cliente',
  'acuerdo',
  'compromiso',
  'preferencia',
  'objecion',
  'indicacion_humana',
];

const NIVELES: readonly NivelMemoria[] = ['chat', 'empresa'];

interface FormularioState {
  reemplazaObservacionId?: number;
  nivel: NivelMemoria;
  tipo: TipoObservacionDestilada;
  titulo: string;
  contenido: string;
}

const FORM_VACIO: FormularioState = { nivel: 'chat', tipo: 'hecho_cliente', titulo: '', contenido: '' };

export function MemoriasPanel({
  memorias,
  empresaId,
  status,
  error,
  gestionando,
  errorAccion,
  onPinear,
  onEliminar,
  onGuardar,
}: MemoriasPanelProps) {
  const [formulario, setFormulario] = useState<FormularioState | null>(null);
  const [validacion, setValidacion] = useState<string | null>(null);

  function abrirNueva(): void {
    setValidacion(null);
    setFormulario({ ...FORM_VACIO });
  }

  function abrirEdicion(memoria: MemoriaLista): void {
    setValidacion(null);
    setFormulario({
      reemplazaObservacionId: memoria.id,
      nivel: memoria.nivel,
      tipo: (TIPOS as readonly string[]).includes(memoria.tipo)
        ? (memoria.tipo as TipoObservacionDestilada)
        : 'hecho_cliente',
      titulo: memoria.titulo,
      contenido: memoria.contenido,
    });
  }

  async function guardar(): Promise<void> {
    if (formulario === null || gestionando) return;
    if (formulario.titulo.trim() === '' || formulario.contenido.trim() === '') {
      setValidacion('Completá el título y el contenido.');
      return;
    }
    const ok = await onGuardar({
      nivel: formulario.nivel,
      tipo: formulario.tipo,
      titulo: formulario.titulo,
      contenido: formulario.contenido,
      ...(formulario.reemplazaObservacionId !== undefined
        ? { reemplazaObservacionId: formulario.reemplazaObservacionId }
        : {}),
    });
    if (ok) setFormulario(null);
  }

  async function eliminar(memoria: MemoriaLista): Promise<void> {
    if (gestionando) return;
    // Confirmación explícita: borrar memoria es destructivo.
    const confirmado = window.confirm('¿Eliminar esta memoria?');
    if (!confirmado) return;
    await onEliminar(memoria.id);
  }

  return (
    <section
      aria-label="Memorias de la gente"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        🧠 Memorias de la gente
      </h3>

      {status === 'loading' && (
        <div role="status" className="mt-3 space-y-2" aria-label="Cargando memorias">
          <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      )}

      {status === 'error' && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error ?? 'Error al cargar las memorias'}
        </p>
      )}

      {status === 'ready' && (
        <div className="mt-3 space-y-2">
          {memorias.length === 0 && formulario === null && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Sin memorias todavía en esta conversación.
            </p>
          )}

          {memorias.map((memoria) => (
            <article
              key={memoria.id}
              className="rounded-xl border border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-950/30 p-2.5"
            >
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                <b className="font-bold">
                  {memoria.pineada ? '📌 ' : ''}
                  {memoria.tipo}
                </b>
                {memoria.titulo.trim() !== '' ? ` · ${memoria.titulo}` : ''}
                <span className="ml-1 rounded-full bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {memoria.nivel}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{memoria.contenido}</p>
              <div className="mt-1.5 flex gap-1">
                {!memoria.pineada && (
                  <button
                    type="button"
                    onClick={() => void onPinear(memoria.id)}
                    disabled={gestionando}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Pin className="h-3 w-3" aria-hidden="true" /> Pinear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => abrirEdicion(memoria)}
                  disabled={gestionando}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => void eliminar(memoria)}
                  disabled={gestionando}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-red-500 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" /> Eliminar
                </button>
              </div>
            </article>
          ))}

          {formulario !== null && (
            <form
              className="space-y-2 rounded-xl border border-teal-200 dark:border-teal-900/50 bg-teal-50/60 dark:bg-teal-950/20 p-2.5"
              onSubmit={(evento) => {
                evento.preventDefault();
                void guardar();
              }}
            >
              <div className="flex gap-2">
                <label className="flex-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Nivel
                  <select
                    aria-label="Nivel"
                    value={formulario.nivel}
                    onChange={(evento) =>
                      setFormulario({
                        ...formulario,
                        nivel: evento.target.value as NivelMemoria,
                      })
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                  >
                    {NIVELES.map((nivel) => (
                      <option key={nivel} value={nivel}>
                        {nivel === 'chat' ? 'chat (esta conversación)' : 'empresa (todas)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Tipo
                  <select
                    aria-label="Tipo"
                    value={formulario.tipo}
                    onChange={(evento) =>
                      setFormulario({
                        ...formulario,
                        tipo: evento.target.value as TipoObservacionDestilada,
                      })
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                  >
                    {TIPOS.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Título
                <input
                  value={formulario.titulo}
                  onChange={(evento) => setFormulario({ ...formulario, titulo: evento.target.value })}
                  className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                />
              </label>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Contenido
                <textarea
                  value={formulario.contenido}
                  onChange={(evento) =>
                    setFormulario({ ...formulario, contenido: evento.target.value })
                  }
                  rows={2}
                  className="mt-0.5 w-full resize-none rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                />
              </label>
              {validacion !== null && (
                <p role="alert" className="text-[11px] font-medium text-red-600 dark:text-red-400">
                  {validacion}
                </p>
              )}
              <div className="flex gap-1.5">
                <button
                  type="submit"
                  disabled={gestionando}
                  className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Brain className="h-3 w-3" aria-hidden="true" /> Guardar memoria
                </button>
                <button
                  type="button"
                  onClick={() => setFormulario(null)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-3 w-3" aria-hidden="true" /> Cancelar
                </button>
              </div>
            </form>
          )}

          <button
            type="button"
            onClick={abrirNueva}
            disabled={empresaId === null || gestionando}
            className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-2 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3 w-3" aria-hidden="true" /> + Nueva memoria
          </button>
          {empresaId === null && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Vinculá la conversación a una empresa para guardar memorias.
            </p>
          )}
        </div>
      )}

      {errorAccion !== null && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
          {errorAccion}
        </p>
      )}
    </section>
  );
}
