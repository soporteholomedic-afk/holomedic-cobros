'use client';

import { useCallback, useEffect, useState } from 'react';

import type { AlertaCrm, ResumenAlertas } from '../../application/calcularAlertas';

export interface DatosAlertas {
  alertas: AlertaCrm[];
  resumen: ResumenAlertas;
}

interface EstadoHook {
  datos: DatosAlertas | null;
  error: boolean;
  /** Refetch on demand (the retry button; `reloadKey` covers board changes). */
  recargar: () => void;
}

/**
 * Pending CRM alerts for the "Tu día" panel: fetches /api/crm/alertas on
 * mount, whenever the board reloads (`reloadKey` bumps after every
 * mutation) or on explicit retry. `datos` stays null until the first good
 * answer; a failed fetch surfaces as `error` without discarding old data.
 */
export function useAlertasDia(reloadKey: number): EstadoHook {
  const [datos, setDatos] = useState<DatosAlertas | null>(null);
  const [error, setError] = useState(false);
  const [propioKey, setPropioKey] = useState(0);

  const recargar = useCallback((): void => {
    setError(false);
    setPropioKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let viva = true;
    (async (): Promise<void> => {
      try {
        const res = await fetch('/api/crm/alertas');
        if (!res.ok) throw new Error(`GET /api/crm/alertas → ${res.status}`);
        const body = (await res.json()) as { success?: boolean; alertas?: AlertaCrm[]; resumen?: ResumenAlertas };
        if (!body?.success || !Array.isArray(body.alertas) || !body.resumen) throw new Error('Respuesta inválida');
        if (viva) {
          setDatos({ alertas: body.alertas, resumen: body.resumen });
          setError(false);
        }
      } catch {
        if (viva) setError(true);
      }
    })();
    return () => {
      viva = false;
    };
  }, [reloadKey, propioKey]);

  return { datos, error, recargar };
}
