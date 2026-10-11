'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, UserRound } from 'lucide-react';

import type { UsuarioAsignableVista } from './guards';

/**
 * SelectorEscalar (agente-ia-crm E3·T5) — the TOMADA_HUMANO header
 * action 'Escalar a…': opens a compact select + confirm that hands the
 * conversation to ANOTHER operator (POST [id]/escalar {usuarioId}).
 * The user list is LAZY (loads on first open — usuarios-asignables
 * excludes nobody: every user with crm_conversaciones) and a 400
 * surfaces inline without closing the selector.
 */

export interface SelectorEscalarProps {
  usuarios: UsuarioAsignableVista[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  escalando: boolean;
  errorEscalar: string | null;
  /** Lazy load — the hook dedupes once loaded. */
  onCargar: () => void;
  /** true → escalated (hilo + ajustes refetch); false → keep open. */
  onEscalar: (usuarioId: string) => Promise<boolean>;
}

export function SelectorEscalar({
  usuarios,
  status,
  error,
  escalando,
  errorEscalar,
  onCargar,
  onEscalar,
}: SelectorEscalarProps) {
  const [abierto, setAbierto] = useState(false);
  const [usuarioId, setUsuarioId] = useState('');

  // Primera apertura → pedir la lista UNA vez (el hook deduplica,
  // pero evitamos re-llamar en cada toggle del panel).
  useEffect(() => {
    if (abierto && status === 'idle') onCargar();
  }, [abierto, status, onCargar]);

  async function confirmar(): Promise<void> {
    if (usuarioId === '' || escalando) return;
    const ok = await onEscalar(usuarioId);
    if (ok) {
      setAbierto(false);
      setUsuarioId('');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> Escalar a…
        </button>
      )}

      {abierto && (
        <div
          className="flex flex-col items-end gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/30 p-2"
          role="group"
          aria-label="Escalar conversación"
        >
          <div className="flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {status === 'loading' && <span className="text-xs text-slate-500 dark:text-slate-400">Cargando usuarios…</span>}
            {status === 'error' && (
              <span role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                {error ?? 'Error al cargar los usuarios'}
              </span>
            )}
            {status === 'ready' && (
              <select
                aria-label="Usuario destino"
                value={usuarioId}
                onChange={(evento) => setUsuarioId(evento.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Elegí un compañero…</option>
                {usuarios.map((usuario) => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.nombre}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={usuarioId === '' || escalando}
              className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              aria-label="Cerrar escalado"
              onClick={() => {
                setAbierto(false);
                setUsuarioId('');
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
          {errorEscalar !== null && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              {errorEscalar}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
