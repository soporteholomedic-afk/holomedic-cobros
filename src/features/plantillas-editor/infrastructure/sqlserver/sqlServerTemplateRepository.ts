import { randomUUID } from 'node:crypto';

import mssql from 'mssql';

import type {
  SaveTemplateInput,
  SpitchType,
  Template,
  TemplateVersion,
} from '../../domain/entities';
import type { ITemplateRepository } from '../../domain/ports';

import { TemplateNotFoundError } from './errors';

/**
 * Raw `dbo.templates` row shape as returned by mssql. `isDefault` is a
 * BIT (0/1) and projected to `boolean`; `DATETIME2` columns come back
 * as `Date` objects and are converted to ISO strings at the boundary
 * so the entity contract stays string-based.
 */
interface TemplateRow {
  id: string;
  area: string;
  type: string;
  name: string;
  subject: string;
  bodyHtml: string;
  isDefault: boolean;
  currentVersionId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string | null;
}

/** Raw `dbo.template_versions` row shape. */
interface VersionRow {
  versionId: string;
  templateId: string;
  subject: string;
  bodyHtml: string;
  editedAt: Date;
  editedBy: string | null;
}

/** Convert a `Date` to an ISO-8601 string (with milliseconds). */
function dateToIso(value: Date): string {
  return value.toISOString();
}

/** Convert a `Date | null` to an ISO-8601 string or `null`. */
function dateToIsoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/** Map a `dbo.templates` row to the `Template` entity. */
function rowToTemplate(row: TemplateRow): Template {
  const template: Template = {
    id: row.id,
    area: row.area,
    // We own every write to `templates.type`, so the stored string is
    // one of the two `SpitchType` literals — the assertion is structural.
    type: row.type as SpitchType,
    name: row.name,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    isDefault: row.isDefault === true,
    currentVersionId: row.currentVersionId,
    deletedAt: dateToIsoOrNull(row.deletedAt),
    createdAt: dateToIso(row.createdAt),
    updatedAt: dateToIso(row.updatedAt),
  };
  if (row.ownerId !== null) {
    template.ownerId = row.ownerId;
  }
  return template;
}

