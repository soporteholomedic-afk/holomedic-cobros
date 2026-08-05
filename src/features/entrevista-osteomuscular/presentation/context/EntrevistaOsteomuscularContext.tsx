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
  useEntrevistaOsteomuscular,
  type UseEntrevistaOsteomuscularResult,
} from '@/features/entrevista-osteomuscular/presentation/hooks/useEntrevistaOsteomuscular';

interface EntrevistaOsteomuscularContextValue extends UseEntrevistaOsteomuscularResult {
  idAtencion: string;
  atencion: AtencionDetalle;
  saving: boolean;
  saveError: string | null;
  save: () => Promise<boolean>;
}

const EntrevistaOsteomuscularContext = createContext<EntrevistaOsteomuscularContextValue | null>(
  null,
);

interface EntrevistaOsteomuscularProviderProps {
  idAtencion: string;
  atencion: AtencionDetalle;
  children: ReactNode;
}

const ENTREVISTA_API_PATH = '/api/areas/musculoesqueletica/jjc/entrevista';

export function EntrevistaOsteomuscularProvider({
  idAtencion,
  atencion,
  children,
}: EntrevistaOsteomuscularProviderProps) {
  const hook = useEntrevistaOsteomuscular(atencion);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadUrl = `${ENTREVISTA_API_PATH}?idAtencion=${encodeURIComponent(idAtencion)}`;
  const { hydrate } = hook;

  // Hydrate the form with the stored interview (if any) on mount.
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

  const { state: entrevistaState, markSaved } = hook;

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(ENTREVISTA_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idAtencion, entrevista: entrevistaState }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setSaveError(json?.error ?? 'Error al guardar la entrevista');
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
  }, [idAtencion, entrevistaState, markSaved]);

  return (
    <EntrevistaOsteomuscularContext.Provider
      value={{ idAtencion, atencion, saving, saveError, save, ...hook }}
    >
      {children}
    </EntrevistaOsteomuscularContext.Provider>
  );
}

export function useEntrevistaContext(): EntrevistaOsteomuscularContextValue {
  const ctx = useContext(EntrevistaOsteomuscularContext);
  if (!ctx) {
    throw new Error(
      'useEntrevistaContext must be used within EntrevistaOsteomuscularProvider',
    );
  }
  return ctx;
}
