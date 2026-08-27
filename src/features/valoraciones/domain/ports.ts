import type {
  ClienteLookupItem,
  DestinoLookupItem,
  PacienteLookupItem,
  RepFacturacion,
  SedeLookupItem,
  TipoTrabajadorItem,
  ValoracionesFilter,
} from './entities';

/**
 * Port for the read-only SIGLA valoraciones data source. Implemented by
 * `SiglaValoracionesRepository` (SQL Server, typed binds) and faked in
 * tests — routes never touch SQL directly.
 */
export interface ISiglaValoracionesRepository {
  /** Execute `SP_RPT_REPFACTURACION` with the validated filter. */
  buscarValoraciones(filtro: ValoracionesFilter): Promise<RepFacturacion[]>;

  /** Cliente / facturar-a autocomplete by name or RUC (active clients). */
  buscarClientes(q: string): Promise<ClienteLookupItem[]>;

  /** Paciente autocomplete by DNI or apellidos/nombres (Persona table). */
  buscarPacientes(q: string): Promise<PacienteLookupItem[]>;

  /** Active destinations for a client (`Destino WHERE CodCli AND IndReg = 1`). */
  buscarDestinos(codCli: number): Promise<DestinoLookupItem[]>;

  /** Tipo trabajador constants (runtime query, hardcoded fallback — D7). */
  buscarTiposTrabajador(): Promise<TipoTrabajadorItem[]>;

  /** Active sedes (`VW_SEDE WHERE IndReg = 1 ORDER BY CodSed`). */
  buscarSedes(): Promise<SedeLookupItem[]>;
}
