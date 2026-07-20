'use client';

import { useEffect, useState, useCallback } from 'react';
import type { AtencionDetalle, JjcEvaluacion, Fototipo } from '@/types/jjc';
import type { LesionPoint } from '@/types/jjc';
import { useJjcEvaluacion } from '@/features/jjc-mapper/presentation/hooks/useJjcEvaluacion';
import { EvaluacionForm } from './EvaluacionForm';
import { FaceScanCanvas } from './FaceScanCanvas';
import { VerticalLesionToolbar } from './VerticalLesionToolbar';

interface JjcFaceLesionMapperProps {
  atencion: AtencionDetalle | null;
}

const EVAL_API = '/api/areas/medicina/jjc/evaluaciones';

/**
 * Top-level client shell for the JJC face-lesion mapper page.
 *
 * Two-column layout:
 * - **Left**: Face canvas (FaceScanCanvas with SVG overlay + VerticalLesionToolbar).
 * - **Right**: EvaluacionForm (patient fields, fototipo, counters).
 *
 * All state is lifted to `useJjcEvaluacion` (single hook, reducer-based).
 * On mount, loads existing evaluation from the API if one exists.
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
    reset,
  } = useJjcEvaluacion();

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ---- Load existing evaluation on mount ----
  useEffect(() => {
    const idAtencion = atencion?.idAtencion;
    if (!idAtencion) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${EVAL_API}?idAtencion=${encodeURIComponent(idAtencion!)}`);
        if (cancelled) return;

        if (res.status === 200) {
          const body: { data: JjcEvaluacion } = await res.json();
          if (cancelled) return;
          populateFromEvaluation(body.data, reset, setFecha, setFototipo, setObservaciones, addPoint);
        }
        // 404 = no saved evaluation yet — keep default empty state
      } catch {
        // Network error — just keep default empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [atencion?.idAtencion, reset, setFecha, setFototipo, setObservaciones, addPoint]);

  // ---- Save handler ----
  const handleSave = useCallback(async () => {
    const idAtencion = atencion?.idAtencion;
    if (!idAtencion) {
      setSaveError('No se puede guardar sin una atención activa');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(EVAL_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idAtencion,
          fechaEvaluacion: state.form.fechaEvaluacion,
          fototipo: state.form.fototipo,
          observaciones: state.form.observaciones,
          lesiones: state.points,
        }),
      });

      if (res.ok) {
        setSaveError(null);
      } else {
        const body: { error?: string } = await res.json();
        setSaveError(body.error ?? 'Error al guardar la evaluación');
      }
    } catch {
      setSaveError('Error de red al guardar la evaluación');
    } finally {
      setSaving(false);
    }
  }, [atencion?.idAtencion, state.form, state.points]);

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
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Cargando evaluación…</p>
        ) : (
          <EvaluacionForm
            atencion={atencion}
            form={state.form}
            counters={counters}
            onFototipoChange={setFototipo}
            onFechaChange={setFecha}
            onObservacionesChange={setObservaciones}
            onSave={handleSave}
            saving={saving}
            saveError={saveError}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Populate form state and points from a loaded JjcEvaluacion.
 * Calls the dispatch functions one by one to keep the reducer consistent.
 */
function populateFromEvaluation(
  evalData: JjcEvaluacion,
  reset: () => void,
  setFecha: (f: string) => void,
  setFototipo: (f: Fototipo) => void,
  setObservaciones: (t: string) => void,
  addPoint: (p: LesionPoint) => void,
): void {
  reset();
  setFecha(evalData.fechaEvaluacion);
  setFototipo(evalData.fototipo);
  setObservaciones(evalData.observaciones);
  for (const p of evalData.lesiones) {
    addPoint(p);
  }
}
