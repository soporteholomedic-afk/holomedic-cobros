import { EVENTOS_RESULTADO, type TipoResultado } from '../domain/maquinaEstados';

/**
 * Productivity read model (tasks pr16/WU1+WU2, spec G6
 * "Productivity = activities + results"): per-user counts over a
 * from/to period. The SQL adapters produce the raw count rows (the
 * IX(usuario, fecha DESC) indexes on CRM_Actividades and
 * CRM_Resultados back both scans); `agregarProductividad` merges them
 * into the summary rows the API returns and the UI/Excel export
 * render. NO weights in v1 (design D4) — plain per-type counts.
 *
 * Scoping POLICY (who sees own vs all users) lives in
 * `ListarProductividadUseCase` — never in the client.
 */

/** One CRM_Actividades GROUP BY usuario row (adapter read shape). */
export interface ConteoActividadUsuario {
  usuario: string;
  total: number;
}

/** One CRM_Resultados GROUP BY usuario, tipo row (adapter read shape). */
export interface ConteoResultadoUsuario {
  usuario: string;
  tipo: TipoResultado;
  total: number;
}

/** One productivity summary row: both counts + the per-event breakdown. */
export interface FilaProductividad {
  usuario: string;
  /** CRM_Actividades rows in the period (any tipo). */
  actividades: number;
  /** CRM_Resultados rows in the period (the D4 6-event catalog). */
  resultados: number;
  /** Zero-filled per-event breakdown, keyed by the D4 catalog. */
  porEvento: Record<TipoResultado, number>;
}

function porEventoVacio(): Record<TipoResultado, number> {
  return Object.fromEntries(EVENTOS_RESULTADO.map((evento) => [evento, 0])) as Record<
    TipoResultado,
    number
  >;
}

/**
 * Merge the two count streams into per-user summary rows, sorted by
 * usuario ascending (deterministic order for the UI table and the
 * pr17 Excel export). Pure — no clock, no I/O.
 */
export function agregarProductividad(
  actividades: readonly ConteoActividadUsuario[],
  resultados: readonly ConteoResultadoUsuario[],
): FilaProductividad[] {
  const porUsuario = new Map<string, FilaProductividad>();

  const filaDe = (usuario: string): FilaProductividad => {
    const existente = porUsuario.get(usuario);
    if (existente) return existente;
    const fila: FilaProductividad = {
      usuario,
      actividades: 0,
      resultados: 0,
      porEvento: porEventoVacio(),
    };
    porUsuario.set(usuario, fila);
    return fila;
  };

  for (const conteo of actividades) {
    filaDe(conteo.usuario).actividades += conteo.total;
  }
  for (const conteo of resultados) {
    const fila = filaDe(conteo.usuario);
    fila.resultados += conteo.total;
    fila.porEvento[conteo.tipo] += conteo.total;
  }

  return [...porUsuario.values()].sort((a, b) => a.usuario.localeCompare(b.usuario));
}
