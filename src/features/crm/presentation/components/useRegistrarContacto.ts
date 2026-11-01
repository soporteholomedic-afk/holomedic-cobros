'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { Empresa } from '../../domain/entities';

const FALLO = 'No se pudo guardar el contacto';

const esEmpresa = (v: unknown): v is Empresa =>
  typeof v === 'object' && v !== null && typeof (v as { idEmpresa?: unknown }).idEmpresa === 'string';

/** POST a contact to the CRM API; the answer is the empresa the server left, or the error to show. */
export async function enviarContacto(
  url: string,
  cuerpo: unknown,
): Promise<{ empresa: Empresa; existente: boolean } | { error: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    let datos: { error?: unknown; empresa?: unknown; existente?: unknown } = {};
    try {
      datos = await res.json();
    } catch {
      // body is not JSON: fall through with the generic error
    }
    if (res.ok && esEmpresa(datos.empresa)) return { empresa: datos.empresa, existente: datos.existente === true };
    return { error: typeof datos.error === 'string' && datos.error ? datos.error : FALLO };
  } catch {
    return { error: FALLO };
  }
}

/**
 * Registers one contact on a card (`POST /api/crm/empresas/[id]/contactos`).
 * Resolves to the updated empresa, or `null` after showing the error as a toast.
 */
export function useRegistrarContacto() {
  const [guardando, setGuardando] = useState(false);
  const enCurso = useRef(false);

  const registrar = useCallback(async (idEmpresa: string, cuerpo: Record<string, unknown>): Promise<Empresa | null> => {
    if (enCurso.current) return null;
    enCurso.current = true;
    setGuardando(true);
    const r = await enviarContacto(`/api/crm/empresas/${idEmpresa}/contactos`, cuerpo);
    enCurso.current = false;
    setGuardando(false);
    if ('error' in r) {
      toast.error(r.error);
      return null;
    }
    return r.empresa;
  }, []);

  return { guardando, registrar };
}
