import type { ITemplateRepository } from '../domain/ports';

/**
 * Use case: restore a soft-deleted template.
 *
 * Spec: `email-template-store` / "Restore clears deletedAt"; `email-template-editor`
 * / "Restore a soft-deleted template" (scenario: deletedAt cleared, template
 * reappears in active list, NOT re-marked as default).
 *
 * Thin orchestrator over `ITemplateRepository.restore`. The adapter clears
 * `deletedAt` (sets it to NULL) and does NOT re-default — `isDefault` stays
 * false because `softDelete` cleared it. The template then reappears in active
 * lists (`listByArea`/`listByAreaAndType`).
 *
 * `TemplateNotFoundError` (template missing) propagates so the route maps it
 * to HTTP 404.
 */
export class RestoreTemplateUseCase {
  constructor(private readonly repo: ITemplateRepository) {}

  async execute(id: string): Promise<void> {
    await this.repo.restore(id);
  }
}
