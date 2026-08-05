'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface UnsavedChangesModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export function UnsavedChangesModal({
  onCancel,
  onConfirm,
}: UnsavedChangesModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-slate-100 p-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="unsaved-changes-title" className="text-lg font-bold text-slate-900">
              Cambios sin guardar
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Hay cambios sin guardar. Si sale, se perderán los datos no guardados.
            </p>
            <p className="mt-1 text-sm font-medium text-slate-700">¿Desea salir?</p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 bg-slate-50/70 p-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-white"
          >
            Seguir editando
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Salir sin guardar
          </button>
        </div>
      </div>
    </div>
  );
}
