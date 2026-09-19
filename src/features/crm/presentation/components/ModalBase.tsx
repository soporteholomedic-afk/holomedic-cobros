'use client';

import type { ReactNode } from 'react';

/**
 * ModalBase — the shared dialog shell for the pipeline input modals
 * (Rechazo/Handoff, tasks pr11/WU3): overlay + labelled dialog + the
 * Cancelar action. Input forms are injected as children; success and
 * error handling stay in each modal.
 */
export interface ModalBaseProps {
  titulo: string;
  onSalir: () => void;
  children: ReactNode;
}

export function ModalBase({ titulo, onSalir, children }: ModalBaseProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onSalir}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-800">{titulo}</h2>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onSalir}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
