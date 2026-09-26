'use client';

import { useCallback, useState } from 'react';

import type { Periodo } from '../periodo';

/**
 * useExportarProductividad — drives the "Exportar Excel" button on
 * `/crm/productividad` (tasks pr17/WU2, spec G6 "exportar Excel",
 * useExportarValoraciones precedent). GETs the export endpoint for the
 * CURRENT period (the own-vs-all SCOPE is the server's decision — the
 * hook carries no scope parameter) and streams the response into a
 * blob download named by the server's Content-Disposition
 * (`productividad_<desde>_<hasta>.xlsx`).
 *
 * Status: `exportando` is true only while the request is in flight
 * (the button disables itself); API errors surface verbatim in
 * Spanish, network failures as a user-safe generic message.
 */

/** Pure — the single source of the request URL for both hook and tests. */
export function buildProductividadExcelPath(desde: string, hasta: string): string {
  return `/api/crm/productividad/excel?desde=${desde}&hasta=${hasta}`;
}

export interface UseExportarProductividadResult {
  exportar: (periodo: Periodo) => void;
  exportando: boolean;
  error: string | null;
}

/** Extract `filename=` from a Content-Disposition header (fallback name). */
function nombreDesdeDisposition(disposition: string | null): string {
  if (disposition) {
    const match = disposition.match(/filename="?([^";]+)"?/i);
    if (match?.[1]) return match[1];
  }
  return 'productividad.xlsx';
}

export function useExportarProductividad(): UseExportarProductividadResult {
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportar = useCallback((periodo: Periodo): void => {
    setExportando(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(
          buildProductividadExcelPath(periodo.desde, periodo.hasta),
          { method: 'GET' },
        );

        if (!res.ok) {
          const json: unknown = await res.json().catch(() => ({}));
          const apiError = (json as { error?: unknown }).error;
          setError(
            typeof apiError === 'string' ? apiError : `Error del servidor (${res.status})`,
          );
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = nombreDesdeDisposition(res.headers.get('content-disposition'));
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch {
        setError('Error de conexión al exportar');
      } finally {
        setExportando(false);
      }
    })();
  }, []);

  return { exportar, exportando, error };
}
