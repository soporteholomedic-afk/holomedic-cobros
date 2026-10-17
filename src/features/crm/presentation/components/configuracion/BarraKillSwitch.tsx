'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { CLASES_BOTON_PRIMARIO, CLASES_BOTON_SECUNDARIO } from './estilos';

/**
 * BarraKillSwitch (agente-ia-crm E5·T6) — the sticky global kill-switch
 * bar of /admin/crm/configuracion. It renders the SERVER's state only
 * (`habilitado` comes from the hook, which adopts the endpoint's answer
 * — no optimistic UI). Turning the agent OFF applies immediately;
 * turning it back ON asks an inline accessible confirmation (no
 * window.confirm). A failure shows its text and the previous state stays.
 */

interface BarraKillSwitchProps {
  /** Server state; null while it has not loaded (switch disabled). */
  habilitado: boolean | null;
  cambiando: boolean;
  error: string | null;
  onCambiar: (habilitado: boolean) => Promise<boolean>;
}

export function BarraKillSwitch({ habilitado, cambiando, error, onCambiar }: BarraKillSwitchProps) {
  const [confirmando, setConfirmando] = useState(false);
  const idTitulo = useId();
  const idDescripcion = useId();
  const cancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmando) cancelarRef.current?.focus();
  }, [confirmando]);

  function alAlternar(): void {
    if (habilitado === null) return;
    if (habilitado) {
      void onCambiar(false);
      return;
    }
    setConfirmando(true);
  }

  async function alConfirmar(): Promise<void> {
    await onCambiar(true);
    setConfirmando(false);
  }

  function alPulsarTecla(evento: KeyboardEvent<HTMLDivElement>): void {
    if (evento.key === 'Escape') setConfirmando(false);
  }

  const activo = habilitado === true;
  const texto =
    habilitado === null
      ? 'Estado del agente no disponible'
      : activo
        ? 'Agente activo'
        : 'Agente en pausa: solo borradores';

  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={activo}
          aria-label="Agente de IA habilitado"
          disabled={habilitado === null || cambiando}
          onClick={alAlternar}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:focus-visible:ring-sky-400 focus-visible:ring-offset-2 ring-offset-white dark:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60 ${
            activo ? 'bg-emerald-700 dark:bg-emerald-600' : 'bg-slate-500 dark:bg-slate-600'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
              activo ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <p
          aria-live="polite"
          className={`text-sm font-semibold ${
            activo ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'
          }`}
        >
          {texto}
        </p>
        {cambiando && <span className="text-xs text-slate-600 dark:text-slate-400">Aplicando…</span>}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {confirmando && (
        <div
          role="alertdialog"
          aria-labelledby={idTitulo}
          aria-describedby={idDescripcion}
          onKeyDown={alPulsarTecla}
          className="mt-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3"
        >
          <p id={idTitulo} className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            ¿Reactivar el agente?
          </p>
          <p id={idDescripcion} className="mt-1 text-sm text-amber-900 dark:text-amber-100">
            El agente volverá a responder a los clientes en su próxima ejecución.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={CLASES_BOTON_PRIMARIO} onClick={() => void alConfirmar()} disabled={cambiando}>
              Sí, reactivar
            </button>
            <button
              type="button"
              ref={cancelarRef}
              className={CLASES_BOTON_SECUNDARIO}
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
