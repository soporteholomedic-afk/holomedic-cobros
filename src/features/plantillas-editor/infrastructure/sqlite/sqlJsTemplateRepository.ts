import { randomUUID } from 'node:crypto';

import type initSqlJs from 'sql.js';

import type {
  SaveTemplateInput,
  SpitchType,
  Template,
  TemplateVersion,
} from '../../domain/entities';
import type { ITemplateRepository } from '../../domain/ports';

import { TemplateNotFoundError } from './betterSqliteTemplateRepository';

/**
 * Re-exported so callers can `import { TemplateNotFoundError } from
 * './sqlJsTemplateRepository'` without reaching into the better-sqlite3
 * module. Both adapters throw the SAME error type so PR 2's use cases catch
 * one symbol regardless of the active driver.
 */
export { TemplateNotFoundError };

type SqlJsDatabase = initSqlJs.Database;
type SqlValue = initSqlJs.SqlValue;
type Row = Record<string, SqlValue>;

function asString(v: SqlValue): string {
  // TEXT columns always come back as strings; the cast is structural.
  return v as string;
}

function asNullableString(v: SqlValue): string | null {
  return v === null ? null : (v as string);
}

function rowToTemplate(row: Row): Template {
  const template: Template = {
    id: asString(row.id),
    area: asString(row.area),
    // We own every write to `type`, so the stored string is a SpitchType.
    type: asString(row.type) as SpitchType,
    name: asString(row.name),
    subject: asString(row.subject),
    bodyHtml: asString(row.bodyHtml),
    isDefault: row.isDefault === 1,
    currentVersionId: asNullableString(row.currentVersionId),
    deletedAt: asNullableString(row.deletedAt),
    createdAt: asString(row.createdAt),
    updatedAt: asString(row.updatedAt),
  };
  if (row.ownerId !== null) {
    template.ownerId = asString(row.ownerId);
  }
  return template;
}

