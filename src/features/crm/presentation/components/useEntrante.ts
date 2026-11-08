'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { Empresa, Oportunidad } from '../../domain/entities';

const FALLO = 'No se pudo guardar el contacto';

export interface EntranteGuardado {
  empresa: Empresa;
  /** The primera oportunidad the inbound contact created (spec S4). */
  oportunidad: Oportunidad;
  /** `true` when the ficha already existed and only the deal is new. */
  existente: boolean;
}

const esEmpresa = (v: unknown): v is Empresa =>
  typeof v === 'object' && v !== null && typeof (v as { idEmpresa?: unknown }).idEmpresa === 'string';

const esOportunidad = (v: unknown): v is Oportunidad =>
  typeof v === 'object' && v !== null && typeof (v as { idOportunidad?: unknown }).idOportunidad === 'string';

/** POST an inbound contact to the CRM API; the answer names the ficha, its new deal and whether the ficha existed. */
async function registrarEntrante(cuerpo: unknown): Promise<EntranteGuardado | { error: string }> {
  try {
    const res = await fetch('/api/crm/entrantes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    let datos: { error?: unknown; empresa?: unknown; oportunidad?: unknown; existente?: unknown } = {};
    try {
      datos = await res.json();
    } catch {
      // body is not JSON: fall through with the generic error
    }
    if (res.ok && esEmpresa(datos.empresa) && esOportunidad(datos.oportunidad)) {
      return { empresa: datos.empresa, oportunidad: datos.oportunidad, existente: datos.existente === true };
    }
    return { error: typeof datos.error === 'string' && datos.error ? datos.error : FALLO };
  } catch {
    return { error: FALLO };
  }
}

/**
 * Registers an inbound contact (`POST /api/crm/entrantes`). Resolves to the
 * saved {empresa, oportunidad, existente}, or `null` after showing the error
 * as a toast.
 */
export function useEntrante() {
  const [guardando, setGuardando] = useState(false);
  const enCurso = useRef(false);

  const registrar = useCallback(async (cuerpo: Record<string, unknown>): Promise<EntranteGuardado | null> => {
    if (enCurso.current) return null;
    enCurso.current = true;
    setGuardando(true);
    const r = await registrarEntrante(cuerpo);
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
