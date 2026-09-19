/**
 * Pure normalization rules for the CRM registry — the single source of
 * truth for every dedup/merge key (spec G1 + design D1). Pure string
 * functions: no I/O, no framework, trivially testable.
 *
 * Consumers: the SQL Server adapter derives the stored *Normalizado
 * columns from raw input; the in-memory fake (application tests) mirrors
 * the same rules so use-case dedup tests stay faithful to the DB UQ
 * semantics. The import flow (pr5+) reuses these for grouping.
 */

/**
 * Registry dedup key: trim, uppercase, strip every non-alphanumeric
 * character — " 900-123456 " and "900123456" collapse to the same
 * `rucNormalizado` (the `UQ_CRM_Empresas_RucNormalizado` value).
 * Uppercasing keeps the optional verifier letter ("…-K") comparable.
 */
export function normalizarRuc(ruc: string): string {
  return ruc.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Contact merge key (design D1 name-match rule): trim, collapse
 * internal whitespace, lowercase, strip accents — "José  Pérez" and
 * "jose perez" share `nombreNormalizado` (the
 * `UQ_CRM_Contactos_EmpresaNombre` value, scoped per empresa).
 */
export function normalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Correo storage form: trim + lowercase (design §2 — addresses are
 * stored normalized under `UQ_CRM_Correos_ContactoCorreo`).
 */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}
