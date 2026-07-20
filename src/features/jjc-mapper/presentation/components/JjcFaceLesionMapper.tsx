'use client';

import type { AtencionDetalle } from '@/types/jjc';
import { useJjcEvaluacion } from '@/features/jjc-mapper/presentation/hooks/useJjcEvaluacion';
import { EvaluacionForm } from './EvaluacionForm';
import { FaceScanCanvas } from './FaceScanCanvas';
import { VerticalLesionToolbar } from './VerticalLesionToolbar';

interface JjcFaceLesionMapperProps {
  atencion: AtencionDetalle | null;
}

/**
 * Top-level client shell for the JJC face-lesion mapper page.
 *
 * Two-column layout:
 * - **Left**: Face canvas (FaceScanCanvas with SVG overlay + VerticalLesionToolbar).
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
    setActiveTool,
    addPoint,
    removePoint,
  } = useJjcEvaluacion();

  return (
    <div className="flex gap-6 h-full">
      {/* Left: Face canvas with vertical toolbar to its right */}
      <div className="flex gap-3 flex-shrink-0">
        <FaceScanCanvas
          points={state.points}
          activeTool={state.activeTool}
          onAddPoint={addPoint}
          onRemovePoint={removePoint}
        />
        <VerticalLesionToolbar
          activeTool={state.activeTool}
          onToolChange={setActiveTool}
        />
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
