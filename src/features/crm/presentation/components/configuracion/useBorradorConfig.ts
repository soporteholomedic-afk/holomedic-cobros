'use client';

import { useCallback, useState } from 'react';

/**
 * useBorradorConfig (agente-ia-crm E5·T6) — form draft over a server
 * `base`: the value shown is the draft when the operator typed one,
 * otherwise the server's. A field is "sucio" only when its draft
 * differs from the base, so the save button stays disabled while the
 * form is pristine. `reiniciar()` drops all drafts (after a save the
 * server's answer becomes the new base).
 */

export interface BorradorConfig<C extends string> {
  valor: (campo: C) => string;
  cambiar: (campo: C, valor: string) => void;
  sucios: C[];
  reiniciar: () => void;
}

export function useBorradorConfig<C extends string>(
  base: Record<C, string>,
  campos: readonly C[],
): BorradorConfig<C> {
  const [borrador, setBorrador] = useState<Partial<Record<C, string>>>({});

  const valor = useCallback((campo: C): string => borrador[campo] ?? base[campo], [borrador, base]);

  const cambiar = useCallback((campo: C, nuevo: string): void => {
    setBorrador((previo) => ({ ...previo, [campo]: nuevo }));
  }, []);

  const reiniciar = useCallback((): void => {
    setBorrador({});
  }, []);

  const sucios = campos.filter((campo) => borrador[campo] !== undefined && borrador[campo] !== base[campo]);

  return { valor, cambiar, sucios, reiniciar };
}
