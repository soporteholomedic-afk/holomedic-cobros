import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { ITemplateRepository } from '../../../domain/ports';
import type { Template } from '../../../domain/entities';

import { SqlServerTemplateRepository } from '../sqlServerTemplateRepository';
import { TemplateNotFoundError } from '../errors';

/**
 * Unit tests for `SqlServerTemplateRepository` over a fully mocked
 * `mssql` module. The contract is identical to the legacy SQLite
 * adapter's: full `ITemplateRepository` surface, append-only versioning,
 * soft delete + default clearing, clone (incl. from soft-deleted),
 * restore, default uniqueness per area+type, append-only rollback.
 *
 * The mock exposes an in-memory store keyed by table -> row map so
 * every assertion can read back what the SQL would have produced.
 * "SQL" is captured as a list of `{ sql, inputs }` per request so
 * ordering and parameter binding can be checked.
 *
 * The mock simulates mssql's `DATETIME2 -> Date` round-trip: writes
 * accept whatever the adapter sends (ISO strings), reads return JS
 * `Date` objects, and the adapter's `dateToIso(row.createdAt)` works
 * as it would against a real SQL Server.
 */

// ---------------------------------------------------------------------------
// Mock plumbing (must be hoisted BEFORE the adapter's `import mssql`).
// ---------------------------------------------------------------------------

interface MockRequest {
  inputs: Record<string, unknown>;
  input: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  batch: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
}

interface MockTransaction {
  begin: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
}

interface MockPool {
  request: ReturnType<typeof vi.fn>;
  queryLog: Array<{ sql: string; inputs: Record<string, unknown> }>;
  tables: {
    templates: Map<string, Record<string, unknown>>;
    template_versions: Map<string, Record<string, unknown>>;
  };
  transactions: MockTransaction[];
  /** Allow per-test override of the Request class (e.g. for the rollback test). */
  RequestOverride: new () => MockRequest | null;
}

function createMockRequest(
  make: () => {
    queryLog: Array<{ sql: string; inputs: Record<string, unknown> }>;
    tables: {
      templates: Map<string, Record<string, unknown>>;
      template_versions: Map<string, Record<string, unknown>>;
    };
  },
): MockRequest {
  const inputs: Record<string, unknown> = {};
  const request: MockRequest = {
    inputs,
    input: vi.fn().mockImplementation((name: string, value: unknown) => {
      inputs[name] = value;
      return request;
    }),
    query: vi.fn().mockImplementation(async (sql: string) => {
      const env = make();
      env.queryLog.push({ sql, inputs: { ...inputs } });
      return executeSql(sql, inputs, env.tables);
    }),
    batch: vi.fn().mockImplementation(async () => ({ recordset: [], rowsAffected: [0] })),
    execute: vi.fn().mockImplementation(async () => ({ recordset: [], rowsAffected: 0 })),
  };
  return request;
}

function executeSql(
  sql: string,
  inputs: Record<string, unknown>,
  t: { templates: Map<string, Record<string, unknown>>; template_versions: Map<string, Record<string, unknown>> },
): { recordset: unknown[]; rowsAffected: number } {
  const upper = sql.trim().toUpperCase();
  if (upper.startsWith('SELECT * FROM DBO.TEMPLATES')) {
    const rows = [...t.templates.values()].filter((row) => matchesWhere(row, sql, inputs));
    const ordered = applyOrder(rows, sql).map((row) => toDateShape(row));
    return { recordset: ordered, rowsAffected: ordered.length };
  }
  if (upper.startsWith('SELECT * FROM DBO.TEMPLATE_VERSIONS')) {
    const rows = [...t.template_versions.values()].filter((row) =>
      matchesWhere(row, sql, inputs),
    );
    // For the version listing, the contract is "most recent first".
    // The mock simulates the production intent by iterating the
    // in-memory map in reverse (last-inserted first) so equal-`editedAt`
    // versions still come out most-recent-first.
    const ordered = applyOrder(rows.slice().reverse(), sql).map((row) => toDateShape(row));
    return { recordset: ordered, rowsAffected: ordered.length };
  }
  if (upper.startsWith('INSERT INTO DBO.TEMPLATES')) {
    const row = buildTemplateRow(inputs);
    t.templates.set(String(row.id), row);
    return { recordset: [], rowsAffected: 1 };
  }
  if (upper.startsWith('INSERT INTO DBO.TEMPLATE_VERSIONS')) {
    const row = buildVersionRow(inputs);
    t.template_versions.set(String(row.versionId), row);
    return { recordset: [], rowsAffected: 1 };
  }
  if (upper.startsWith('UPDATE DBO.TEMPLATES')) {
    const affected = [...t.templates.values()].filter((row) =>
      matchesWhere(row, sql, inputs),
    );
    if (affected.length === 0) return { recordset: [], rowsAffected: 0 };
    for (const row of affected) {
      applySetClause(row, sql, inputs);
      t.templates.set(String(row.id), row);
    }
    return { recordset: [], rowsAffected: affected.length };
  }
  throw new Error(`mock: unhandled SQL: ${sql}`);
}

