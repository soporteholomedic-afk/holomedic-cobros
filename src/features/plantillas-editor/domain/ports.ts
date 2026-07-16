import type {
  SaveTemplateInput,
  SpitchType,
  Template,
  TemplateVersion,
} from './entities';

/**
 * Hexagonal port for template persistence.
 *
 * Implementations:
 *  - `SqlServerTemplateRepository` — primary adapter, backed by the
 *    `HOLOMEDIC` database on SQL Server.
 *
 * The factory (`getTemplateDb`) opens the HOLOMEDIC pool via
 * `getHolomedicPool()`, runs the idempotent migrate, and returns the
 * adapter. Swap storage is no longer a config knob — the legacy
 * SQLite / sql.js backends have been removed and the spec
 * `email-template-store` is now SQL-Server-only.
 *
 * Semantics enforced by the adapter (see spec `email-template-store`):
 *  - Active lists (`listByArea`/`listByAreaAndType`) exclude soft-deleted
 *    templates (`deletedAt IS NULL`).
 *  - `save` is append-only: it ALWAYS inserts a new `template_versions`
 *    row and updates `templates.currentVersionId` (+ denormalized
 *    `subject`/`bodyHtml`).
 *  - `rollback` copies the target version's content into a NEW version row;
 *    it MUST NOT mutate or delete existing version rows.
 *  - `setDefault` clears the previous default for `area+type` and sets the
 *    new one in a single transaction (the filtered unique index
 *    `idx_templates_default_area_type` backs this at the DB level).
 *  - `softDelete` of a default clears `isDefault`; no auto-promotion.
 *  - `clone` works on active OR soft-deleted sources, always producing a
 *    new active, non-default template.
 */
export interface ITemplateRepository {
  /** Active templates for an area, excluding soft-deleted. */
  listByArea(area: string): Promise<Template[]>;
  /** Active templates for an area+type, excluding soft-deleted. */
  listByAreaAndType(area: string, type: SpitchType): Promise<Template[]>;
  /**
   * Soft-deleted templates for an area (trash view). Active templates
   * (`deletedAt IS NULL`) MUST be excluded. Backs the
   * `GET /api/plantillas/trash?area=` route.
   */
  listDeletedByArea(area: string): Promise<Template[]>;
  /** A single template by id (active OR soft-deleted), or null if missing. */
  getById(id: string): Promise<Template | null>;
  /** Insert OR update + append a new version row. Returns the saved template. */
  save(input: SaveTemplateInput): Promise<Template>;
  /** Set `deletedAt`; clears `isDefault` if the template was the default. */
  softDelete(id: string): Promise<void>;
  /** Clear `deletedAt`; does NOT re-default. */
  restore(id: string): Promise<void>;
  /** New active, non-default template copying content (works on soft-deleted sources). */
  clone(id: string): Promise<Template>;
  /** Clear prev default for area+type, set new — one transaction. */
  setDefault(id: string): Promise<void>;
  /** All versions for a template, ordered by `editedAt` desc. */
  listVersions(templateId: string): Promise<TemplateVersion[]>;
  /** Append a NEW version copying the target's content; returns the template. */
  rollback(templateId: string, versionId: string): Promise<Template>;
}

/**
 * Runtime registry of the port's operations. Single source of truth for
 * the method set — used by mock factories and adapter self-checks so a
 * renamed/missing method is caught at runtime, not just at compile time.
 */
export const TEMPLATE_REPOSITORY_METHODS = [
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
] as const;
