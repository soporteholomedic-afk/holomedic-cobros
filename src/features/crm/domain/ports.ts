import type {
  ActualizarEmpresaInput,
  CrearEmpresaInput,
  Empresa,
  TipoEmpresa,
} from './entities';

/** Filters for the empresa list (spec G1; etapa filter arrives with the pipeline in pr9+). */
export interface FiltrosEmpresas {
  /** Free-text match over razonSocial / RUC. */
  q?: string;
  tipo?: TipoEmpresa;
  /** Exact username; null filters unassigned (pool) empresas. */
  responsable?: string | null;
}

/**
 * Outbound port for the empresa registry. Implemented by the SQL Server
 * adapter (pr3); consumed by the CRUD use cases through this contract so
 * application logic stays persistence-agnostic (hexagonal boundary).
 */
export interface CrmEmpresaRepositoryPort {
  crear(datos: CrearEmpresaInput): Promise<Empresa>;
  listar(filtros?: FiltrosEmpresas): Promise<Empresa[]>;
  obtenerPorId(id: number): Promise<Empresa | null>;
  actualizar(id: number, cambios: ActualizarEmpresaInput): Promise<Empresa | null>;
}

/**
 * Injected clock — cadence math and audit stamps stay deterministic in
 * tests (design §3: hoy injected, no hidden Date.now in the domain).
 */
export type Clock = () => Date;
