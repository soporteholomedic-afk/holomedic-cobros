import type { Template } from '../domain/entities';
import type { ITemplateRepository } from '../domain/ports';

/**
 * Use case: clone a template into a new active template.
 *
 * Spec: `email-template-store` / "Clone copies content to new active template";
 * `email-template-editor` / "Clone an active template" + "Clone a soft-deleted
 * template".
 *
 * Thin orchestrator over `ITemplateRepository.clone`. The adapter creates a
 * NEW active, non-default template (`isDefault:false`, `deletedAt:null`) with
 * a fresh id, copying `subject`/`bodyHtml`. Clone works on active OR
 * soft-deleted sources — the adapter reads even soft-deleted rows (the
 * `getById` contract), so the use case does not pre-check status.
 *
 * `TemplateNotFoundError` (source missing) propagates so the route maps it to
 * HTTP 404.
 */
export class CloneTemplateUseCase {
  constructor(private readonly repo: ITemplateRepository) {}

  async execute(sourceId: string): Promise<Template> {
    return this.repo.clone(sourceId);
  }
}
