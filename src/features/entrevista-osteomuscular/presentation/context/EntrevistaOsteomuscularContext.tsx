'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AtencionDetalle } from '@/types/jjc';
import {
  useEntrevistaOsteomuscular,
  type UseEntrevistaOsteomuscularResult,
} from '@/features/entrevista-osteomuscular/presentation/hooks/useEntrevistaOsteomuscular';

interface EntrevistaOsteomuscularContextValue extends UseEntrevistaOsteomuscularResult {
  idAtencion: string;
  atencion: AtencionDetalle;
}

const EntrevistaOsteomuscularContext = createContext<EntrevistaOsteomuscularContextValue | null>(
  null,
);

interface EntrevistaOsteomuscularProviderProps {
  idAtencion: string;
  atencion: AtencionDetalle;
  children: ReactNode;
}

export function EntrevistaOsteomuscularProvider({
  idAtencion,
  atencion,
  children,
}: EntrevistaOsteomuscularProviderProps) {
  const hook = useEntrevistaOsteomuscular(atencion);

  return (
    <EntrevistaOsteomuscularContext.Provider value={{ idAtencion, atencion, ...hook }}>
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
