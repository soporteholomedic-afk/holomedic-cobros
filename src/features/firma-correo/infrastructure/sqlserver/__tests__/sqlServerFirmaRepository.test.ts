import { beforeEach, describe, expect, it, vi } from 'vitest';
import type mssql from 'mssql';

import type { FirmaCorreo } from '../../../domain/entities';
import { encodeFirma } from '../../../domain/firmaCodec';
import { FIRMA_STORAGE_AREA, SqlServerFirmaRepository } from '../sqlServerFirmaRepository';

/**
 * Storage-adapter contract tests for `SqlServerFirmaRepository` (PR2
 * task 2.3). The real `mssql` driver is replaced at the module boundary
 * with fakes for `Transaction` / `Request` and a fake pool, so every
 * SQL path is exercised without a live SQL Server:
 *
 *  - get: TOP-1 read keyed by (reserved area, ownerId, active) →
 *    `decodeFirma` (corrupt JSON → null = no signature, TM6).
 *  - save: transactional upsert by (area, ownerId) — INSERT templates +
 *    version rows on first save (`type='company'`, `isDefault=0`,
 *    `editedBy = ownerId`), UPDATE snapshot + new version row on
 *    re-save. The reserved area keeps rows invisible to every
 *    registered-area template list (those filter `WHERE area=@area`).
 */

const mssqlFakes = vi.hoisted(() => {
  type QueryResult = { recordset: Record<string, unknown>[] };
  type Handler = (sql: string, inputs: Record<string, unknown>) => Promise<QueryResult>;

  const state = {
    handler: null as Handler | null,
    queries: [] as { sql: string; inputs: Record<string, unknown>; inTx: boolean }[],
    transactions: [] as {
      begin: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
      rollback: ReturnType<typeof vi.fn>;
    }[],
  };

  class FakeRequest {
    inputs: Record<string, unknown> = {};
    private readonly inTx: boolean;
    constructor(tx?: unknown) {
      this.inTx = tx !== undefined;
    }
    input(name: string, value: unknown): this {
      this.inputs[name] = value;
      return this;
    }
    async query(sql: string): Promise<QueryResult> {
      state.queries.push({ sql, inputs: { ...this.inputs }, inTx: this.inTx });
      if (!state.handler) throw new Error('fake mssql: no handler configured');
      return state.handler(sql, this.inputs);
    }
  }

  class FakeTransaction {
    begin = vi.fn().mockResolvedValue(undefined);
    commit = vi.fn().mockResolvedValue(undefined);
    rollback = vi.fn().mockResolvedValue(undefined);
    constructor() {
      state.transactions.push(this);
    }
  }

  return { state, FakeRequest, FakeTransaction };
});

vi.mock('mssql', () => ({
  default: {
    Transaction: mssqlFakes.FakeTransaction,
    Request: mssqlFakes.FakeRequest,
  },
}));

const { state } = mssqlFakes;

function makePool(): mssql.ConnectionPool {
  return {
    request: () => new mssqlFakes.FakeRequest(),
  } as unknown as mssql.ConnectionPool;
}

function makeFirma(overrides: Partial<FirmaCorreo> = {}): FirmaCorreo {
  return {
    nombre: 'Dra. Juana Pérez',
    area: 'Dermatología',
    correo: 'juana.perez@holomedic.pe',
    telefono: '+51 987 654 321',
    anexo: '123',
    ...overrides,
  };
}

/** Non-tx read handler: returns `rows` for any SELECT, empty otherwise. */
function stubReadRows(rows: Record<string, unknown>[]): void {
  state.handler = async (sql) => {
    if (/SELECT/i.test(sql)) return { recordset: rows };
    return { recordset: [] };
  };
}

/** Handler distinguishing the save-lookup SELECT from writes. */
function stubSaveLookup(row: Record<string, unknown> | undefined): void {
  state.handler = async (sql, inputs) => {
    if (/SELECT TOP 1 id\s+FROM/i.test(sql)) {
      return { recordset: row ? [row] : [] };
    }
    void inputs;
    return { recordset: [] };
  };
}

