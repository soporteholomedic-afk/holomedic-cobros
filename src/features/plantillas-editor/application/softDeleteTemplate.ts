import type { ITemplateRepository } from '../domain/ports';

/**
 * Use case: soft-delete a template (recoverable).
 *
 * Spec: `email-template-store` / "Soft delete sets deletedAt" + "Soft-deleting
 * default clears default"; `email-template-editor` / "Soft delete removes from
 * active list".
 *
 * Thin orchestrator over `ITemplateRepository.softDelete`. The adapter sets
 * `deletedAt=now` AND clears `isDefault` in the SAME UPDATE if the template
 * was the default (no auto-promotion) — so the partial unique index stays
 * satisfied and the trashed template cannot remain a default. The template is
 * then excluded from active lists (`listByArea`/`listByAreaAndType`) and
 * appears in the trash view (`listDeletedByArea`).
 *
 * `TemplateNotFoundError` (template missing) propagates so the route maps it
 * to HTTP 404.
 */
export class SoftDeleteTemplateUseCase {
  constructor(private readonly repo: ITemplateRepository) {}

  async execute(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
