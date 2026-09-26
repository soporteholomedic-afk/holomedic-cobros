'use client';

import { useCallback, useState } from 'react';

import type { AccionAsignacion } from '../../domain/entities';

/**
 * useAsignarEmpresa — client hook behind the Cola de hoy self-claim
 * (crm-ux redesign): POSTs `/api/crm/empresas/[id]/asignar` with the
 * session user as the responsable. The API's self-claim guard is the
 * security boundary (pool empresas only); this hook just carries the
 * request and maps the typed error body to a Spanish operator message
 * (useCrearEmpresa mutation model: a discriminated result, never a
 * thrown promise).
 */

/** Single source of the request URL for both hook and tests. */
export function buildAsignarPath(empresaId: number): string {
  return `/api/crm/empresas/${empresaId}/asignar`;
}

export type ResultadoAsignarUi =
  | { ok: true; accion: AccionAsignacion; responsable: string }
  | { ok: false; accion: null; error: string };

interface ApiErrorBody {
  error?: unknown;
}

/** Pure — typed error message verbatim (Spanish per repo convention), HTTP fallback. */
export function mapearErrorAsignacion(json: unknown, status: number): string {
  const body = (typeof json === 'object' && json !== null ? json : {}) as ApiErrorBody;
  if (typeof body.error === 'string' && body.error !== '') return body.error;
  return `HTTP ${status}`;
}

export function useAsignarEmpresa(): {
  asignar: (empresaId: number, responsable: string) => Promise<ResultadoAsignarUi>;
  enCurso: boolean;
} {
  const [enCurso, setEnCurso] = useState(false);

  const asignar = useCallback(
    async (empresaId: number, responsable: string): Promise<ResultadoAsignarUi> => {
      setEnCurso(true);
      try {
        const response = await fetch(buildAsignarPath(empresaId), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ responsable }),
        });
        const json: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
          return { ok: false, accion: null, error: mapearErrorAsignacion(json, response.status) };
        }
        const body = (typeof json === 'object' && json !== null ? json : {}) as {
          success?: unknown;
          accion?: unknown;
          responsable?: unknown;
        };
        if (
          body.success !== true ||
          (body.accion !== 'ASIGNADO' && body.accion !== 'REASIGNADO') ||
          typeof body.responsable !== 'string'
        ) {
          return { ok: false, accion: null, error: 'Respuesta inesperada del servidor' };
        }
        return { ok: true, accion: body.accion, responsable: body.responsable };
      } catch (err: unknown) {
        return {
          ok: false,
          accion: null,
          error: err instanceof Error ? err.message : 'Error de red',
        };
      } finally {
        setEnCurso(false);
      }
    },
    [],
  );

  return { asignar, enCurso };
}
