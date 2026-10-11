'use client';

import { useState } from 'react';
import { Bot, Check, Pencil, X } from 'lucide-react';

import type { CampoFicha, DatoFicha, FichaConversacion } from '../../../domain/entities';
import { formatearTelefono } from './guards';

/**
 * FichaContacto (agente-ia-crm E3·T5) — the right column's contact
 * card (mockup .side '📇 Datos del contacto'): Nombre/Cargo/
 * Trabajadores/Sedes/Teléfono rows. A pending value renders
 * '— por detectar —'; IA-origin rows carry the '🤖' tag; canonical
 * rows render plain. Clicking a ficha row's value opens an inline
 * editor (input + save/cancel) that confirms through
 * confirmarDatoFicha — ALL ficha rows stay editable (the operator may
 * override even a canonical value). Nombre/Teléfono come from the
 * contacto row and are display-only (the API confirms only
 * cargo/trabajadores/sedes).
 */

export interface FichaContactoProps {
  ficha: FichaConversacion | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  confirmando: boolean;
  errorConfirmacion: string | null;
  /** true → dato confirmed (ficha refreshed). */
  onConfirmar: (campo: CampoFicha, valor: string) => Promise<boolean>;
}

interface FilaCampo {
  campo: CampoFicha;
  etiqueta: string;
}

const CAMPOS: readonly FilaCampo[] = [
  { campo: 'cargo', etiqueta: 'Cargo' },
  { campo: 'trabajadores', etiqueta: 'Trabajadores' },
  { campo: 'sedes', etiqueta: 'Sedes' },
];

const TEXTO_PENDIENTE = '— por detectar —';

function EtiquetaDato({ dato }: { dato: DatoFicha }): string | null {
  if (dato.origen !== 'IA' || dato.valor === null) return null; // canónica/humana: limpia
  return '🤖';
}

export function FichaContacto({
  ficha,
  status,
  error,
  confirmando,
  errorConfirmacion,
  onConfirmar,
}: FichaContactoProps) {
  const [editando, setEditando] = useState<CampoFicha | null>(null);
  const [texto, setTexto] = useState('');

  function abrirEditor(campo: CampoFicha, actual: string | null): void {
    setEditando(campo);
    setTexto(actual ?? '');
  }

  async function guardar(campo: CampoFicha): Promise<void> {
    const valor = texto.trim();
    if (valor === '' || confirmando) return;
    const ok = await onConfirmar(campo, valor);
    if (ok) setEditando(null);
  }

  return (
    <section
      aria-label="Datos del contacto"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        📇 Datos del contacto
      </h3>
      <p className="text-[10px] text-slate-400 dark:text-slate-500">la Guía los va llenando</p>

      {status === 'loading' && (
        <div role="status" className="mt-3 space-y-2" aria-label="Cargando ficha">
          <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      )}

      {status === 'error' && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error ?? 'Error al cargar la ficha'}
        </p>
      )}

      {status === 'ready' && ficha !== null && (
        <dl className="mt-3 space-y-2 text-xs sm:text-sm">
          <div className="flex items-start justify-between gap-2">
            <dt className="flex-none text-slate-500 dark:text-slate-400">Nombre</dt>
            <dd className="text-right font-medium text-slate-800 dark:text-slate-200">
              {ficha.contacto?.nombre ?? TEXTO_PENDIENTE}
            </dd>
          </div>

          {CAMPOS.map(({ campo, etiqueta }) => {
            const dato = ficha.datos[campo];
            const glifo = EtiquetaDato({ dato });
            return (
              <div key={campo} className="flex items-start justify-between gap-2">
                <dt className="flex-none text-slate-500 dark:text-slate-400">{etiqueta}</dt>
                <dd className="flex min-w-0 flex-1 flex-col items-end gap-1">
                  {editando === campo ? (
                    <>
                      <input
                        aria-label={`Valor para ${campo}`}
                        value={texto}
                        onChange={(evento) => setTexto(evento.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 dark:text-slate-100 px-2 py-1 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <span className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void guardar(campo)}
                          disabled={texto.trim() === '' || confirmando}
                          className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" /> Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditando(null)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <X className="h-3 w-3" aria-hidden="true" /> Cancelar
                        </button>
                      </span>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => abrirEditor(campo, dato.valor)}
                      aria-label={`Editar ${campo}`}
                      className="group flex min-w-0 items-center gap-1 text-right font-medium text-slate-800 dark:text-slate-200"
                    >
                      <span className="truncate">
                        {dato.valor ?? (
                          <span className="italic text-slate-400 dark:text-slate-500">
                            {TEXTO_PENDIENTE}
                          </span>
                        )}
                      </span>
                      {glifo !== null && (
                        <span title="Extraído por la Guía" aria-label="Extraído por la Guía">
                          <Bot className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
                        </span>
                      )}
                      <Pencil
                        className="h-3 w-3 text-slate-300 opacity-0 transition group-hover:opacity-100 dark:text-slate-600"
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </dd>
              </div>
            );
          })}

          <div className="flex items-start justify-between gap-2">
            <dt className="flex-none text-slate-500 dark:text-slate-400">Teléfono</dt>
            <dd className="text-right font-medium text-slate-800 dark:text-slate-200">
              {formatearTelefono(ficha.contacto?.telefono ?? null) ?? TEXTO_PENDIENTE}
            </dd>
          </div>
        </dl>
      )}

      {errorConfirmacion !== null && (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
          {errorConfirmacion}
        </p>
      )}
    </section>
  );
}
