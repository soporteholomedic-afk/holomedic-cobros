import type * as mssql from 'mssql';

/**
 * Run `fn` inside a node-mssql transaction on the shared HOLOMEDIC
 * pool: begin → fn → commit, and rollback + rethrow on failure. First
 * transactional helper in the repo — CRM introduces genuine
 * cross-table invariants the single-statement style cannot cover
 * (design §2): crearEmpresa (empresa + contactos + correos),
 * per-RUC-group import confirm, registrarTransicion, ENVIO_CADENCIA
 * counters, asignar/devolver. Single-row writes stay single-statement.
 *
 * The ORIGINAL error always propagates: if the rollback itself fails
 * (e.g. the transaction already aborted server-side), that secondary
 * failure is swallowed so it can never mask the caller's exception.
 */
export async function withCrmTransaction<T>(
  pool: mssql.ConnectionPool,
  fn: (tx: mssql.Transaction) => Promise<T>,
): Promise<T> {
  const tx = pool.transaction();
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      // Deliberately swallowed: the original error below is the one
      // that matters — a failed rollback must not replace it.
    }
    throw err;
  }
}
