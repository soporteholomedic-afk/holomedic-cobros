import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

import type {
  SaveTemplateInput,
  SpitchType,
  Template,
  TemplateVersion,
} from '../../domain/entities';
import type { ITemplateRepository } from '../../domain/ports';

/**
 * Thrown by mutating operations (`softDelete`, `restore`, `clone`,
 * `setDefault`, `rollback`) when the referenced template (or version) does
 * not exist. `getById` returns `null` instead (read contract). PR 2's use
 * cases catch this and map it to HTTP 404.
 */
export class TemplateNotFoundError extends Error {
  constructor(id: string) {
    super(`Template not found: ${id}`);
    this.name = 'TemplateNotFoundError';
  }
}

/** Raw `templates` row shape (SQLite stores booleans as 0/1 INTEGER). */
interface TemplateRow {
  id: string;
  area: string;
  type: string;
  name: string;
  subject: string;
  bodyHtml: string;
  isDefault: number;
  currentVersionId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ownerId: string | null;
}

/** Raw `template_versions` row shape. */
interface VersionRow {
  versionId: string;
  templateId: string;
  subject: string;
  bodyHtml: string;
  editedAt: string;
  editedBy: string | null;
}

/**
 * Map a `templates` row to the `Template` entity. `isDefault` is stored as
 * INTEGER (0/1) and projected to `boolean`. `ownerId` is only included when
 * non-null so the optional entity field stays `undefined` for unowned rows.
 */
