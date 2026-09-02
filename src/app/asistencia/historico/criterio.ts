import type { CriterioBusqueda } from '@/features/asistencia-rrhh/application/buscarMarcacionesRaw';

/**
 * searchParams → domain criterion for `/asistencia/historico`
 * (REQ-F1-12). Pure and testable — Server Components don't render in
 * the test environment, so the page stays a thin wrapper (plantillas
 * resolver precedent). Defaults: today → today. Unparseable values fall
 * back to the defaults; the use case still validates the final range.
 */

export interface SearchParamsHistorico {
  empleado?: string;
  userId?: string;
  desde?: string;
  hasta?: string;
}

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaHoyNaiva(): string {
  const ahora = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
}

export function normalizarCriterioHistorico(
  params: SearchParamsHistorico,
  hoy: string = fechaHoyNaiva(),
): CriterioBusqueda {
  const desde =
    params.desde !== undefined && PATRON_FECHA.test(params.desde) ? params.desde : hoy;
  const hasta =
    params.hasta !== undefined && PATRON_FECHA.test(params.hasta) ? params.hasta : hoy;

  const empleado = params.empleado !== undefined && /^\d+$/.test(params.empleado)
    ? Number(params.empleado)
    : undefined;
  const userId = params.userId !== undefined && params.userId.trim() !== '' ? params.userId.trim() : undefined;

  return {
    empleadoId: empleado,
    userId,
    desde: desde <= hasta ? desde : hasta,
    hasta: desde <= hasta ? hasta : desde,
  };
}
