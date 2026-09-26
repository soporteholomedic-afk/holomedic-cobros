import { EVENTOS_RESULTADO, type TipoResultado } from '../domain/maquinaEstados';
import type {
  CrmActividadesRepositoryPort,
  ConteoActividadUsuario,
  ConteoResultadoUsuario,
  CrmResultadosRepositoryPort,
} from '../domain/ports';

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

export type {
  ConteoActividadUsuario,
  ConteoResultadoUsuario,
} from '../domain/ports';

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

/** Use-case input: the validated period + the session's resolved identity. */
export interface EntradaProductividad {
  /** Inclusive window start, 'YYYY-MM-DD' (route-validated). */
  desde: string;
  /** Inclusive window end, 'YYYY-MM-DD' (route-validated). */
  hasta: string;
  /** Session user's login name (resolved from sub by the route). */
  usuario: string;
  /** `crm_admin` session — the only identity allowed to read all users. */
  esAdmin: boolean;
}

/**
 * ListarProductividadUseCase (tasks pr16/WU2, spec G6 "Productivity
 * visibility") — the own-vs-all scoping POLICY lives here, in the
 * application layer, mirroring the cartera decision:
 *
 * - A plain `crm` holder (esAdmin false) is ALWAYS counted with the
 *   resolved login-name filter — user A never sees user B's numbers,
 *   and the API exposes no parameter that could widen the scope.
 * - A `crm_admin` reads every user's counts (the admin dashboard
 *   scenario: per-user activity and result counts for the period).
 *
 * `usuario` is the session's LOGIN NAME (dbo.usuarios.usuario — the
 * column CRM_Actividades/CRM_Resultados store). Resolving sub →
 * usuario is the CALLER's (route) job, per the pr15 canonical
 * identity resolution. The period travels verbatim: validation is the
 * route's inbound-adapter job; this use case owns no date math.
 */
export class ListarProductividadUseCase {
  constructor(
    private readonly actividades: Pick<
      CrmActividadesRepositoryPort,
      'contarActividadesPorUsuario'
    >,
    private readonly resultados: Pick<
      CrmResultadosRepositoryPort,
      'contarResultadosPorUsuario'
    >,
  ) {}

  async execute(entrada: EntradaProductividad): Promise<FilaProductividad[]> {
    const filtroUsuario = entrada.esAdmin ? undefined : entrada.usuario;
    const [conteosActividades, conteosResultados] = await Promise.all([
      this.actividades.contarActividadesPorUsuario(entrada.desde, entrada.hasta, filtroUsuario),
      this.resultados.contarResultadosPorUsuario(entrada.desde, entrada.hasta, filtroUsuario),
    ]);
    return agregarProductividad(conteosActividades, conteosResultados);
  }
}
