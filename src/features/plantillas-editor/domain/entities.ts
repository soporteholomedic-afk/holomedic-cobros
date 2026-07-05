/**
 * Domain entities for the plantillas-editor feature.
 *
 * The template editor owns the FULL authoring model: `Template` carries
 * every authoring-only field (versioning, soft-delete, default marking)
 * the send flow never needs. The send flow consumes `SpitchDTO` — a
 * boundary projection that strips authoring fields — produced at the
 * `/api/plantillas` route (see PR 2). Keeping both shapes in this module
 * makes the projection contract explicit and compile-time checked.
 *
 * `SPITCH_TYPES` is a runtime const so the API route and tests can
 * validate a `SpitchType` value without duplicating the union.
 */

/** The two audiences a consolidados template can target. */
export const SPITCH_TYPES = ['company', 'patient'] as const;
export type SpitchType = (typeof SPITCH_TYPES)[number];

/**
 * The full authoring entity. `templates` table rows map to this. The
 * denormalized `subject`/`bodyHtml` hold the CURRENT snapshot (fast read
 * for the selector + interpolation); `template_versions` holds every
 * historical snapshot, referenced by `currentVersionId`.
 */
export interface Template {
  id: string;
  area: string;
  type: SpitchType;
  name: string;
  subject: string;
  bodyHtml: string;
  isDefault: boolean;
  currentVersionId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Reserved for future auth; nullable at the DB level. */
  ownerId?: string;
}

/** An immutable snapshot of a template's content at a point in time. */
export interface TemplateVersion {
  versionId: string;
  templateId: string;
  subject: string;
  bodyHtml: string;
  editedAt: string;
  /** Reserved for future auth. */
  editedBy?: string;
}

/**
 * Input shape for create OR update. `id` is omitted on create (a new
 * template id is generated); present on update. `isDefault` is optional
 * either way — `save` delegates default handling to the adapter so the
 * uniqueness invariant is enforced in one transaction.
 */
export interface SaveTemplateInput {
  id?: string;
  area: string;
  type: SpitchType;
  name: string;
  subject: string;
  bodyHtml: string;
  isDefault?: boolean;
}

/**
 * Boundary projection consumed by the send flow. Excludes every
 * authoring-only field so `envio-resultados` never sees versioning,
 * soft-delete, or default state.
 */
export interface SpitchDTO {
  id: string;
  area: string;
  type: SpitchType;
  name: string;
  subject: string;
  bodyHtml: string;
}

/**
 * Attributes for a token chip (BlockNote inline node + subject segment).
 *
 * - Simple token: `{ key: 'empresa' }` → `{{empresa}}`
 * - Table token: `{ key: 'tabla', table: 'documentosVencidos', cols: ['fecha','monto'] }`
 *   → `{{tabla:documentosVencidos:fecha,monto}}`
 */
export interface TokenAttrs {
  key: string;
  table?: string;
  cols?: string[];
}
