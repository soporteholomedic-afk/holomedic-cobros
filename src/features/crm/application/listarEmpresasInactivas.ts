import { estadoActividadServicios, mesesEntre } from '../domain/actividadServicios';
import type { Empresa } from '../domain/entities';
import type { ClienteSiglaConActividad, ICrmEmpresaRepository, IAtencionesServicio } from '../domain/ports';

/** One row of the "Inactivas" view: a cliente without recent SIGLA activity. */
export interface EmpresaInactiva {
  idEmpresa: string;
  razonSocial: string;
  ruc: string;
  sector: string | null;
  /** ISO day (Lima, `YYYY-MM-DD`) of the last SIGLA attention; `null` when never attended. */
  ultimaAtencion: string | null;
  /** Whole months since that attention; `null` when never attended. */
  mesesSinActividad: number | null;
  /** ISO timestamp of the empresa's newest CRM interaction; `null` when never contacted from the CRM. */
  ultimoContactoCrm: string | null;
  estado: 'sin_actividad' | 'pendiente_primera';
}

export interface ListadoEmpresasInactivas {
  filas: EmpresaInactiva[];
  /** Clientes that can never reach SIGLA (no RUC); shown as an informational count, never listed. */
  sinInformacion: number;
}

export const TAMANO_PAGINA_SIGLA = 50;

/** One row of the "Solo en SIGLA" segment: a dormant SIGLA client with NO CRM ficha. */
export interface ClienteSiglaSinFicha {
  razonSocial: string;
  ruc: string;
  telefono: string | null;
  contacto: string | null;
  correo: string | null;
  ultimaAtencion: string | null;
  mesesSinActividad: number | null;
  estado: 'sin_actividad' | 'pendiente_primera';
}

export interface ListadoSiglaSinFicha {
  filas: ClienteSiglaSinFicha[];
  total: number;
  pagina: number;
  paginas: number;
}

/**
 * "Inactivas" list (feature crm-vista-inactivas, S2): clientes de SIGLA whose
 * last performed service is at least `UMBRAL_MESES_INACTIVIDAD` months old,
 * most abandoned first. Activity is read LIVE from SIGLA through the bulk
 * atenciones port — never from CRM calls or emails (regla S6.6). A cliente
 * whose RUC has no attention at all is `pendiente_primera` and goes last,
 * never labelled inactive (regla S6.7). Prospectos are out of scope by
 * definition; clientes without RUC can never reach SIGLA and are only counted.
 *
 * `hoy` is the Lima calendar day (`YYYY-MM-DD`), like everywhere else in this layer.
 */
export class ListarEmpresasInactivasUseCase {
  constructor(
    private readonly empresas: ICrmEmpresaRepository,
    private readonly atenciones: IAtencionesServicio,
  ) {}

  async execute(hoy: string): Promise<ListadoEmpresasInactivas> {
    const anclaje = new Date(`${hoy}T00:00:00Z`);
    const todas = await this.empresas.list();
    const clientes = todas.filter((e): e is Empresa & { ruc: string } => e.relacion === 'cliente' && e.ruc !== null);
    const sinInformacion = todas.filter((e) => e.relacion === 'cliente' && e.ruc === null).length;
    if (clientes.length === 0) return { filas: [], sinInformacion };

    const ultimaPorRuc = await this.atenciones.ultimaAtencionPorRucs(clientes.map((e) => e.ruc));
    const filas: EmpresaInactiva[] = [];
    for (const cliente of clientes) {
      const ultimaAtencion = ultimaPorRuc.get(cliente.ruc) ?? null;
      const estado = estadoActividadServicios(cliente.relacion, { ultimaAtencion, ruc: cliente.ruc }, anclaje);
      if (estado !== 'sin_actividad' && estado !== 'pendiente_primera') continue;
      filas.push({
        idEmpresa: cliente.idEmpresa,
        razonSocial: cliente.razonSocial,
        ruc: cliente.ruc,
        sector: cliente.sector,
        ultimaAtencion,
        mesesSinActividad: ultimaAtencion === null ? null : mesesEntre(new Date(`${ultimaAtencion}T00:00:00Z`), anclaje),
        ultimoContactoCrm: null,
        estado,
      });
    }

    // Most abandoned first: oldest attention wins; never-attended go last
    // within their group (S6.7); ties break alphabetically.
    filas.sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === 'sin_actividad' ? -1 : 1;
      if (a.ultimaAtencion !== b.ultimaAtencion) {
        return (a.ultimaAtencion ?? '') < (b.ultimaAtencion ?? '') ? -1 : 1;
      }
      return a.razonSocial.localeCompare(b.razonSocial);
    });

    // Last CRM contact per listed row (S6): one bulk query for exactly the
    // listed ids — a reciente empresa is never queried. Contacting from the
    // CRM refreshes this column but does NOT remove the row: only a new
    // SIGLA attention does.
    const contactos =
      filas.length > 0
        ? await this.empresas.ultimaInteraccionPorEmpresas(filas.map((f) => f.idEmpresa))
        : new Map<string, string | null>();
    for (const fila of filas) {
      fila.ultimoContactoCrm = contactos.get(fila.idEmpresa) ?? null;
    }
    return { filas, sinInformacion };
  }

  /**
   * "Solo en SIGLA" segment (S10/S13): dormant SIGLA clients WITHOUT a CRM
   * ficha. Same threshold semantics as the ficha segment — states derived
   * with `estadoActividadServicios` (S13: single source of truth) — sorted
   * the same way (most abandoned first, pendiente_primera last) and paged
   * in memory at `TAMANO_PAGINA_SIGLA` rows.
   */
  async executeSigla(hoy: string, pagina: number): Promise<ListadoSiglaSinFicha> {
    const anclaje = new Date(`${hoy}T00:00:00Z`);
    const [todos, empresas] = await Promise.all([this.atenciones.clientesConActividad(), this.empresas.list()]);
    const conFicha = new Set(empresas.map((e) => e.ruc).filter((r): r is string => r !== null));

    const dormidas: ClienteSiglaSinFicha[] = [];
    for (const cliente of todos) {
      if (conFicha.has(cliente.ruc)) continue;
      const estado = estadoActividadServicios(
        'cliente',
        { ultimaAtencion: cliente.ultimaAtencion, ruc: cliente.ruc },
        anclaje,
      );
      if (estado !== 'sin_actividad' && estado !== 'pendiente_primera') continue;
      dormidas.push({
        ...cliente,
        mesesSinActividad:
          cliente.ultimaAtencion === null
            ? null
            : mesesEntre(new Date(`${cliente.ultimaAtencion}T00:00:00Z`), anclaje),
        estado,
      });
    }

    dormidas.sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === 'sin_actividad' ? -1 : 1;
      if (a.ultimaAtencion !== b.ultimaAtencion) {
        return (a.ultimaAtencion ?? '') < (b.ultimaAtencion ?? '') ? -1 : 1;
      }
      return a.razonSocial.localeCompare(b.razonSocial);
    });

    const total = dormidas.length;
    const paginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA_SIGLA));
    const paginaSegura = Math.max(1, pagina);
    const inicio = (paginaSegura - 1) * TAMANO_PAGINA_SIGLA;
    return { filas: dormidas.slice(inicio, inicio + TAMANO_PAGINA_SIGLA), total, pagina: paginaSegura, paginas };
  }
}
