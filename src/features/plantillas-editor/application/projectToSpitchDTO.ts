import type { SpitchDTO, Template } from '../domain/entities';

/**
 * Boundary projection from the authoring entity (`Template`) to the
 * send-flow DTO (`SpitchDTO`).
 *
 * Spec: `email-template-store` / "Boundary projection to SpitchDTO".
 *
 * The send context (`envio-resultados`) never sees authoring-only
 * fields — versioning, soft-delete, default marking, timestamps, or
 * owner. This pure function is the ONLY shape that crosses the
 * `/api/plantillas` boundary, so `envio-resultados` stays decoupled
 * from `plantillas-editor`'s internal model (design Decision b).
 *
 * Pure: no side effects, no I/O — trivially testable and reusable
 * from both the active-list and trash-list routes.
 */
export function projectToSpitchDTO(tpl: Template): SpitchDTO {
  return {
    id: tpl.id,
    area: tpl.area,
    type: tpl.type,
    name: tpl.name,
    subject: tpl.subject,
    bodyHtml: tpl.bodyHtml,
  };
}
