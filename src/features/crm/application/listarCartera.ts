import { esReactivable, esReinicioDeCadencia, estaVencidaHoy, fechaHoy, requiereDecision } from '../domain/cadence';
import type { Etapa, Flujo, PipelineEmpresa, TipoEmpresa } from '../domain/entities';
import type { Clock, CrmEmpresaRepositoryPort, CrmPipelineRepositoryPort } from '../domain/ports';

/**
 * ListarCarteraUseCase (tasks pr15/WU1, spec G5 "Cartera views") —
 * the own-vs-all scoping POLICY lives here, in the application layer:
 *
 * - A plain `crm` holder (esAdmin false) is ALWAYS scoped to
 *   `{ responsable: usuario }` — user A never sees user B's empresas,
 *   and a client-sent `verTodas` cannot widen the scope (the flag is
 *   ignored for non-admins).
 * - A `crm_admin` with `verTodas` reads the whole registry (pool
 *   included); without it, their own cartera.
 *
 * `usuario` is the session's LOGIN NAME (dbo.usuarios.usuario — the
 * column CRM_Empresas.responsable stores). The session's `sub` is the
 * opaque idUsuario; resolving it is the CALLER's (route) job — this
 * use case consumes the already-resolved username.
 *
 * The rows are decorated with the pipeline stage and a Spanish
 * "próxima acción" derived ON REQUEST from the pr12 cadence
 * predicates + the injected clock (design §3: zero background jobs).
 * The pipeline read reuses the pr13 covering-index query — one read of
 * every pipeline row mapped by empresaId; empresas without a pipeline
 * row (registration without origen) render `Sin pipeline`.
 */

/** One cartera table row (display projection — no contactos payload). */
export interface FilaCartera {
  empresaId: number;
  ruc: string;
  razonSocial: string;
  tipo: TipoEmpresa;
  /** Current owner (login name); null = unassigned/pool. */
  responsable: string | null;
  /** null = pipeline-less empresa (no origen at registration). */
  flujo: Flujo | null;
  etapa: Etapa | null;
  /** Spanish next action derived from the pr12 predicates. */
  proximaAccion: string;
}

export interface EntradaCartera {
  /** Session user's login name (resolved from sub by the route). */
  usuario: string;
  /** `crm_admin` session — the only identity allowed to widen the scope. */
  esAdmin: boolean;
  /** Admin toggle "Ver todas"; ignored (forced own-only) when !esAdmin. */
  verTodas: boolean;
}

/**
 * Spanish next action for one cartera row (pure: pipeline row +
 * injected hoy). Order mirrors `seccionCola`'s mutually exclusive
 * predicates, then the on-track weekly default.
 */
export function proximaAccion(p: PipelineEmpresa | null, hoy: string): string {
  if (p === null) return 'Sin pipeline';
  if (estaVencidaHoy(p, hoy)) return 'Enviar seguimiento (vencido hoy)';
  if (requiereDecision(p)) return 'Decisión requerida: pasar a Outbound o rechazar';
  if (esReinicioDeCadencia(p, hoy)) return 'Reiniciar cadencia';
  if (esReactivable(p, hoy)) return 'Reactivar';
  if (p.etapa === 'SEGUIMIENTO' || p.etapa === 'CADENCIA') {
    return 'Seguimiento semanal al día';
  }
  return 'Sin acción pendiente';
}

export class ListarCarteraUseCase {
  constructor(
    private readonly empresas: CrmEmpresaRepositoryPort,
    private readonly pipelines: CrmPipelineRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(entrada: EntradaCartera): Promise<FilaCartera[]> {
    const verTodas = entrada.esAdmin && entrada.verTodas;
    const [empresas, candidatos] = await Promise.all([
      verTodas ? this.empresas.listar() : this.empresas.listar({ responsable: entrada.usuario }),
      this.pipelines.listarCandidatosCola(),
    ]);

    const hoy = fechaHoy(this.clock);
    const pipelinePorEmpresa = new Map(candidatos.map((c) => [c.empresaId, c]));

    return empresas.map((empresa) => {
      const pipeline = pipelinePorEmpresa.get(empresa.id) ?? null;
      return {
        empresaId: empresa.id,
        ruc: empresa.ruc,
        razonSocial: empresa.razonSocial,
        tipo: empresa.tipo,
        responsable: empresa.responsable,
        flujo: pipeline?.flujo ?? null,
        etapa: pipeline?.etapa ?? null,
        proximaAccion: proximaAccion(pipeline, hoy),
      };
    });
  }
}
