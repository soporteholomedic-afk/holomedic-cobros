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
 *  - `BetterSqliteTemplateRepository` — primary adapter (native sync API,
 *    wrapped in Promises for the async interface).
 *  - `SqlJsTemplateRepository` — WASM fallback when the native addon cannot
 *    be built for the host Node version.
 *
 * The factory (`getTemplateDb`, task 1.10) selects the adapter at startup
 * via `TEMPLATE_DB_DRIVER`; swap is config, not code.
 *
 * Semantics enforced by the adapters (see spec `email-template-store`):
 *  - Active lists (`listByArea`/`listByAreaAndType`) exclude soft-deleted
 *    templates (`deletedAt IS NULL`).
 *  - `save` is append-only: it ALWAYS inserts a new `template_versions`
 *    row and updates `templates.currentVersionId` (+ denormalized
 *    `subject`/`bodyHtml`).
 *  - `rollback` copies the target version's content into a NEW version row;
 *    it MUST NOT mutate or delete existing version rows.
 *  - `setDefault` clears the previous default for `area+type` and sets the
 *    new one in a single transaction (the partial unique index
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
  'getById',
  'save',
  'softDelete',
  'restore',
  'clone',
  'setDefault',
  'listVersions',
  'rollback',
] as const;
