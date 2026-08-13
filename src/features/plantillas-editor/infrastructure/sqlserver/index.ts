/**
 * Barrel for the SQL Server adapter of the template store. The factory
 * (`getTemplateDb`) imports from this module; routes and use cases
 * import `TemplateNotFoundError` from here so the storage backend
 * is swappable via this single import surface.
 */
export { SqlServerTemplateRepository } from './sqlServerTemplateRepository';
export { migrate } from './migrate';
export { TemplateNotFoundError, TemplateDefaultConflictError } from './errors';
