'use client';

import { useEffect, useState } from 'react';

import type { Interaccion } from '../../domain/entities';

export type EstadoHistorial =
  | { estado: 'cargando' }
  | { estado: 'error' }
  | { estado: 'listo'; interacciones: Interaccion[] };

interface Resultado {
  /** Request this result answers, so a stale one is never shown for a newer request. */
  clave: string;
  datos: Interaccion[] | null;
}

/**
 * Contact history of one empresa, newest first (spec S1). It loads on mount and
 * again whenever `version` (the empresa's `updatedAt`) changes or `reintentar`
 * is called.
 */
export function useHistorial(idEmpresa: string, version: string): EstadoHistorial & { reintentar: () => void } {
  const [intento, setIntento] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const clave = `${idEmpresa}|${version}|${intento}`;

  useEffect(() => {
    let cancelado = false;
    (async () => {
      let datos: Interaccion[] | null = null;
      try {
        const res = await fetch(`/api/crm/empresas/${idEmpresa}/historial`);
        if (res.ok) {
          const cuerpo = (await res.json()) as { interacciones?: unknown };
          if (Array.isArray(cuerpo.interacciones)) datos = cuerpo.interacciones as Interaccion[];
        }
      } catch {
        // network or JSON failure: the error state offers a retry
      }
      if (!cancelado) setResultado({ clave, datos });
    })();
    return () => {
      cancelado = true;
    };
  }, [idEmpresa, clave]);

  const reintentar = () => setIntento((n) => n + 1);
  if (!resultado || resultado.clave !== clave) return { estado: 'cargando', reintentar };
  if (!resultado.datos) return { estado: 'error', reintentar };
  return { estado: 'listo', interacciones: resultado.datos, reintentar };
}
