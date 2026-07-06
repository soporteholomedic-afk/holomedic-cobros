import type { ITemplateRepository } from '../domain/ports';

/**
 * Use case: mark a template as the default for its area+type.
 *
 * Spec: `email-template-store` / "Set default clears previous atomically";
 * `email-template-editor` / "Set default clears previous".
 *
 * Thin orchestrator over `ITemplateRepository.setDefault`. The adapter runs
 * clear-then-set in ONE transaction:
 *   1. clear `isDefault` for the area+type's current default (active rows only)
 *   2. set `isDefault=1` on the target row
 * so the partial unique index `idx_templates_default_area_type` (one default
 * per area+type among active) stays satisfied. Atomicity guarantees no
 * intermediate state has two defaults.
 *
 * `TemplateNotFoundError` (target template missing) propagates so the route
 * maps it to HTTP 404.
 */
export class SetDefaultTemplateUseCase {
  constructor(private readonly repo: ITemplateRepository) {}

  async execute(id: string): Promise<void> {
    await this.repo.setDefault(id);
  }
}