function whereClause(sql: string): string {
  const m = sql.match(/\bWHERE\b([\s\S]*)$/i);
  return m ? (m[1] ?? '') : '';
}

function matchesWhere(
  row: Record<string, unknown>,
  sql: string,
  inputs: Record<string, unknown>,
): boolean {
  const w = whereClause(sql);
  if (/\bid\s*=\s*@id\b/i.test(w)) {
    if (row.id !== inputs.id) return false;
  }
  if (
    /\btemplateId\s*=\s*@templateId\b/i.test(w) &&
    /\bversionId\s*=\s*@versionId\b/i.test(w)
  ) {
    if (row.templateId !== inputs.templateId) return false;
    if (row.versionId !== inputs.versionId) return false;
  }
  if (/area\s*=\s*@area/i.test(w)) {
    if (row.area !== inputs.area) return false;
  }
  if (/\btype\s*=\s*@type\b/i.test(w)) {
    if (row.type !== inputs.type) return false;
  }
  if (/deletedAt\s+IS\s+NOT\s+NULL/i.test(w)) {
    if (row.deletedAt === null) return false;
  }
  if (/deletedAt\s+IS\s+NULL/i.test(w)) {
    if (row.deletedAt !== null) return false;
  }
  if (/\bisDefault\s*=\s*1\b/i.test(w)) {
    if (row.isDefault !== true) return false;
  }
  return true;
}

function applyOrder(
  rows: Record<string, unknown>[],
  sql: string,
): Record<string, unknown>[] {
  const out = [...rows];
  if (/ORDER\s+BY\s+updatedAt\s+DESC/i.test(sql)) {
    out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  } else if (/ORDER\s+BY\s+editedAt\s+DESC,\s*versionId\s+DESC/i.test(sql)) {
    out.sort((a, b) => String(b.editedAt).localeCompare(String(a.editedAt)));
  }
  return out;
}

function toDateShape(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  for (const key of ['createdAt', 'updatedAt', 'editedAt', 'deletedAt'] as const) {
    const v = copy[key];
    if (typeof v === 'string') {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) copy[key] = d;
    }
  }
  return copy;
}

function buildTemplateRow(inputs: Record<string, unknown>): Record<string, unknown> {
  return {
    id: inputs.id,
    area: inputs.area,
    type: inputs.type,
    name: inputs.name,
    subject: inputs.subject,
    bodyHtml: inputs.bodyHtml,
    isDefault: inputs.isDefault,
    currentVersionId: inputs.versionId,
    deletedAt: null,
    createdAt: inputs.now,
    updatedAt: inputs.now,
    ownerId: null,
  };
}

function buildVersionRow(inputs: Record<string, unknown>): Record<string, unknown> {
  return {
    versionId: inputs.versionId,
    templateId: inputs.templateId,
    subject: inputs.subject,
    bodyHtml: inputs.bodyHtml,
    editedAt: inputs.now,
    editedBy: null,
  };
}

