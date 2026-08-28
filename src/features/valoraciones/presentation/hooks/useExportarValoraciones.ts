'use client';

import { useCallback, useState } from 'react';

import type { ValoracionesFilter } from '../../domain/entities';

/**
 * `useExportarValoraciones` — triggers the server-side PDF/Excel exports
 * (REQ-03 E-R1/E-R3, slice 2; U6 per-empresa scope). POSTs the CURRENT
 * filter DTO plus the row's empresa group key to the export route (design
 * D4: the server re-queries from the filter and scopes to that empresa —
 * rows never travel from the client) and streams the response into a blob
 * download named by the server's `Content-Disposition`
 * (`[NombreEmpresa]_[fecIni].[ext]` when empresa-scoped).
 *
 * U7: the in-flight state is scoped to the ONE empresa being exported —
 * `empresaEnCurso` holds its group key (or `'__global__'` for a
 * filter-only export) so only the clicked row shows a spinner.
 *
 * `toFiltro` output is directly postable; the hook stays type-simple on
 * purpose (no label fields needed by the exports).
 */
export type TipoExportacion = 'pdf' | 'excel';

export interface UseExportarValoracionesResult {
  exportar: (filtro: ValoracionesFilter, empresa?: string) => void;
  /** Empresa group key in flight, `'__global__'` for a filter-only export, `null` when idle. */
  empresaEnCurso: string | null;
  /** True while `empresa` is exporting (any export when `empresa` is omitted). */
  estaExportando: (empresa?: string) => boolean;
  error: string | null;
}

/** Extract `filename=` from a Content-Disposition header (fallback: tipo). */
function nombreDesdeDisposition(disposition: string | null, tipo: TipoExportacion): string {
  if (disposition) {
    const match = disposition.match(/filename="?([^";]+)"?/i);
    if (match?.[1]) return match[1];
  }
  return `valoraciones.${tipo === 'pdf' ? 'pdf' : 'xlsx'}`;
}

export function useExportarValoraciones(
  tipo: TipoExportacion,
): UseExportarValoracionesResult {
  const [empresaEnCurso, setEmpresaEnCurso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportar = useCallback(
    (filtro: ValoracionesFilter, empresa?: string): void => {
      // U7: track WHICH export is in flight (row key or '__global__').
      setEmpresaEnCurso(empresa ?? '__global__');
      setError(null);

      void (async () => {
        try {
          const res = await fetch(`/api/valoraciones/${tipo}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(empresa === undefined ? filtro : { ...filtro, empresa }),
          });

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
          anchor.download = nombreDesdeDisposition(
            res.headers.get('content-disposition'),
            tipo,
          );
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        } catch {
          setError('Error de conexión al exportar');
        } finally {
          setEmpresaEnCurso(null);
        }
      })();
    },
    [tipo],
  );

  const estaExportando = useCallback(
    (empresa?: string): boolean =>
      empresa === undefined ? empresaEnCurso !== null : empresaEnCurso === empresa,
    [empresaEnCurso],
  );

  return { exportar, empresaEnCurso, estaExportando, error };
}
