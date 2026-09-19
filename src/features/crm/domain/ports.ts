import type {
  ActualizarEmpresaInput,
  CrearEmpresaInput,
  Empresa,
  TipoEmpresa,
} from './entities';
import type { ErrorFilaImport, GrupoEmpresaImportado } from './importar/validarImportacion';

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
 * Outcome of ONE RUC-group import transaction, executed by the adapter
 * inside `withCrmTransaction` (design §2a). `advertencias` are the
 * non-blocking D1 duplicate rows ("Posible contacto duplicado") found
 * while merging against the empresa's existing contactos.
 */
export interface ResultadoGrupoImport {
  modo: 'crear' | 'actualizar';
  contactosCreados: number;
  contactosActualizados: number;
  advertencias: ErrorFilaImport[];
}

/** The CRM_Importaciones job record (design §2) — audit of one import run. */
export interface RegistroImportacion {
  archivoNombre: string;
  totalFilas: number;
  filasValidas: number;
  empresasCreadas: number;
  empresasActualizadas: number;
  contactosCreados: number;
  contactosActualizados: number;
  /** JSON array of report rows [{fila, columna, mensaje}]: errores + fallos + advertencias. */
  erroresJson: string;
  ejecutadoPor: string;
}

/**
 * Outbound port for the import execution (tasks pr6, spec G2).
 * `ejecutarGrupo` owns the PER-GROUP transaction so one bad group
 * never rolls back valid groups; `registrarImportacion` writes the
 * job record AFTER all groups (single-statement insert). Implemented
 * by `SqlServerCrmImportador` (infrastructure/importar).
 */
export interface CrmImportadorPort {
  ejecutarGrupo(grupo: GrupoEmpresaImportado, usuario: string): Promise<ResultadoGrupoImport>;
  registrarImportacion(registro: RegistroImportacion): Promise<number>;
}

/**
 * Injected clock — cadence math and audit stamps stay deterministic in
 * tests (design §3: hoy injected, no hidden Date.now in the domain).
 */
export type Clock = () => Date;