function rowToVersion(row: Row): TemplateVersion {
  const version: TemplateVersion = {
    versionId: asString(row.versionId),
    templateId: asString(row.templateId),
    subject: asString(row.subject),
    bodyHtml: asString(row.bodyHtml),
    editedAt: asString(row.editedAt),
  };
  if (row.editedBy !== null) {
    version.editedBy = asString(row.editedBy);
  }
  return version;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * sql.js (WASM) fallback adapter for the template store. Implements the
 * SAME `ITemplateRepository` as the primary better-sqlite3 adapter so the
 * factory can swap drivers via `TEMPLATE_DB_DRIVER` without touching call
 * sites.
 *
 * Unlike the native adapter, sql.js holds the database in WASM memory, so
 * every mutation MUST call `persist()` to flush `db.export()` to disk (the
 * factory wires `persist` to `fs.writeFile`). Reads never mutate, so they
 * do NOT persist. Multi-statement mutations run inside an explicit
 * `BEGIN`/`COMMIT` transaction (sql.js has no `db.transaction()` helper).
 */
export class SqlJsTemplateRepository implements ITemplateRepository {
  constructor(
    private readonly db: SqlJsDatabase,
    private readonly persist: () => void,
  ) {}

  // --- helpers ---

  /** Run a single write statement (INSERT/UPDATE/DELETE) with bound params. */
  private run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params);
  }

  /** Query rows as objects (prepared statement + step + getAsObject + free). */
  private queryAll(sql: string, params: SqlValue[] = []): Row[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows: Row[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as Row);
    }
    stmt.free();
    return rows;
  }

  private queryOne(sql: string, params: SqlValue[] = []): Row | undefined {
    return this.queryAll(sql, params)[0];
  }

  /** Wrap a multi-statement mutation in BEGIN/COMMIT; ROLLBACK on error. */
  private tx<T>(fn: () => T): T {
    this.run('BEGIN TRANSACTION');
    try {
      const result = fn();
      this.run('COMMIT');
      return result;
    } catch (err) {
      try {
        this.run('ROLLBACK');
      } catch {
        // The transaction may already be in a broken state; the rethrow is
        // what matters. Swallow the rollback error so the original cause
        // surfaces cleanly.
      }
      throw err;
    }
  }

  private getRow(id: string): Row | undefined {
    return this.queryOne('SELECT * FROM templates WHERE id = ?', [id]);
  }

  private getRowOrThrow(id: string): Template {
    const row = this.getRow(id);
    if (!row) {
      // Unreachable after a successful write — defensive only.
      throw new Error(`post-write row missing for id=${id}`);
    }
    return rowToTemplate(row);
  }

  // --- reads (no persist) ---

  async listByArea(area: string): Promise<Template[]> {
    return this
      .queryAll(
        'SELECT * FROM templates WHERE area = ? AND deletedAt IS NULL ORDER BY updatedAt DESC',
        [area],
      )
      .map(rowToTemplate);
  }

  async listByAreaAndType(area: string, type: SpitchType): Promise<Template[]> {
    return this
      .queryAll(
        'SELECT * FROM templates WHERE area = ? AND type = ? AND deletedAt IS NULL ORDER BY updatedAt DESC',
        [area, type],
      )
      .map(rowToTemplate);
  }

  async getById(id: string): Promise<Template | null> {
    const row = this.getRow(id);
    return row ? rowToTemplate(row) : null;
  }

  async listVersions(templateId: string): Promise<TemplateVersion[]> {
    // `rowid DESC` tiebreaker keeps order deterministic when several saves
    // share a millisecond (sql.js rowid reflects insertion order).
    return this
      .queryAll(
        'SELECT * FROM template_versions WHERE templateId = ? ORDER BY editedAt DESC, rowid DESC',
        [templateId],
      )
      .map(rowToVersion);
  }

  // --- writes (persist after success) ---

  async save(input: SaveTemplateInput): Promise<Template> {
    const now = nowIso();

    if (input.id === undefined) {
      const id = randomUUID();
      const versionId = randomUUID();
      const isDefault = input.isDefault ?? false;
      this.tx(() => {
        this.run(
          `INSERT INTO templates (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt, ownerId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
          [
            id,
            input.area,
            input.type,
            input.name,
            input.subject,
            input.bodyHtml,
            isDefault ? 1 : 0,
            versionId,
            now,
            now,
          ],
        );
        this.run(
          `INSERT INTO template_versions (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
           VALUES (?, ?, ?, ?, ?, NULL)`,
          [versionId, id, input.subject, input.bodyHtml, now],
        );
      });
      this.persist();
      return this.getRowOrThrow(id);
    }

    const existing = this.getRow(input.id);
    if (!existing) throw new TemplateNotFoundError(input.id);
    const versionId = randomUUID();
    const isDefault = input.isDefault ?? existing.isDefault === 1;
    this.tx(() => {
      this.run(
        `INSERT INTO template_versions (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [versionId, input.id, input.subject, input.bodyHtml, now],
      );
      // area/type immutable; name updatable; isDefault persisted only when
      // the caller passes it so default changes route through setDefault.
      this.run(
        `UPDATE templates SET name = ?, subject = ?, bodyHtml = ?, currentVersionId = ?, isDefault = ?, updatedAt = ? WHERE id = ?`,
        [
          input.name,
          input.subject,
          input.bodyHtml,
          versionId,
          isDefault ? 1 : 0,
          now,
          input.id,
        ],
      );
    });
    this.persist();
    return this.getRowOrThrow(input.id);
  }

  async softDelete(id: string): Promise<void> {
    const existing = this.getRow(id);
    if (!existing) throw new TemplateNotFoundError(id);
    const now = nowIso();
    this.run(
      'UPDATE templates SET deletedAt = ?, isDefault = 0, updatedAt = ? WHERE id = ?',
      [now, now, id],
    );
    this.persist();
  }

  async restore(id: string): Promise<void> {
    const existing = this.getRow(id);
    if (!existing) throw new TemplateNotFoundError(id);
    const now = nowIso();
    this.run(
      'UPDATE templates SET deletedAt = NULL, updatedAt = ? WHERE id = ?',
      [now, id],
    );
    this.persist();
  }

  async clone(id: string): Promise<Template> {
    const source = this.getRow(id);
    if (!source) throw new TemplateNotFoundError(id);
    const newId = randomUUID();
    const versionId = randomUUID();
    const now = nowIso();
    this.tx(() => {
      this.run(
        `INSERT INTO templates (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt, ownerId)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, ?, NULL)`,
        [
          newId,
          asString(source.area),
          asString(source.type),
          asString(source.name),
          asString(source.subject),
          asString(source.bodyHtml),
          versionId,
          now,
          now,
        ],
      );
      this.run(
        `INSERT INTO template_versions (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [versionId, newId, asString(source.subject), asString(source.bodyHtml), now],
      );
    });
    this.persist();
    return this.getRowOrThrow(newId);
  }

  async setDefault(id: string): Promise<void> {
    const target = this.getRow(id);
    if (!target) throw new TemplateNotFoundError(id);
    const now = nowIso();
    this.tx(() => {
      // Clear-then-set: the previous default is cleared BEFORE the new one
      // is set so the partial unique index stays satisfied.
      this.run(
        `UPDATE templates SET isDefault = 0, updatedAt = ? WHERE area = ? AND type = ? AND isDefault = 1 AND deletedAt IS NULL`,
        [now, asString(target.area), asString(target.type)],
      );
      this.run('UPDATE templates SET isDefault = 1, updatedAt = ? WHERE id = ?', [
        now,
        id,
      ]);
    });
    this.persist();
  }

  async rollback(templateId: string, versionId: string): Promise<Template> {
    const template = this.getRow(templateId);
    if (!template) throw new TemplateNotFoundError(templateId);
    const target = this.queryOne(
      'SELECT * FROM template_versions WHERE versionId = ? AND templateId = ?',
      [versionId, templateId],
    );
    if (!target) throw new TemplateNotFoundError(versionId);
    const newVersionId = randomUUID();
    const now = nowIso();
    this.tx(() => {
      // Append-only: copy the target's content into a NEW version row.
      this.run(
        `INSERT INTO template_versions (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [
          newVersionId,
          templateId,
          asString(target.subject),
          asString(target.bodyHtml),
          now,
        ],
      );
      this.run(
        'UPDATE templates SET subject = ?, bodyHtml = ?, currentVersionId = ?, updatedAt = ? WHERE id = ?',
        [asString(target.subject), asString(target.bodyHtml), newVersionId, now, templateId],
      );
    });
    this.persist();
    return this.getRowOrThrow(templateId);
  }
}