function applySetClause(
  row: Record<string, unknown>,
  sql: string,
  inputs: Record<string, unknown>,
): void {
  const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE\s+/i);
  if (!setMatch) return;
  const setClause = setMatch[1] ?? '';
  const pairs = setClause.split(',').map((p) => p.trim());
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const col = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value === 'NULL') {
      row[col] = null;
    } else if (value === '0') {
      row[col] = false;
    } else if (value === '1') {
      row[col] = true;
    } else if (value.startsWith('@')) {
      const key = value.slice(1);
      if (Object.prototype.hasOwnProperty.call(inputs, key)) {
        row[col] = inputs[key];
      }
    }
  }
}

const mockState = vi.hoisted(() => {
  const tables = {
    templates: new Map<string, Record<string, unknown>>(),
    template_versions: new Map<string, Record<string, unknown>>(),
  };
  const queryLog: Array<{ sql: string; inputs: Record<string, unknown> }> = [];
  const transactions: MockTransaction[] = [];

  const env = { tables, queryLog };

  // Mutable `Request` factory so the rollback test can swap the class
  // out for a failing one and back without re-mocking the module.
  // Use a real `class` declaration with a delegating constructor so
  // `new mssql.Request(tx)` is constructible at runtime.
  class DefaultRequest implements MockRequest {
    inputs: Record<string, unknown> = {};
    input = vi.fn().mockImplementation((name: string, value: unknown) => {
      this.inputs[name] = value;
      return this;
    });
    query = vi.fn().mockImplementation(async (sql: string) => {
      queryLog.push({ sql, inputs: { ...this.inputs } });
      return executeSql(sql, this.inputs, tables);
    });
    batch = vi.fn().mockImplementation(async () => ({ recordset: [], rowsAffected: [0] }));
    execute = vi.fn().mockImplementation(async () => ({ recordset: [], rowsAffected: 0 }));
  }

  let RequestCtor: new (...args: never[]) => MockRequest = DefaultRequest;

  class MockRequestClass {
    constructor() {
      return new RequestCtor();
    }
  }

  // Real classes so the adapter's `new mssql.Transaction(this.pool)` and
  // `new mssql.Request(tx)` work without vitest mock-fn quirks.
  class MockTransactionClass implements MockTransaction {
    begin = vi.fn().mockResolvedValue(undefined);
    commit = vi.fn().mockResolvedValue(undefined);
    rollback = vi.fn().mockResolvedValue(undefined);
    request = vi.fn().mockImplementation(() => createMockRequest(() => env));
    constructor() {
      transactions.push(this);
    }
  }

  return {
    pool: {
      request: vi.fn().mockImplementation(() => createMockRequest(() => env)),
      queryLog,
      tables,
      transactions,
    } as MockPool,
    MockTransactionClass,
    MockRequestClass,
    setRequestCtor: (ctor: new (...args: never[]) => MockRequest) => {
      RequestCtor = ctor;
    },
    getRequestCtor: () => RequestCtor,
  };
});

vi.mock('mssql', () => ({
  default: {
    ConnectionPool: vi.fn().mockImplementation(() => mockState.pool),
    Request: mockState.MockRequestClass,
    Transaction: mockState.MockTransactionClass,
  },
  ConnectionPool: vi.fn().mockImplementation(() => mockState.pool),
  Request: mockState.MockRequestClass,
  Transaction: mockState.MockTransactionClass,
}));

let pool: MockPool;

beforeEach(() => {
  // Reset mutable mock state without re-mocking the module — `vi.mock`
  // is hoisted so the adapter already imports the stable mock classes.
  pool = mockState.pool;
  pool.tables.templates.clear();
  pool.tables.template_versions.clear();
  pool.queryLog.length = 0;
  pool.transactions.length = 0;
});

function makeRepo(): SqlServerTemplateRepository {
  return new SqlServerTemplateRepository(
    mockState.pool as unknown as import('mssql').ConnectionPool,
  );
}

