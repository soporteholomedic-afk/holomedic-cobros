'use client';

import { useEffect, useState, useCallback } from 'react';
import type { AtencionDetalle, JjcEvaluacion, Fototipo, CuestionarioPiel } from '@/types/jjc';
import type { LesionPoint } from '@/types/jjc';
import { useJjcEvaluacion } from '@/features/jjc-mapper/presentation/hooks/useJjcEvaluacion';
import type { FormTab } from './JjcFormTabs';
import { EvaluacionForm } from './EvaluacionForm';
import { FaceScanCanvas } from './FaceScanCanvas';
import { VerticalLesionToolbar } from './VerticalLesionToolbar';

interface JjcFaceLesionMapperProps {
  atencion: AtencionDetalle | null;
}

const EVAL_API = '/api/areas/medicina/jjc/evaluaciones';

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
    setPreguntaSiNo,
    setPreguntaDetalle,
    setFechaLesion,
    setSiNoSeccion2,
    setDescriba,
    setPreguntas,
  } = useJjcEvaluacion();

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(atencion?.idAtencion != null);
  const [activeTab, setActiveTab] = useState<FormTab>('datos');

  // ---- Load existing evaluation on mount ----
  useEffect(() => {
    const idAtencion = atencion?.idAtencion;
    if (!idAtencion) return;

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${EVAL_API}?idAtencion=${encodeURIComponent(idAtencion!)}`);
        if (cancelled) return;

        if (res.status === 200) {
          const body: { data: JjcEvaluacion } = await res.json();
          if (cancelled) return;
          populateFromEvaluation(body.data, reset, setFecha, setFototipo, setObservaciones, addPoint, setPreguntas);
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
  }, [atencion?.idAtencion, reset, setFecha, setFototipo, setObservaciones, addPoint, setPreguntas]);

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
          preguntas: state.preguntas,
        }),
      });

      if (res.ok) {
        setSaveError(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
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
    <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6 h-full items-start">
      {/* Left: Face canvas with vertical toolbar to its right */}
      <div className="flex gap-3">
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
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Cargando evaluación…</p>
        ) : (
          <EvaluacionForm
            atencion={atencion}
            form={state.form}
            counters={counters}
            preguntas={state.preguntas}
            activeTab={activeTab}
            onFototipoChange={setFototipo}
            onFechaChange={setFecha}
            onObservacionesChange={setObservaciones}
            onTabChange={setActiveTab}
            onPreguntaSiNoChange={setPreguntaSiNo}
            onPreguntaDetalleChange={setPreguntaDetalle}
            onFechaLesionChange={setFechaLesion}
            onSiNoSeccion2Change={setSiNoSeccion2}
            onDescribaChange={setDescriba}
            onSave={handleSave}
            saving={saving}
            saved={saved}
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
  setPreguntas: (p: CuestionarioPiel) => void,
): void {
  reset();
  setFecha(evalData.fechaEvaluacion);
  setFototipo(evalData.fototipo);
  setObservaciones(evalData.observaciones);
  for (const p of evalData.lesiones) {
    addPoint(p);
  }
  if (evalData.preguntas) {
    setPreguntas(evalData.preguntas);
  }
}