function rowToVersion(row: VersionRow): TemplateVersion {
  const version: TemplateVersion = {
    versionId: row.versionId,
    templateId: row.templateId,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    editedAt: dateToIso(row.editedAt),
  };
  if (row.editedBy !== null) {
    version.editedBy = row.editedBy;
  }
  return version;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * SQL Server adapter for the template store. Implements the same
 * `ITemplateRepository` port as the legacy SQLite adapters so the
 * factory can swap storage backends without touching call sites.
 *
 * Multi-statement mutations (`save`, `clone`, `setDefault`, `rollback`)
 * run inside an explicit `mssql.Transaction` so the append-only
 * versioning + snapshot update, and the clear-then-set default dance,
 * are atomic. `listVersions` orders by `editedAt DESC, versionId DESC`
 * (a UUID tiebreaker — SQL Server has no implicit `rowid` column we
 * can rely on, and UUIDs are time-ordered-ish enough to keep the order
 * deterministic across sub-ms saves).
 *
 * The adapter assumes `migrate()` has already been run against `pool`
 * (the factory in `getTemplateDb` does this).
 */
export class SqlServerTemplateRepository implements ITemplateRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  // --- helpers ---

  /**
   * Run a single SELECT and return the first row, or `undefined`. mssql
   * typings make `recordset[0]` a `RecordSet` which TS can't safely
   * index, so we cast through `unknown` to a known row shape — the
   * SQL and the row type are coupled by the same author.
   */
  private async fetchOne<T>(sql: string, inputs: Record<string, unknown>): Promise<T | undefined> {
    const result = await this.runQuery(sql, inputs);
    const rows = result.recordset as unknown as T[];
    return rows[0];
  }

  private async runQuery(
    sql: string,
    inputs: Record<string, unknown>,
  ): Promise<mssql.IResult<unknown>> {
    const request = this.pool.request();
    for (const [name, value] of Object.entries(inputs)) {
      request.input(name, value as mssql.ISqlType);
    }
    return request.query(sql);
  }

  private async runMutate(
    sql: string,
    inputs: Record<string, unknown>,
  ): Promise<mssql.IResult<unknown>> {
    return this.runQuery(sql, inputs);
  }

  /**
   * Run `fn` inside an `mssql.Transaction`. On success, the transaction
   * commits; on throw, it rolls back and the original error rethrows.
   * The ROLLBACK is best-effort — if the connection is already broken
   * we swallow the secondary error so the original cause surfaces.
   */
  private async withTransaction<T>(fn: (tx: mssql.Transaction) => Promise<T>): Promise<T> {
    const tx = new mssql.Transaction(this.pool);
    await tx.begin();
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (err) {
      try {
        await tx.rollback();
      } catch {
        // The transaction may already be in a broken state; the rethrow
        // is what matters. Swallow the rollback error so the original
        // cause surfaces cleanly.
      }
      throw err;
    }
  }

  /** Build a typed `request` against an active transaction. */
  private txRequest(tx: mssql.Transaction): mssql.Request {
    return new mssql.Request(tx);
  }

  // --- reads ---

  async listByArea(area: string): Promise<Template[]> {
    const result = await this.runQuery(
      'SELECT * FROM dbo.templates WHERE area = @area AND deletedAt IS NULL ORDER BY updatedAt DESC',
      { area },
    );
    return (result.recordset as unknown as TemplateRow[]).map(rowToTemplate);
  }

  async listByAreaAndType(area: string, type: SpitchType): Promise<Template[]> {
    const result = await this.runQuery(
      'SELECT * FROM dbo.templates WHERE area = @area AND type = @type AND deletedAt IS NULL ORDER BY updatedAt DESC',
      { area, type },
    );
    return (result.recordset as unknown as TemplateRow[]).map(rowToTemplate);
  }

  async listDeletedByArea(area: string): Promise<Template[]> {
    // Trash view: the inverse of `listByArea` — only rows with a
    // non-null `deletedAt`. Active templates MUST be excluded so the
    // trash route cannot leak active templates into the recovery list.
    const result = await this.runQuery(
      'SELECT * FROM dbo.templates WHERE area = @area AND deletedAt IS NOT NULL ORDER BY updatedAt DESC',
      { area },
    );
    return (result.recordset as unknown as TemplateRow[]).map(rowToTemplate);
  }

  async getById(id: string): Promise<Template | null> {
    const row = await this.fetchOne<TemplateRow>('SELECT * FROM dbo.templates WHERE id = @id', {
      id,
    });
    return row ? rowToTemplate(row) : null;
  }

  async listVersions(templateId: string): Promise<TemplateVersion[]> {
    // `versionId DESC` is a deterministic tiebreaker when several saves
    // land in the same millisecond (UUIDs are not time-ordered but
    // randomUUID's v4 distribution makes collisions inside one
    // template effectively impossible — the order is stable enough
    // for the rollback UI).
    const result = await this.runQuery(
      'SELECT * FROM dbo.template_versions WHERE templateId = @templateId ORDER BY editedAt DESC, versionId DESC',
      { templateId },
    );
    return (result.recordset as unknown as VersionRow[]).map(rowToVersion);
  }

  // --- writes ---

  async save(input: SaveTemplateInput): Promise<Template> {
    if (input.id === undefined) {
      // CREATE — insert the template (current snapshot) + its first version
      // in one transaction so the pair never lands half-applied.
      const id = randomUUID();
      const versionId = randomUUID();
      const now = nowIso();
      const isDefault = input.isDefault ?? false;
      await this.withTransaction(async (tx) => {
        const req = this.txRequest(tx);
        req.input('id', id);
        req.input('area', input.area);
        req.input('type', input.type);
        req.input('name', input.name);
        req.input('subject', input.subject);
        req.input('bodyHtml', input.bodyHtml);
        req.input('isDefault', isDefault);
        req.input('versionId', versionId);
        req.input('now', now);
        await req.query(
          `INSERT INTO dbo.templates
             (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt, ownerId)
           VALUES
             (@id, @area, @type, @name, @subject, @bodyHtml, @isDefault, @versionId, NULL, @now, @now, NULL)`,
        );
        const verReq = this.txRequest(tx);
        verReq.input('versionId', versionId);
        verReq.input('templateId', id);
        verReq.input('subject', input.subject);
        verReq.input('bodyHtml', input.bodyHtml);
        verReq.input('now', now);
        await verReq.query(
          `INSERT INTO dbo.template_versions
             (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
           VALUES
             (@versionId, @templateId, @subject, @bodyHtml, @now, NULL)`,
        );
      });
      const created = await this.getById(id);
      if (!created) {
        // Defensive only — should never happen after a successful insert.
        throw new Error(`post-write row missing for id=${id}`);
      }
      return created;
    }

    // UPDATE — append a new version row, update the current snapshot in
    // one transaction. area/type are immutable (a template's audience
    // never changes); name IS updatable. isDefault is persisted only
    // when the caller passes it so default changes route through
    // `setDefault` (single transaction).
    const existing = await this.getById(input.id);
    if (!existing) throw new TemplateNotFoundError(input.id);
    const versionId = randomUUID();
    const now = nowIso();
    const isDefault = input.isDefault ?? existing.isDefault;
    await this.withTransaction(async (tx) => {
      const verReq = this.txRequest(tx);
      verReq.input('versionId', versionId);
      verReq.input('templateId', input.id);
      verReq.input('subject', input.subject);
      verReq.input('bodyHtml', input.bodyHtml);
      verReq.input('now', now);
      await verReq.query(
        `INSERT INTO dbo.template_versions
           (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
         VALUES
           (@versionId, @templateId, @subject, @bodyHtml, @now, NULL)`,
      );
      const updReq = this.txRequest(tx);
      updReq.input('name', input.name);
      updReq.input('subject', input.subject);
      updReq.input('bodyHtml', input.bodyHtml);
      updReq.input('versionId', versionId);
      updReq.input('isDefault', isDefault);
      updReq.input('now', now);
      updReq.input('id', input.id);
      await updReq.query(
        `UPDATE dbo.templates
           SET name = @name,
               subject = @subject,
               bodyHtml = @bodyHtml,
               currentVersionId = @versionId,
               isDefault = @isDefault,
               updatedAt = @now
         WHERE id = @id`,
      );
    });
    const updated = await this.getById(input.id);
    if (!updated) {
      // Defensive only — should never happen after a successful update.
      throw new Error(`post-write row missing for id=${input.id}`);
    }
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new TemplateNotFoundError(id);
    const now = nowIso();
    // Clear isDefault so the filtered unique index stops gating this row
    // and no auto-promotion occurs (spec: soft-deleting a default
    // clears it).
    await this.runMutate(
      'UPDATE dbo.templates SET deletedAt = @now, isDefault = 0, updatedAt = @now WHERE id = @id',
      { id, now },
    );
  }

  async restore(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) throw new TemplateNotFoundError(id);
    const now = nowIso();
    // Restore does NOT re-default — isDefault stays false (softDelete
    // cleared it).
    await this.runMutate(
      'UPDATE dbo.templates SET deletedAt = NULL, updatedAt = @now WHERE id = @id',
      { id, now },
    );
  }

  async clone(id: string): Promise<Template> {
    const source = await this.getById(id);
    if (!source) throw new TemplateNotFoundError(id);
    const newId = randomUUID();
    const versionId = randomUUID();
    const now = nowIso();
    // Clone works on active OR soft-deleted sources; the copy is always
    // active, non-default, with a fresh id and its own first version row.
    await this.withTransaction(async (tx) => {
      const insReq = this.txRequest(tx);
      insReq.input('id', newId);
      insReq.input('area', source.area);
      insReq.input('type', source.type);
      insReq.input('name', source.name);
      insReq.input('subject', source.subject);
      insReq.input('bodyHtml', source.bodyHtml);
      insReq.input('versionId', versionId);
      insReq.input('now', now);
      await insReq.query(
        `INSERT INTO dbo.templates
           (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt, ownerId)
         VALUES
           (@id, @area, @type, @name, @subject, @bodyHtml, 0, @versionId, NULL, @now, @now, NULL)`,
      );
      const verReq = this.txRequest(tx);
      verReq.input('versionId', versionId);
      verReq.input('templateId', newId);
      verReq.input('subject', source.subject);
      verReq.input('bodyHtml', source.bodyHtml);
      verReq.input('now', now);
      await verReq.query(
        `INSERT INTO dbo.template_versions
           (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
         VALUES
           (@versionId, @templateId, @subject, @bodyHtml, @now, NULL)`,
      );
    });
    const cloned = await this.getById(newId);
    if (!cloned) {
      // Defensive only — should never happen after a successful insert.
      throw new Error(`post-write row missing for id=${newId}`);
    }
    return cloned;
  }

  async setDefault(id: string): Promise<void> {
    const target = await this.getById(id);
    if (!target) throw new TemplateNotFoundError(id);
    const now = nowIso();
    // Clear-then-set in ONE transaction. Order matters: clearing the
    // previous default first keeps the filtered unique index satisfied
    // when the new row is flipped to isDefault=1.
    await this.withTransaction(async (tx) => {
      const clearReq = this.txRequest(tx);
      clearReq.input('now', now);
      clearReq.input('area', target.area);
      clearReq.input('type', target.type);
      await clearReq.query(
        `UPDATE dbo.templates
           SET isDefault = 0, updatedAt = @now
         WHERE area = @area AND type = @type AND isDefault = 1 AND deletedAt IS NULL`,
      );
      const setReq = this.txRequest(tx);
      setReq.input('now', now);
      setReq.input('id', id);
      await setReq.query(
        'UPDATE dbo.templates SET isDefault = 1, updatedAt = @now WHERE id = @id',
      );
    });
  }

  async rollback(templateId: string, versionId: string): Promise<Template> {
    const template = await this.getById(templateId);
    if (!template) throw new TemplateNotFoundError(templateId);
    const target = await this.fetchOne<VersionRow>(
      'SELECT * FROM dbo.template_versions WHERE versionId = @versionId AND templateId = @templateId',
      { versionId, templateId },
    );
    if (!target) throw new TemplateNotFoundError(versionId);
    const newVersionId = randomUUID();
    const now = nowIso();
    // Append-only: COPY the target's content into a NEW version row;
    // never mutate or delete existing version rows. Update the snapshot
    // + current in one transaction so a failed update doesn't leave a
    // dangling version row.
    await this.withTransaction(async (tx) => {
      const verReq = this.txRequest(tx);
      verReq.input('versionId', newVersionId);
      verReq.input('templateId', templateId);
      verReq.input('subject', target.subject);
      verReq.input('bodyHtml', target.bodyHtml);
      verReq.input('now', now);
      await verReq.query(
        `INSERT INTO dbo.template_versions
           (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
         VALUES
           (@versionId, @templateId, @subject, @bodyHtml, @now, NULL)`,
      );
      const updReq = this.txRequest(tx);
      updReq.input('subject', target.subject);
      updReq.input('bodyHtml', target.bodyHtml);
      updReq.input('versionId', newVersionId);
      updReq.input('now', now);
      updReq.input('id', templateId);
      await updReq.query(
        `UPDATE dbo.templates
           SET subject = @subject,
               bodyHtml = @bodyHtml,
               currentVersionId = @versionId,
               updatedAt = @now
         WHERE id = @id`,
      );
    });
    const rolled = await this.getById(templateId);
    if (!rolled) {
      // Defensive only — should never happen after a successful update.
      throw new Error(`post-write row missing for id=${templateId}`);
    }
    return rolled;
  }
}
