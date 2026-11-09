import { estadoActividadServicios, mesesEntre } from '../domain/actividadServicios';
import type { Empresa } from '../domain/entities';
import type { ICrmEmpresaRepository, IAtencionesServicio } from '../domain/ports';

/** Filters + ordering + paging for both segments of the Inactivas view (S14-S16). */
export interface OpcionesInactivas {
  /** Substring match (case-insensitive) over razón social, RUC and (SIGLA rows) contacto. */
  q?: string;
  /** Exact sector match; only meaningful for the CRM segment. */
  sector?: string;
  estado?: 'sin_actividad' | 'pendiente_primera';
  /** Whole-months range; rows without months (pendiente_primera) are excluded when set. */
  mesesMin?: number;
  mesesMax?: number;
  /** Only CRM segment: 'con' keeps rows with at least one CRM interaction, 'sin' the rest. */
  contacto?: 'con' | 'sin';
  orden?: 'abandono' | 'razonSocial' | 'ultimaAtencion' | 'ultimoContacto';
  direccion?: 'asc' | 'desc';
  pagina?: number;
}

export const TAMANO_PAGINA = 50;

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
  /** Rows after filters. */
  total: number;
  /** Rows before filters — the segment size shown in the segmented control. */
  totalFuente: number;
  pagina: number;
  paginas: number;
  /** Distinct sectors present in the segment before filters (facets, sorted). */
  sectores: string[];
}

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
  /** Rows after filters. */
  total: number;
  /** Rows before filters — the segment size shown in the segmented control. */
  totalFuente: number;
  pagina: number;
  paginas: number;
}

type FilaOrdenable = Pick<EmpresaInactiva, 'razonSocial' | 'ultimaAtencion' | 'mesesSinActividad' | 'estado'> & {
  ruc: string;
  contacto?: string | null;
  ultimoContactoCrm?: string | null;
  sector?: string | null;
};

function textoCoincide(fila: FilaOrdenable, q?: string): boolean {
  const aguja = q?.trim().toLowerCase();
  if (!aguja) return true;
  return (
    fila.razonSocial.toLowerCase().includes(aguja) ||
    fila.ruc.includes(aguja) ||
    (fila.contacto?.toLowerCase().includes(aguja) ?? false)
  );
}

function pasaFiltros(fila: FilaOrdenable, op: OpcionesInactivas): boolean {
  if (op.estado && fila.estado !== op.estado) return false;
  if (op.sector && fila.sector !== op.sector) return false;
  if (op.contacto) {
    const tiene = (fila.ultimoContactoCrm ?? null) !== null;
    if (op.contacto === 'con' && !tiene) return false;
    if (op.contacto === 'sin' && tiene) return false;
  }
  const meses = fila.mesesSinActividad;
  // Sin meses que acotar (pendiente_primera) queda fuera de un filtro de antigüedad.
  if (op.mesesMin !== undefined && (meses === null || meses < op.mesesMin)) return false;
  if (op.mesesMax !== undefined && (meses === null || meses > op.mesesMax)) return false;
  return textoCoincide(fila, op.q);
}

function comparadorAbandonoBase(a: FilaOrdenable, b: FilaOrdenable): number {
  // Most abandoned first: sin_actividad above, oldest attention above, then name.
  // `pendiente_primera` always closes the list, whatever the direction (S6.7 within the group).
  if (a.estado !== b.estado) return a.estado === 'sin_actividad' ? -1 : 1;
  const ua = a.ultimaAtencion ?? '';
  const ub = b.ultimaAtencion ?? '';
  if (ua !== ub) return ua < ub ? -1 : 1;
  return a.razonSocial.localeCompare(b.razonSocial);
}

function nulosPrimeroEnAsc(a: string | null, b: string | null, asc: boolean): number | null {
  const aNull = a === null;
  const bNull = b === null;
  if (aNull && bNull) return 0;
  if (aNull) return asc ? -1 : 1;
  if (bNull) return asc ? 1 : -1;
  return null;
}

function comparar(filaA: FilaOrdenable, filaB: FilaOrdenable, op: OpcionesInactivas): number {
  const asc = op.direccion === 'asc';
  switch (op.orden ?? 'abandono') {
    case 'razonSocial': {
      const base = filaA.razonSocial.localeCompare(filaB.razonSocial);
      return asc ? base : -base;
    }
    case 'ultimaAtencion': {
      const nulos = nulosPrimeroEnAsc(filaA.ultimaAtencion ?? null, filaB.ultimaAtencion ?? null, asc);
      if (nulos !== null) return nulos;
      const base = (filaA.ultimaAtencion ?? '') < (filaB.ultimaAtencion ?? '') ? -1 : 1;
      return asc ? base : -base;
    }
    case 'ultimoContacto': {
      const a = filaA.ultimoContactoCrm ?? null;
      const b = filaB.ultimoContactoCrm ?? null;
      const nulos = nulosPrimeroEnAsc(a, b, asc);
      if (nulos !== null) return nulos;
      const base = a! < b! ? -1 : 1;
      return asc ? base : -base;
    }
    default: {
      // 'abandono': desc (default) = most abandoned first; asc fully reverses (S6.7 group flips too).
      const base = comparadorAbandonoBase(filaA, filaB);
      return asc ? -base : base;
    }
  }
}

