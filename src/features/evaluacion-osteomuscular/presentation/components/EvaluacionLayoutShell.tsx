'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bone } from 'lucide-react';
import { UnsavedChangesModal } from '@/components/UnsavedChangesModal';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';

interface EvaluacionLayoutShellProps {
  children: ReactNode;
}

export function EvaluacionLayoutShell({ children }: EvaluacionLayoutShellProps) {
  const router = useRouter();
  const { idAtencion, atencion, isDirty, reset, save, saving, saveError } =
    useEvaluacionContext();
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);

  const leaveForm = () => {
    reset(atencion);
    router.push(`/areas/musculoesqueletica/jjc/${idAtencion}`);
  };

  const handleExit = () => {
    if (isDirty) {
      setShowUnsavedChangesModal(true);
      return;
    }

    leaveForm();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-50 text-sky-600">
            <Bone className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-slate-900">
              Evaluación Clínica Osteomuscular
            </h1>
            <p className="text-sm text-slate-500">
              Atención #{idAtencion} — {atencion.paciente}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
        </div>
      </div>

      <div
        className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8"
      >
        {children}

        <div className="flex flex-wrap items-center justify-end gap-4 border-t border-slate-200 pt-8">
          {saveError !== null && (
            <p role="alert" className="text-sm text-red-600">
              {saveError}
            </p>
          )}
          <button
            type="button"
            onClick={handleExit}
            className="px-6 py-2 border border-sky-600 text-sky-600 font-medium rounded-lg hover:bg-sky-50 transition-all text-sm cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              void save();
            }}
            disabled={saving}
            className="px-6 py-2 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 shadow-md transition-all active:scale-95 text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {showUnsavedChangesModal && (
        <UnsavedChangesModal
          onCancel={() => setShowUnsavedChangesModal(false)}
          onConfirm={() => {
            setShowUnsavedChangesModal(false);
            leaveForm();
          }}
        />
      )}
    </div>
  );
}