describe('SqlServerFirmaRepository', () => {
  let repo: SqlServerFirmaRepository;

  beforeEach(() => {
    state.handler = null;
    state.queries = [];
    state.transactions = [];
    repo = new SqlServerFirmaRepository(makePool());
  });

  // --- getOwnFirma ---

  describe('getOwnFirma', () => {
    it('decodes the stored bodyHtml into a FirmaCorreo', async () => {
      const firma = makeFirma();
      stubReadRows([{ bodyHtml: encodeFirma(firma) }]);

      const result = await repo.getOwnFirma('user-1');

      expect(result).toEqual(firma);
    });

    it('queries the reserved area keyed by ownerId, active rows only', async () => {
      stubReadRows([]);

      await repo.getOwnFirma('user-42');

      expect(state.queries).toHaveLength(1);
      const q = state.queries[0];
      expect(q.sql).toContain('FROM dbo.templates');
      expect(q.sql).toContain('TOP 1');
      expect(q.inputs.area).toBe(FIRMA_STORAGE_AREA);
      expect(q.inputs.ownerId).toBe('user-42');
      expect(q.sql).toContain('deletedAt IS NULL');
    });

    it('returns null when the user has no signature row', async () => {
      stubReadRows([]);

      expect(await repo.getOwnFirma('user-1')).toBeNull();
    });

    it('treats corrupt stored JSON as no signature (TM6 — no crash)', async () => {
      stubReadRows([{ bodyHtml: '{not valid json!!' }]);

      expect(await repo.getOwnFirma('user-1')).toBeNull();
    });

    it('treats a wrong-shape payload as no signature', async () => {
      stubReadRows([{ bodyHtml: JSON.stringify({ v: 1, nombre: 42 }) }]);

      expect(await repo.getOwnFirma('user-1')).toBeNull();
    });
  });

  // --- saveOwnFirma ---

  describe('saveOwnFirma — first save (INSERT path)', () => {
    it('inserts the signature row with reserved-area semantics and a version row', async () => {
      stubSaveLookup(undefined);
      const firma = makeFirma();

      await repo.saveOwnFirma('user-1', firma);

      // One transaction, committed.
      expect(state.transactions).toHaveLength(1);
      const tx = state.transactions[0];
      expect(tx.begin).toHaveBeenCalledTimes(1);
      expect(tx.commit).toHaveBeenCalledTimes(1);
      expect(tx.rollback).not.toHaveBeenCalled();

      const templateInsert = state.queries.find((q) => /INSERT INTO dbo.templates/i.test(q.sql));
      expect(templateInsert).toBeDefined();
      expect(templateInsert?.inTx).toBe(true);
      expect(templateInsert?.inputs.area).toBe(FIRMA_STORAGE_AREA);
      expect(templateInsert?.inputs.ownerId).toBe('user-1');
      expect(templateInsert?.inputs.type).toBe('company');
      expect(templateInsert?.inputs.name).toBe('Firma de correo');
      expect(templateInsert?.inputs.subject).toBe('');
      expect(templateInsert?.inputs.isDefault).toBe(0);
      expect(templateInsert?.inputs.bodyHtml).toBe(encodeFirma(firma));

      const versionInsert = state.queries.find((q) =>
        /INSERT INTO dbo.template_versions/i.test(q.sql),
      );
      expect(versionInsert).toBeDefined();
      expect(versionInsert?.inputs.editedBy).toBe('user-1');
      expect(versionInsert?.inputs.bodyHtml).toBe(encodeFirma(firma));
      expect(versionInsert?.inputs.subject).toBe('');
      // The snapshot points at the same version it was created with
      // (the INSERT maps @versionId into the currentVersionId column).
      expect(templateInsert?.inputs.versionId).toBe(versionInsert?.inputs.versionId);
    });
  });

  describe('saveOwnFirma — re-save (UPDATE path)', () => {
    it('updates the existing snapshot and appends a version row — no duplicate template row', async () => {
      stubSaveLookup({ id: 'row-existing' });
      const firma = makeFirma({ nombre: 'Nuevo Nombre' });

      await repo.saveOwnFirma('user-1', firma);

      const templateInsert = state.queries.find((q) => /INSERT INTO dbo.templates/i.test(q.sql));
      expect(templateInsert).toBeUndefined();

      const snapshotUpdate = state.queries.find((q) =>
        /UPDATE dbo\.templates\s+SET/i.test(q.sql),
      );
      expect(snapshotUpdate).toBeDefined();
      expect(snapshotUpdate?.inputs.id).toBe('row-existing');
      expect(snapshotUpdate?.inputs.ownerId).toBe('user-1');
      expect(snapshotUpdate?.inputs.bodyHtml).toBe(encodeFirma(firma));

      const versionInsert = state.queries.find((q) =>
        /INSERT INTO dbo.template_versions/i.test(q.sql),
      );
      expect(versionInsert).toBeDefined();
      expect(versionInsert?.inputs.editedBy).toBe('user-1');
      // The UPDATE maps @versionId into the currentVersionId column.
      expect(snapshotUpdate?.inputs.versionId).toBe(versionInsert?.inputs.versionId);

      const tx = state.transactions[0];
      expect(tx.commit).toHaveBeenCalledTimes(1);
      expect(tx.rollback).not.toHaveBeenCalled();
    });

    it('grows version history on every save (each save appends exactly one version row)', async () => {
      stubSaveLookup({ id: 'row-existing' });

      await repo.saveOwnFirma('user-1', makeFirma({ nombre: 'Primera' }));
      const firstCount = state.queries.filter((q) =>
        /INSERT INTO dbo.template_versions/i.test(q.sql),
      ).length;
      state.queries = [];
      await repo.saveOwnFirma('user-1', makeFirma({ nombre: 'Segunda' }));
      const secondCount = state.queries.filter((q) =>
        /INSERT INTO dbo.template_versions/i.test(q.sql),
      ).length;

      expect(firstCount).toBe(1);
      expect(secondCount).toBe(1);
    });
  });

  describe('saveOwnFirma — failure handling', () => {
    it('rolls back and rethrows when a write inside the transaction fails', async () => {
      stubSaveLookup(undefined);
      state.handler = async (sql) => {
        if (/SELECT TOP 1 id FROM/i.test(sql)) return { recordset: [] };
        if (/INSERT INTO dbo.templates/i.test(sql)) {
          throw new Error('unique violation');
        }
        return { recordset: [] };
      };

      await expect(repo.saveOwnFirma('user-1', makeFirma())).rejects.toThrow('unique violation');

      const tx = state.transactions[0];
      expect(tx.rollback).toHaveBeenCalledTimes(1);
      expect(tx.commit).not.toHaveBeenCalled();
    });
  });
});
