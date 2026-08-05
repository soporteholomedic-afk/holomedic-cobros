'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { AtencionDetalle } from '@/types/jjc';
import {
  useEvaluacionOsteomuscular,
  type UseEvaluacionOsteomuscularResult,
} from '@/features/evaluacion-osteomuscular/presentation/hooks/useEvaluacionOsteomuscular';

interface EvaluacionOsteomuscularContextValue extends UseEvaluacionOsteomuscularResult {
  idAtencion: string;
  atencion: AtencionDetalle;
  saving: boolean;
  saveError: string | null;
  save: () => Promise<boolean>;
}

const EvaluacionOsteomuscularContext = createContext<EvaluacionOsteomuscularContextValue | null>(
  null,
);

interface EvaluacionOsteomuscularProviderProps {
  idAtencion: string;
  atencion: AtencionDetalle;
  children: ReactNode;
}

const EVALUACION_API_PATH = '/api/areas/musculoesqueletica/jjc/evaluacion';

export function EvaluacionOsteomuscularProvider({
  idAtencion,
  atencion,
  children,
}: EvaluacionOsteomuscularProviderProps) {
  const hook = useEvaluacionOsteomuscular(atencion);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadUrl = `${EVALUACION_API_PATH}?idAtencion=${encodeURIComponent(idAtencion)}`;
  const { hydrate } = hook;

  // Hydrate the form with the stored evaluation (if any) on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(loadUrl);
        if (!res.ok) return;
        const json = (await res.json()) as { data?: unknown };
        if (!cancelled && json.data) hydrate(json.data);
      } catch {
        // Red no disponible: se mantiene el estado inicial en memoria.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadUrl, hydrate]);

  const { state: evaluacionState, markSaved } = hook;

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(EVALUACION_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAtencion, evaluacion: evaluacionState }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setSaveError(json?.error ?? 'Error al guardar la evaluación');
        return false;
      }
      markSaved();
      return true;
    } catch {
      setSaveError('No se pudo conectar con el servidor');
      return false;
    } finally {
      setSaving(false);
    }
  }, [idAtencion, evaluacionState, markSaved]);

  return (
    <EvaluacionOsteomuscularContext.Provider
      value={{ idAtencion, atencion, saving, saveError, save, ...hook }}
    >
      {children}
    </EvaluacionOsteomuscularContext.Provider>
  );
}

export function useEvaluacionContext(): EvaluacionOsteomuscularContextValue {
  const ctx = useContext(EvaluacionOsteomuscularContext);
  if (!ctx) {
    throw new Error(
      'useEvaluacionContext must be used within EvaluacionOsteomuscularProvider',
    );
  }
  return ctx;
}
