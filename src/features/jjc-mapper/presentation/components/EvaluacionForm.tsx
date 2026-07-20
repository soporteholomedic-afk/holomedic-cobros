'use client';

import type { AtencionDetalle, Fototipo, LesionType } from '@/types/jjc';
import type { JjcFormState } from '@/features/jjc-mapper/presentation/hooks/useJjcEvaluacion';
import { PatientSummaryFields } from './PatientSummaryFields';
import { FototipoFitzpatrickPicker } from './FototipoFitzpatrickPicker';
import { LesionCounters } from './LesionCounters';

interface EvaluacionFormProps {
  atencion: AtencionDetalle | null;
  form: JjcFormState;
  counters: Record<LesionType, number>;
  onFototipoChange: (f: Fototipo) => void;
  onFechaChange: (fecha: string) => void;
  onObservacionesChange: (text: string) => void;
}

/**
 * Right-pane evaluation form with patient summary, evaluation metadata,
 * Fototipo Fitzpatrick picker, and lesion counters.
 *
 * Scrollable with sticky footer for the (future) save button.
 */
export function EvaluacionForm({
  atencion,
  form,
  counters,
  onFototipoChange,
  onFechaChange,
  onObservacionesChange,
}: EvaluacionFormProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-6">
        {/* Sección: Datos personales */}
        <section>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
            Datos personales
          </h3>
          {atencion ? (
            <PatientSummaryFields atencion={atencion} />
          ) : (
            <p className="text-sm text-slate-400 italic">
              Atención no encontrada
            </p>
          )}
        </section>

        {/* Sección: Evaluación */}
        <section>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
            Evaluación
          </h3>

          <div className="space-y-4">
            {/* Fecha de evaluación */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Fecha de evaluación
              </label>
              <input
                type="date"
                value={form.fechaEvaluacion}
                onChange={(e) => onFechaChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
              />
            </div>

            {/* Lugar (readonly) */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Lugar
              </label>
              <input
                type="text"
                value="HOLOMEDIC"
                readOnly
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500 cursor-default"
              />
            </div>

            {/* Fototipo Fitzpatrick */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Fototipo Fitzpatrick
              </label>
              <FototipoFitzpatrickPicker
                value={form.fototipo}
                onChange={onFototipoChange}
              />
            </div>

            {/* Observaciones */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Observaciones
              </label>
              <textarea
                value={form.observaciones}
                onChange={(e) => onObservacionesChange(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700 resize-none"
                placeholder="Observaciones (opcional, máx. 500 caracteres)"
              />
              <p className="text-xs text-slate-400 text-right">
                {form.observaciones.length}/500
              </p>
            </div>
          </div>
        </section>

        {/* Sección: Lesiones — counters */}
        <section>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
            Lesiones mapeadas
          </h3>
          <LesionCounters counters={counters} />
        </section>
      </div>

      {/* Sticky footer (Save button — wired in PR3) */}
      <div className="sticky bottom-0 pt-4 pb-2 bg-white border-t border-slate-100 mt-4">
        <p className="text-xs text-slate-400 text-center">
          Guardar evaluación disponible en la próxima versión
        </p>
      </div>
    </div>
  );
}
