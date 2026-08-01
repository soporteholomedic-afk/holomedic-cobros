'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AtencionDetalle } from '@/types/jjc';
import {
  useEvaluacionOsteomuscular,
  type UseEvaluacionOsteomuscularResult,
} from '@/features/evaluacion-osteomuscular/presentation/hooks/useEvaluacionOsteomuscular';

interface EvaluacionOsteomuscularContextValue extends UseEvaluacionOsteomuscularResult {
  idAtencion: string;
  atencion: AtencionDetalle;
}

const EvaluacionOsteomuscularContext = createContext<EvaluacionOsteomuscularContextValue | null>(
  null,
);

interface EvaluacionOsteomuscularProviderProps {
  idAtencion: string;
  atencion: AtencionDetalle;
  children: ReactNode;
}

export function EvaluacionOsteomuscularProvider({
  idAtencion,
  atencion,
  children,
}: EvaluacionOsteomuscularProviderProps) {
  const hook = useEvaluacionOsteomuscular(atencion);

  return (
    <EvaluacionOsteomuscularContext.Provider value={{ idAtencion, atencion, ...hook }}>
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
