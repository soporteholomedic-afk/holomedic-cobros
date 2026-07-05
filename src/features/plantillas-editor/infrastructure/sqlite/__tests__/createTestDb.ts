import Database from 'better-sqlite3';

import { migrate } from '../migrate';

/**
 * Create a fresh in-memory SQLite database with the template schema
 * applied. Used by the adapter integration tests (better-sqlite3 and
 * sql.js) so every test gets real SQL semantics with zero shared state
 * and no mock — fast, isolated, and behaviour-truthful.
 *
 * Mirrors the `getFileRepository` test-seam philosophy: real adapter over
 * a real (in-memory) backend, not a mock.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  migrate(db);
  return db;
}
