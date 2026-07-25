'use client';

import type { AtencionDetalle, Fototipo, Fotoprotector, LesionType, CuestionarioPiel, SiNo } from '@/types/jjc';
import type { JjcFormState, PreguntaSeccion1 } from '@/features/jjc-mapper/presentation/hooks/useJjcEvaluacion';
import type { FormTab } from './JjcFormTabs';
import { PatientSummaryFields } from './PatientSummaryFields';
import { FototipoFitzpatrickPicker } from './FototipoFitzpatrickPicker';
import { LesionCounters } from './LesionCounters';
import { JjcFormTabs } from './JjcFormTabs';
import { CuestionarioPielForm } from './CuestionarioPielForm';

interface EvaluacionFormProps {
  atencion: AtencionDetalle | null;
  form: JjcFormState;
  counters: Record<LesionType, number>;
  preguntas: CuestionarioPiel;
  activeTab: FormTab;
  onFototipoChange: (f: Fototipo) => void;
  onFotoprotectorChange: (f: Fotoprotector) => void;
  onFechaChange: (fecha: string) => void;
  onObservacionesChange: (text: string) => void;
  onTabChange: (tab: FormTab) => void;
  onPreguntaSiNoChange: (key: PreguntaSeccion1, value: SiNo | null) => void;
  onPreguntaDetalleChange: (key: PreguntaSeccion1, value: string) => void;
  onFechaLesionChange: (value: string) => void;
  onSiNoSeccion2Change: (key: 'lesionDermatopatia' | 'evaluacionDermatologo', value: SiNo | null) => void;
  onDescribaChange: (value: string) => void;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
  saveError?: string | null;
}

export function EvaluacionForm({
  atencion,
  form,
  counters,
  preguntas,
  activeTab,
  onFototipoChange,
  onFotoprotectorChange,
  onFechaChange,
  onObservacionesChange,
  onTabChange,
  onPreguntaSiNoChange,
  onPreguntaDetalleChange,
  onFechaLesionChange,
  onSiNoSeccion2Change,
  onDescribaChange,
  onSave,
  saving = false,
  saved = false,
  saveError = null,
}: EvaluacionFormProps) {
  return (
    <div className="h-full flex flex-col">
      <JjcFormTabs activeTab={activeTab} onTabChange={onTabChange} />

      <div className="flex-1 overflow-y-auto space-y-6">
        {activeTab === 'datos' ? (
          <>
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

            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
                Evaluación
              </h3>
              <div className="space-y-4">
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

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Fototipo Fitzpatrick
                  </label>
                  <FototipoFitzpatrickPicker
                    value={form.fototipo}
                    onChange={onFototipoChange}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Fotoprotector a usar:
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(['FPS recomendado +90', 'FPS recomendado +65', 'FPS recomendado +50'] as const).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => onFotoprotectorChange(opt)}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          form.fotoprotector === opt
                            ? 'border-sky-500 bg-sky-50 text-sky-700'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {opt.replace('FPS recomendado ', 'FPS ')}
                      </button>
                    ))}
                  </div>
                </div>

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

            <section>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
                Lesiones mapeadas
              </h3>
              <LesionCounters counters={counters} />
            </section>
          </>
        ) : (
          <CuestionarioPielForm
            value={preguntas}
            onSiNoChange={onPreguntaSiNoChange}
            onDetalleChange={onPreguntaDetalleChange}
            onFechaLesionChange={onFechaLesionChange}
            onSiNoSeccion2Change={onSiNoSeccion2Change}
            onDescribaChange={onDescribaChange}
          />
        )}
      </div>

      <div className="sticky bottom-0 pt-4 pb-2 bg-white border-t border-slate-100 mt-4 space-y-2">
        {saveError && (
          <p className="text-xs text-red-500 text-center">{saveError}</p>
        )}
        {saved && (
          <p className="text-xs text-green-600 text-center font-medium">
            Evaluación guardada correctamente
          </p>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!form.fototipo || saving}
          className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-sky-600 text-white hover:bg-sky-700"
        >
          {saving ? 'Guardando…' : 'Guardar Evaluación'}
        </button>
      </div>
    </div>
  );
}