function rowToTemplate(row: TemplateRow): Template {
  const template: Template = {
    id: row.id,
    area: row.area,
    // We own every write to `templates.type`, so the stored string is one of
    // the two `SpitchType` literals — the assertion is structural, not a guess.
    type: row.type as SpitchType,
    name: row.name,
    subject: row.subject,
    bodyHtml: row.bodyHtml,
    isDefault: row.isDefault === 1,
    currentVersionId: row.currentVersionId,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
    editedAt: row.editedAt,
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
 * better-sqlite3 adapter for the template store. Wraps the native sync API
 * in Promises to satisfy the async `ITemplateRepository` port. Every
 * multi-statement mutation runs inside a `db.transaction()` so the
 * append-only versioning + snapshot update, and the clear-then-set default
 * dance, are atomic.
 *
 * The adapter assumes `migrate()` has already been run against `db` (the
 * factory in `getTemplateDb` does this; tests use `createTestDb`).
 */
export class BetterSqliteTemplateRepository implements ITemplateRepository {
  constructor(private readonly db: Database.Database) {}

  // --- helpers ---

  private getRow(id: string): TemplateRow | undefined {
    return this.db
      .prepare('SELECT * FROM templates WHERE id = ?')
      .get(id) as TemplateRow | undefined;
  }

  /**
   * Return the entity for a row that was JUST inserted/updated in the same
   * call. The non-null assertion is structural: the preceding INSERT/UPDATE
   * transaction succeeded, so the row exists — the null branch is
   * unreachable. Centralising it here keeps the guarantee documented once
   * instead of sprinkling bare `!` across every mutation.
   */
  private getRowOrThrow(id: string): Template {
    const row = this.getRow(id);
    if (!row) {
      // Defensive only — should never happen after a successful write.
      throw new Error(`post-write row missing for id=${id}`);
    }
    return rowToTemplate(row);
  }

  // --- reads ---

  async listByArea(area: string): Promise<Template[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM templates WHERE area = ? AND deletedAt IS NULL ORDER BY updatedAt DESC',
      )
      .all(area) as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  async listByAreaAndType(area: string, type: SpitchType): Promise<Template[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM templates WHERE area = ? AND type = ? AND deletedAt IS NULL ORDER BY updatedAt DESC',
      )
      .all(area, type) as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  async getById(id: string): Promise<Template | null> {
    const row = this.getRow(id);
    return row ? rowToTemplate(row) : null;
  }

  async listVersions(templateId: string): Promise<TemplateVersion[]> {
    // `rowid DESC` is a deterministic tiebreaker when several saves land in
    // the same millisecond (common in fast in-memory tests) — later inserts
    // have a higher rowid, so the most-recent save still sorts first.
    const rows = this.db
      .prepare(
        'SELECT * FROM template_versions WHERE templateId = ? ORDER BY editedAt DESC, rowid DESC',
      )
      .all(templateId) as VersionRow[];
    return rows.map(rowToVersion);
  }

  // --- writes ---

  async save(input: SaveTemplateInput): Promise<Template> {
    const now = nowIso();

    if (input.id === undefined) {
      // CREATE — insert the template (current snapshot) + its first version.
      const id = randomUUID();
      const versionId = randomUUID();
      const isDefault = input.isDefault ?? false;
      const insert = this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO templates (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt, ownerId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
          )
          .run(
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
          );
        this.db
          .prepare(
            `INSERT INTO template_versions (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
             VALUES (?, ?, ?, ?, ?, NULL)`,
          )
          .run(versionId, id, input.subject, input.bodyHtml, now);
      });
      insert();
      return this.getRowOrThrow(id);
    }

    // UPDATE — append a new version row, update the current snapshot.
    const existing = this.getRow(input.id);
    if (!existing) throw new TemplateNotFoundError(input.id);
    const versionId = randomUUID();
    const isDefault = input.isDefault ?? existing.isDefault === 1;
    const update = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO template_versions (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
           VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(versionId, input.id, input.subject, input.bodyHtml, now);
      // area/type are immutable (a template's audience never changes); name
      // IS updatable. isDefault persisted only when the caller passes it so
      // default changes route through `setDefault` (single transaction).
      this.db
        .prepare(
          `UPDATE templates SET name = ?, subject = ?, bodyHtml = ?, currentVersionId = ?, isDefault = ?, updatedAt = ? WHERE id = ?`,
        )
        .run(
          input.name,
          input.subject,
          input.bodyHtml,
          versionId,
          isDefault ? 1 : 0,
          now,
          input.id,
        );
    });
    update();
    return this.getRowOrThrow(input.id);
  }

  async softDelete(id: string): Promise<void> {
    const existing = this.getRow(id);
    if (!existing) throw new TemplateNotFoundError(id);
    const now = nowIso();
    // Clear isDefault so the partial unique index stops gating this row and
    // no auto-promotion occurs (spec: soft-deleting a default clears it).
    this.db
      .prepare('UPDATE templates SET deletedAt = ?, isDefault = 0, updatedAt = ? WHERE id = ?')
      .run(now, now, id);
  }

  async restore(id: string): Promise<void> {
    const existing = this.getRow(id);
    if (!existing) throw new TemplateNotFoundError(id);
    const now = nowIso();
    // Restore does NOT re-default — isDefault stays false (softDelete cleared it).
    this.db
      .prepare('UPDATE templates SET deletedAt = NULL, updatedAt = ? WHERE id = ?')
      .run(now, id);
  }

  async clone(id: string): Promise<Template> {
    const source = this.getRow(id);
    if (!source) throw new TemplateNotFoundError(id);
    const newId = randomUUID();
    const versionId = randomUUID();
    const now = nowIso();
    // Clone works on active OR soft-deleted sources; the copy is always
    // active, non-default, with a fresh id and its own first version row.
    const insert = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO templates (id, area, type, name, subject, bodyHtml, isDefault, currentVersionId, deletedAt, createdAt, updatedAt, ownerId)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, ?, NULL)`,
        )
        .run(
          newId,
          source.area,
          source.type,
          source.name,
          source.subject,
          source.bodyHtml,
          versionId,
          now,
          now,
        );
      this.db
        .prepare(
          `INSERT INTO template_versions (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
           VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(versionId, newId, source.subject, source.bodyHtml, now);
    });
    insert();
    return this.getRowOrThrow(newId);
  }

  async setDefault(id: string): Promise<void> {
    const target = this.getRow(id);
    if (!target) throw new TemplateNotFoundError(id);
    const now = nowIso();
    // Clear-then-set in ONE transaction. Order matters: clearing the previous
    // default first keeps the partial unique index satisfied when the new row
    // is flipped to isDefault=1.
    const swap = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE templates SET isDefault = 0, updatedAt = ? WHERE area = ? AND type = ? AND isDefault = 1 AND deletedAt IS NULL`,
        )
        .run(now, target.area, target.type);
      this.db
        .prepare('UPDATE templates SET isDefault = 1, updatedAt = ? WHERE id = ?')
        .run(now, id);
    });
    swap();
  }

  async rollback(templateId: string, versionId: string): Promise<Template> {
    const template = this.getRow(templateId);
    if (!template) throw new TemplateNotFoundError(templateId);
    const target = this.db
      .prepare(
        'SELECT * FROM template_versions WHERE versionId = ? AND templateId = ?',
      )
      .get(versionId, templateId) as VersionRow | undefined;
    if (!target) throw new TemplateNotFoundError(versionId);
    const newVersionId = randomUUID();
    const now = nowIso();
    // Append-only: COPY the target's content into a NEW version row; never
    // mutate or delete existing version rows. Update the snapshot + current.
    const rollbackTx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO template_versions (versionId, templateId, subject, bodyHtml, editedAt, editedBy)
           VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(newVersionId, templateId, target.subject, target.bodyHtml, now);
      this.db
        .prepare(
          'UPDATE templates SET subject = ?, bodyHtml = ?, currentVersionId = ?, updatedAt = ? WHERE id = ?',
        )
        .run(target.subject, target.bodyHtml, newVersionId, now, templateId);
    });
    rollbackTx();
    return this.getRowOrThrow(templateId);
  }
}
