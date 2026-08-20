/**
 * Barrel for the SQL Server adapter of the consolidated-send history
 * store. The factory (`getEnvioHistoryDb`) imports from this module so
 * the storage backend stays swappable via this single import surface.
 */
export { migrate } from './migrate';