function paginar<T>(filas: T[], pagina: number): { filas: T[]; pagina: number; paginas: number } {
  const paginas = Math.max(1, Math.ceil(filas.length / TAMANO_PAGINA));
  const paginaSegura = Math.max(1, pagina);
  const inicio = (paginaSegura - 1) * TAMANO_PAGINA;
  return { filas: filas.slice(inicio, inicio + TAMANO_PAGINA), pagina: paginaSegura, paginas };
}

/**
 * "Inactivas" list (feature crm-vista-inactivas): clientes de SIGLA whose last
 * performed service is at least `UMBRAL_MESES_INACTIVIDAD` months old, most
 * abandoned first. Activity is read LIVE from SIGLA through the atenciones
 * port — never from CRM calls or emails (regla S6.6). A cliente whose RUC has
 * no attention at all is `pendiente_primera` and goes last, never labelled
 * inactive (regla S6.7). Prospectos are out of scope by definition; clientes
 * without RUC can never reach SIGLA and are only counted.
 *
 * `hoy` is the Lima calendar day (`YYYY-MM-DD`), like everywhere else in this layer.
 */
export class ListarEmpresasInactivasUseCase {
  constructor(
    private readonly empresas: ICrmEmpresaRepository,
    private readonly atenciones: IAtencionesServicio,
  ) {}

  async execute(hoy: string, opciones: OpcionesInactivas = {}): Promise<ListadoEmpresasInactivas> {
    const anclaje = new Date(`${hoy}T00:00:00Z`);
    const todas = await this.empresas.list();
    const clientes = todas.filter((e): e is Empresa & { ruc: string } => e.relacion === 'cliente' && e.ruc !== null);
    const sinInformacion = todas.filter((e) => e.relacion === 'cliente' && e.ruc === null).length;
    if (clientes.length === 0) {
      return { filas: [], sinInformacion, total: 0, totalFuente: 0, pagina: 1, paginas: 1, sectores: [] };
    }

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

    const totalFuente = filas.length;
    const sectores = [...new Set(filas.map((f) => f.sector).filter((s): s is string => s !== null))].sort((a, b) =>
      a.localeCompare(b),
    );

    // Last CRM contact per candidate row (S6): one bulk query for the
    // filtered ids — needed BEFORE sorting when orden = 'ultimoContacto', and
    // a reciente empresa is never queried. Contacting from the CRM refreshes
    // this column but does NOT remove the row: only a new SIGLA attention does.
    const contactos =
      filas.length > 0
        ? await this.empresas.ultimaInteraccionPorEmpresas(filas.map((f) => f.idEmpresa))
        : new Map<string, string | null>();
    for (const fila of filas) {
      fila.ultimoContactoCrm = contactos.get(fila.idEmpresa) ?? null;
    }

    const filtradas = filas.filter((fila) => pasaFiltros(fila, opciones)).sort((a, b) => comparar(a, b, opciones));
    const { filas: pagina, pagina: paginaActual, paginas } = paginar(filtradas, opciones.pagina ?? 1);
    return { filas: pagina, sinInformacion, total: filtradas.length, totalFuente, pagina: paginaActual, paginas, sectores };
  }

  /**
   * "Solo en SIGLA" segment (S10/S13): dormant SIGLA clients WITHOUT a CRM
   * ficha. Same threshold semantics as the ficha segment — states derived
   * with `estadoActividadServicios` (S13: single source of truth) — sorted
   * the same way (most abandoned first, pendiente_primera last) and paged in
   * memory at `TAMANO_PAGINA` rows. Filters/order via `OpcionesInactivas`
   * (S14-S15): sector and último contacto have no effect here (rows carry no
   * ficha), the rest behave identically.
   */
  async executeSigla(hoy: string, opciones: OpcionesInactivas = {}): Promise<ListadoSiglaSinFicha> {
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

    const totalFuente = dormidas.length;
    const filtradas = dormidas.filter((fila) => pasaFiltros(fila, opciones)).sort((a, b) => comparar(a, b, opciones));
    const { filas, pagina, paginas } = paginar(filtradas, opciones.pagina ?? 1);
    return { filas, total: filtradas.length, totalFuente, pagina, paginas };
  }
}
