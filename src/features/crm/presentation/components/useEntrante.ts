'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { Empresa } from '../../domain/entities';
import { enviarContacto } from './useRegistrarContacto';

/**
 * Registers an inbound contact (`POST /api/crm/entrantes`). Resolves to the
 * empresa the server left and whether it already existed, or `null` after
 * showing the error as a toast.
 */
export function useEntrante() {
  const [guardando, setGuardando] = useState(false);
  const enCurso = useRef(false);

  const registrar = useCallback(async (cuerpo: Record<string, unknown>): Promise<{ empresa: Empresa; existente: boolean } | null> => {
    if (enCurso.current) return null;
    enCurso.current = true;
    setGuardando(true);
    const r = await enviarContacto('/api/crm/entrantes', cuerpo);
    enCurso.current = false;
    setGuardando(false);
    if ('error' in r) {
      toast.error(r.error);
      return null;
    }
    return r;
  }, []);

  return { guardando, registrar };
}
