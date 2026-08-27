/**
 * Barrel for the SQL Server adapter of the per-user email-signature
 * store. The factory (`getFirmaDb`) imports from this module; API
 * routes import the adapter + reserved-area constant from here so the
 * storage backend is swappable via this single import surface.
 *
 * `migrate` is RE-EXPORTED from the plantillas-editor sqlserver module:
 * signature rows are schema GUESTS in `dbo.templates` /
 * `dbo.template_versions` (zero migration of their own), so the factory
 * runs the plantillas schema migration it already depends on — through
 * this barrel, giving the factory a single import surface (design
 * decision 5: leaf infra dependency, no schema duplication).
 */
export { SqlServerFirmaRepository, FIRMA_STORAGE_AREA } from './sqlServerFirmaRepository';
export { migrate } from '@/features/plantillas-editor/infrastructure/sqlserver';