async function saveSample(
  repo: ITemplateRepository,
  overrides: {
    id?: string;
    area?: string;
    type?: 'company' | 'patient';
    name?: string;
    subject?: string;
    bodyHtml?: string;
    isDefault?: boolean;
  } = {},
): Promise<Template> {
  return repo.save({
    area: overrides.area ?? 'consolidados',
    type: overrides.type ?? 'company',
    name: overrides.name ?? 'Welcome',
    subject: overrides.subject ?? 'Hello {{empresa}}',
    bodyHtml: overrides.bodyHtml ?? '<p>{{empresa}}</p>',
    id: overrides.id,
    isDefault: overrides.isDefault,
  });
}

describe('SqlServerTemplateRepository', () => {
  describe('save + getById (CRUD)', () => {
    it('creates a new template with a generated id and a first version row', async () => {
      const repo = makeRepo();
      const created = await saveSample(repo);

      expect(created.id).toBeTruthy();
      expect(created.currentVersionId).toBeTruthy();
      expect(created.currentVersionId).not.toBeNull();
      expect(created.isDefault).toBe(false);
      expect(created.deletedAt).toBeNull();
      expect(created.createdAt).toBeTruthy();
      expect(created.updatedAt).toBeTruthy();

      const fetched = await repo.getById(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.subject).toBe('Hello {{empresa}}');
    });

    it('getById returns null when the template is missing', async () => {
      const repo = makeRepo();
      expect(await repo.getById('does-not-exist')).toBeNull();
    });

    it('getById can read a soft-deleted template (trash/clone source)', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo);
      await repo.softDelete(t.id);

      const fetched = await repo.getById(t.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.deletedAt).not.toBeNull();
    });
  });

  describe('append-only versioning', () => {
    it('save on an existing template appends a new version and updates currentVersionId', async () => {
      const repo = makeRepo();
      const created = await saveSample(repo, { subject: 'v1 subject' });
      const v1Current = created.currentVersionId;

      const updated = await repo.save({
        id: created.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'v2 subject',
        bodyHtml: '<p>v2</p>',
      });

      expect(updated.currentVersionId).not.toBe(v1Current);
      expect(updated.subject).toBe('v2 subject');
      expect(updated.bodyHtml).toBe('<p>v2</p>');

      const versions = await repo.listVersions(created.id);
      expect(versions).toHaveLength(2);
      const v1Row = versions.find((v) => v.versionId === v1Current);
      expect(v1Row?.subject).toBe('v1 subject');
    });

    it('save never mutates an existing version row (append-only)', async () => {
      const repo = makeRepo();
      const created = await saveSample(repo, { subject: 'orig' });
      const v1Id = created.currentVersionId;

      await repo.save({
        id: created.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'changed',
        bodyHtml: '<p>changed</p>',
      });

      const v1Row = (await repo.listVersions(created.id)).find(
        (v) => v.versionId === v1Id,
      );
      expect(v1Row?.subject).toBe('orig');
    });
  });

  describe('listByArea / listByAreaAndType (active only)', () => {
    it('listByAreaAndType returns only active templates (excludes soft-deleted)', async () => {
      const repo = makeRepo();
      const active = await saveSample(repo, { name: 'A', type: 'company' });
      const deleted = await saveSample(repo, { name: 'B', type: 'company' });
      await repo.softDelete(deleted.id);

      const result = await repo.listByAreaAndType('consolidados', 'company');
      expect(result.map((t) => t.id)).toEqual([active.id]);
      expect(result[0]?.deletedAt).toBeNull();
    });

    it('listByArea returns only active templates for the area', async () => {
      const repo = makeRepo();
      const a = await saveSample(repo, { name: 'A', type: 'company' });
      const b = await saveSample(repo, { name: 'B', type: 'patient' });
      const c = await saveSample(repo, { name: 'C', type: 'company' });
      await repo.softDelete(b.id);

      const result = await repo.listByArea('consolidados');
      const ids = result.map((t) => t.id).sort();
      expect(ids).toEqual([a.id, c.id].sort());
    });

    it('listByAreaAndType filters by type within the area', async () => {
      const repo = makeRepo();
      const company = await saveSample(repo, { type: 'company' });
      await saveSample(repo, { type: 'patient' });

      const result = await repo.listByAreaAndType('consolidados', 'company');
      expect(result.map((t) => t.id)).toEqual([company.id]);
    });

    it('listDeletedByArea returns only soft-deleted templates for the area (trash view)', async () => {
      const repo = makeRepo();
      const active = await saveSample(repo, { name: 'A', type: 'company' });
      const deleted1 = await saveSample(repo, { name: 'B', type: 'company' });
      const deleted2 = await saveSample(repo, { name: 'C', type: 'patient' });
      await repo.softDelete(deleted1.id);
      await repo.softDelete(deleted2.id);

      const trash = await repo.listDeletedByArea('consolidados');
      const ids = trash.map((t) => t.id).sort();
      expect(ids).toEqual([deleted1.id, deleted2.id].sort());
      expect(trash.find((t) => t.id === active.id)).toBeUndefined();
      for (const t of trash) {
        expect(t.deletedAt).not.toBeNull();
      }
    });

    it('listDeletedByArea returns an empty array when no templates are soft-deleted', async () => {
      const repo = makeRepo();
      await saveSample(repo, { name: 'A' });

      const trash = await repo.listDeletedByArea('consolidados');
      expect(trash).toEqual([]);
    });

    it('listDeletedByArea filters by area (excludes other areas)', async () => {
      const repo = makeRepo();
      await saveSample(repo, { name: 'A', area: 'consolidados' });
      const other = await saveSample(repo, { name: 'B', area: 'other-area' });
      await repo.softDelete(other.id);

      const trash = await repo.listDeletedByArea('consolidados');
      expect(trash).toEqual([]);
    });
  });

  describe('soft delete + default clearing', () => {
    it('soft delete sets deletedAt and excludes the template from active lists', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo);
      await repo.softDelete(t.id);

      const fetched = await repo.getById(t.id);
      expect(fetched?.deletedAt).not.toBeNull();
      const active = await repo.listByAreaAndType('consolidados', 'company');
      expect(active.map((x) => x.id)).not.toContain(t.id);
    });

    it('soft-deleting a default clears isDefault (no auto-promotion)', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo, { isDefault: true });
      expect(t.isDefault).toBe(true);

      await repo.softDelete(t.id);

      const fetched = await repo.getById(t.id);
      expect(fetched?.isDefault).toBe(false);
    });

    it('softDelete on a missing id throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      await expect(repo.softDelete('nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('restore', () => {
    it('restore clears deletedAt and the template reappears in active lists', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo);
      await repo.softDelete(t.id);
      await repo.restore(t.id);

      const fetched = await repo.getById(t.id);
      expect(fetched?.deletedAt).toBeNull();
      const active = await repo.listByAreaAndType('consolidados', 'company');
      expect(active.map((x) => x.id)).toContain(t.id);
    });

    it('restore does NOT re-default a previously-default template', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo, { isDefault: true });
      await repo.softDelete(t.id); // clears default
      await repo.restore(t.id);

      const fetched = await repo.getById(t.id);
      expect(fetched?.isDefault).toBe(false);
    });

    it('restore on a missing id throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      await expect(repo.restore('nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('clone', () => {
    it('clones an active template into a new active, non-default template copying content', async () => {
      const repo = makeRepo();
      const original = await saveSample(repo, {
        subject: 'orig subject',
        bodyHtml: '<p>orig</p>',
        isDefault: true,
      });

      const cloned = await repo.clone(original.id);

      expect(cloned.id).not.toBe(original.id);
      expect(cloned.subject).toBe('orig subject');
      expect(cloned.bodyHtml).toBe('<p>orig</p>');
      expect(cloned.isDefault).toBe(false);
      expect(cloned.deletedAt).toBeNull();
      expect(cloned.currentVersionId).not.toBeNull();
    });

    it('clones a soft-deleted template into a new active template', async () => {
      const repo = makeRepo();
      const original = await saveSample(repo, {
        subject: 'trashed',
        bodyHtml: '<p>trashed</p>',
      });
      await repo.softDelete(original.id);

      const cloned = await repo.clone(original.id);
      expect(cloned.deletedAt).toBeNull();
      expect(cloned.subject).toBe('trashed');
      const orig = await repo.getById(original.id);
      expect(orig?.deletedAt).not.toBeNull();
    });

    it('clone on a missing id throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      await expect(repo.clone('nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('setDefault + uniqueness', () => {
    it('setDefault clears the previous default and sets the new one (same area+type)', async () => {
      const repo = makeRepo();
      const a = await saveSample(repo, { name: 'A', isDefault: true });
      const b = await saveSample(repo, { name: 'B' });

      await repo.setDefault(b.id);

      const aFetched = await repo.getById(a.id);
      const bFetched = await repo.getById(b.id);
      expect(aFetched?.isDefault).toBe(false);
      expect(bFetched?.isDefault).toBe(true);
    });

    it('setDefault does not affect defaults of a different area+type', async () => {
      const repo = makeRepo();
      const company = await saveSample(repo, { type: 'company', isDefault: true });
      const patient = await saveSample(repo, { type: 'patient', isDefault: true });

      const company2 = await saveSample(repo, { type: 'company' });
      await repo.setDefault(company2.id);

      const patientFetched = await repo.getById(patient.id);
      expect(patientFetched?.isDefault).toBe(true);
      const companyFetched = await repo.getById(company.id);
      expect(companyFetched?.isDefault).toBe(false);
    });

    it('setDefault on a missing id throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      await expect(repo.setDefault('nope')).rejects.toThrow(TemplateNotFoundError);
    });
  });

  describe('listVersions', () => {
    it('returns versions ordered by editedAt desc, then versionId desc (tiebreaker)', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo, { subject: 'first' });
      await repo.save({
        id: t.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'second',
        bodyHtml: '<p>2</p>',
      });
      await repo.save({
        id: t.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'third',
        bodyHtml: '<p>3</p>',
      });

      const versions = await repo.listVersions(t.id);
      expect(versions).toHaveLength(3);
      expect(versions[0]?.subject).toBe('third');
      expect(versions[2]?.subject).toBe('first');
    });

    it('returns an empty array for a template with no versions', async () => {
      const repo = makeRepo();
      expect(await repo.listVersions('nope')).toEqual([]);
    });
  });

  describe('rollback (append-only)', () => {
    it('rollback copies the target version into a new version and updates currentVersionId', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo, { subject: 'v1' });
      const v1Id = t.currentVersionId;
      const updated = await repo.save({
        id: t.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'v2',
        bodyHtml: '<p>v2</p>',
      });
      const v2Id = updated.currentVersionId;

      const rolled = await repo.rollback(t.id, v1Id!);

      expect(rolled.currentVersionId).not.toBe(v1Id);
      expect(rolled.currentVersionId).not.toBe(v2Id);
      expect(rolled.subject).toBe('v1');

      const versions = await repo.listVersions(t.id);
      expect(versions).toHaveLength(3);
      const v1Row = versions.find((v) => v.versionId === v1Id);
      const v2Row = versions.find((v) => v.versionId === v2Id);
      expect(v1Row?.subject).toBe('v1');
      expect(v2Row?.subject).toBe('v2');
    });

    it('rollback on a missing version throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo);
      await expect(repo.rollback(t.id, 'no-such-version')).rejects.toThrow(
        TemplateNotFoundError,
      );
    });

    it('rollback on a missing template throws TemplateNotFoundError', async () => {
      const repo = makeRepo();
      await expect(repo.rollback('nope', 'whatever')).rejects.toThrow(
        TemplateNotFoundError,
      );
    });
  });

  describe('ITemplateRepository conformance', () => {
    it('implements every method of the port', () => {
      const repo: ITemplateRepository = makeRepo();
      const methods: (keyof ITemplateRepository)[] = [
        'listByArea',
        'listByAreaAndType',
        'listDeletedByArea',
        'getById',
        'save',
        'softDelete',
        'restore',
        'clone',
        'setDefault',
        'listVersions',
        'rollback',
      ];
      for (const m of methods) {
        expect(typeof repo[m]).toBe('function');
      }
    });
  });

  describe('transaction wiring (mssql.Transaction semantics)', () => {
    it('wraps save (update) in a transaction that begins + commits', async () => {
      const repo = makeRepo();
      const created = await saveSample(repo, { subject: 'v1' });
      const txCountBefore = pool.transactions.length;
      await repo.save({
        id: created.id,
        area: 'consolidados',
        type: 'company',
        name: 'Welcome',
        subject: 'v2',
        bodyHtml: '<p>v2</p>',
      });
      const txCountAfter = pool.transactions.length;
      expect(txCountAfter).toBeGreaterThan(txCountBefore);
      const lastTx = pool.transactions[txCountAfter - 1]!;
      expect(lastTx.begin).toHaveBeenCalled();
      expect(lastTx.commit).toHaveBeenCalled();
      expect(lastTx.rollback).not.toHaveBeenCalled();
    });

    it('rolls back and rethrows when an inner UPDATE throws', async () => {
      const repo = makeRepo();
      const created = await saveSample(repo, { subject: 'v1' });
      const txCountBefore = pool.transactions.length;

      // Force every `new mssql.Request(tx)` to throw on the first UPDATE
      // SQL it sees. The adapter swallows no error so the transaction
      // must call rollback and rethrow.
      let injected = false;
      const FailingRequest = class implements MockRequest {
        inputs: Record<string, unknown> = {};
        input = vi.fn().mockImplementation((name: string, value: unknown) => {
          this.inputs[name] = value;
          return this;
        });
        query = vi.fn().mockImplementation((sql: string) => {
          if (!injected && /^UPDATE\s+DBO\.TEMPLATES/i.test(sql.trim())) {
            injected = true;
            return Promise.reject(new Error('boom'));
          }
          return Promise.resolve({ recordset: [], rowsAffected: 0 });
        });
        batch = vi.fn().mockResolvedValue({ recordset: [], rowsAffected: [0] });
        execute = vi.fn().mockResolvedValue({ recordset: [], rowsAffected: 0 });
      };
      const previous = mockState.getRequestCtor();
      mockState.setRequestCtor(FailingRequest as unknown as new () => MockRequest);

      try {
        await expect(
          repo.save({
            id: created.id,
            area: 'consolidados',
            type: 'company',
            name: 'Welcome',
            subject: 'v2',
            bodyHtml: '<p>v2</p>',
          }),
        ).rejects.toThrow('boom');
        const txCountAfter = pool.transactions.length;
        expect(txCountAfter).toBeGreaterThan(txCountBefore);
        const lastTx = pool.transactions[txCountAfter - 1]!;
        expect(lastTx.rollback).toHaveBeenCalled();
        expect(lastTx.commit).not.toHaveBeenCalled();
        const row = pool.tables.templates.get(created.id);
        expect(row?.subject).toBe('v1');
      } finally {
        mockState.setRequestCtor(previous);
      }
    });
  });

  describe('date mapping (DATETIME2 -> ISO string)', () => {
    it('maps DATETIME2 columns to ISO strings on read', async () => {
      const repo = makeRepo();
      const created = await saveSample(repo);

      expect(typeof created.createdAt).toBe('string');
      expect(typeof created.updatedAt).toBe('string');
      expect(created.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(created.updatedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('maps version editedAt to an ISO string', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo);
      const versions = await repo.listVersions(t.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.editedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('preserves a soft-deleted deletedAt as a non-null ISO string', async () => {
      const repo = makeRepo();
      const t = await saveSample(repo);
      await repo.softDelete(t.id);
      const fetched = await repo.getById(t.id);
      expect(fetched?.deletedAt).not.toBeNull();
      expect(fetched?.deletedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });
  });
});
