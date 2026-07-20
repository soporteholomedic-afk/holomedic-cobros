'use client';

import type { AtencionDetalle } from '@/types/jjc';
import { useJjcEvaluacion } from '@/features/jjc-mapper/presentation/hooks/useJjcEvaluacion';
import { EvaluacionForm } from './EvaluacionForm';

interface JjcFaceLesionMapperProps {
  atencion: AtencionDetalle | null;
}

/**
 * Top-level client shell for the JJC face-lesion mapper page.
 *
 * Two-column layout:
 * - **Left**: Face canvas area (placeholder for PR2 — renders a
 *   bordered box with a "Rostro" label).
 * - **Right**: EvaluacionForm (patient fields, fototipo, counters).
 *
 * All state is lifted to `useJjcEvaluacion` (single hook, reducer-based).
 */
export function JjcFaceLesionMapper({ atencion }: JjcFaceLesionMapperProps) {
  const {
    state,
    counters,
    setFecha,
    setFototipo,
    setObservaciones,
  } = useJjcEvaluacion();

  return (
    <div className="flex gap-6 h-full">
      {/* Left: Face canvas placeholder (PR2 implements the SVG overlay) */}
      <div className="w-[400px] flex-shrink-0">
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center h-[500px]">
          <span className="text-slate-400 text-sm font-medium">
            Rostro — disponible próximamente
          </span>
        </div>
      </div>

      {/* Right: Evaluation form */}
      <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 p-6">
        <EvaluacionForm
          atencion={atencion}
          form={state.form}
          counters={counters}
          onFototipoChange={setFototipo}
          onFechaChange={setFecha}
          onObservacionesChange={setObservaciones}
        />
      </div>
    </div>
  );
}
