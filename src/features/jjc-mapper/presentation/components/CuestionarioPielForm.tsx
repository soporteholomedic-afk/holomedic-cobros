'use client';

import type { CuestionarioPiel, SiNo, PreguntaBase } from '@/types/jjc';
import type { PreguntaSeccion1 } from '@/features/jjc-mapper/presentation/hooks/useJjcEvaluacion';
import { SiNoToggle } from './SiNoToggle';

interface CuestionarioPielFormProps {
  value: CuestionarioPiel;
  onSiNoChange: (key: PreguntaSeccion1, value: SiNo | null) => void;
  onDetalleChange: (key: PreguntaSeccion1, value: string) => void;
  onFechaLesionChange: (value: string) => void;
  onSiNoSeccion2Change: (key: 'lesionDermatopatia' | 'evaluacionDermatologo', value: SiNo | null) => void;
  onDescribaChange: (value: string) => void;
}

const PREGUNTAS: Array<{
  key: PreguntaSeccion1;
  label: string;
  detalleLabel?: string;
  showDate?: boolean;
}> = [
  { key: 'sufreEnfermedadesPiel', label: 'Sufre Ud. enfermedades de la piel', detalleLabel: '¿Qué diagnóstico tiene?' },
  { key: 'tieneLesionActual', label: 'Actualmente tiene alguna lesión (ampolla, escamas, rascado) en la piel', detalleLabel: '¿Dónde se localiza?', showDate: true },
  { key: 'cambioColoracion', label: 'Presenta algún cambio de coloración en la piel' },
  { key: 'lesionesRepiten', label: 'Estas lesiones se repiten varias veces al año' },
  { key: 'enrojecimiento', label: '¿Ud. Tiene enrojecimiento de alguna zona del cuerpo?', detalleLabel: '¿Dónde se localiza?' },
  { key: 'comezon', label: 'Tiene comezón', detalleLabel: '¿Dónde se localiza?' },
  { key: 'hinchazon', label: 'Presenta hinchazón en parte de su cuerpo', detalleLabel: '¿Dónde se localiza?' },
  { key: 'rinitisAsma', label: 'Sufre de Rinitis Alérgica o ASMA' },
  { key: 'usaEPP', label: 'Usa EPP', detalleLabel: 'Tipo de protección que usa' },
  { key: 'cambiosUnas', label: 'Presenta cambios en las uñas' },
  { key: 'tomaMedicacion', label: 'Está tomando alguna medicación' },
];

export function CuestionarioPielForm({
  value,
  onSiNoChange,
  onDetalleChange,
  onFechaLesionChange,
  onSiNoSeccion2Change,
  onDescribaChange,
}: CuestionarioPielFormProps) {
  return (
    <div className="space-y-6">
      {/* Sección 1 — Antecedentes dermatológicos */}
      <section>
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
          Antecedentes dermatológicos
        </h3>

        <div className="space-y-5">
          {PREGUNTAS.map(({ key, label, detalleLabel, showDate }) => {
            const pregunta = value[key] as PreguntaBase;
            const isSi = pregunta.respuesta === 'si';
            return (
              <div key={key}>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-slate-700 pt-1">{label}</span>
                  <SiNoToggle
                    value={pregunta.respuesta}
                    onChange={(v) => onSiNoChange(key, v)}
                  />
                </div>
                {isSi && detalleLabel && (
                  <div className="mt-2 ml-4 space-y-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {detalleLabel}
                    </label>
                    <input
                      type="text"
                      value={pregunta.detalle}
                      onChange={(e) => onDetalleChange(key, e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
                    />
                  </div>
                )}
                {isSi && showDate && (
                  <div className="mt-2 ml-4 space-y-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      ¿Desde cuándo tiene la lesión?
                    </label>
                    <input
                      type="date"
                      value={value.tieneLesionActual.fecha}
                      onChange={(e) => onFechaLesionChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Describa — cuadro compartido */}
        <div className="mt-6 space-y-2">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Describa en caso de respuesta positiva
          </label>
          <textarea
            value={value.describaPositivo}
            onChange={(e) => onDescribaChange(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700 resize-none"
            placeholder="Detalles adicionales..."
          />
        </div>
      </section>

      {/* Sección 2 — Evaluación clínica */}
      <section>
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
          Evaluación clínica
        </h3>

        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <span className="text-sm text-slate-700 pt-1">
              El paciente al examen físico presenta alguna lesión sugerente a Dermatopatía
            </span>
            <SiNoToggle
              value={value.lesionDermatopatia}
              onChange={(v) => onSiNoSeccion2Change('lesionDermatopatia', v)}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <span className="text-sm text-slate-700 pt-1">
              El paciente necesita ser evaluado por médico dermatólogo para la realización de las siguientes
              pruebas: Pruebas de sensibilidad mucocutánea, Luz de Wood y Maniobra de Nikolsky
            </span>
            <SiNoToggle
              value={value.evaluacionDermatologo}
              onChange={(v) => onSiNoSeccion2Change('evaluacionDermatologo', v)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
