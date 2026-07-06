import type { TemplateVersion } from '../domain/entities';
import type { ITemplateRepository } from '../domain/ports';

/**
 * Use case: list all versions of a template.
 *
 * Spec: `email-template-store` / "Save appends version" (the history this use
 * case lists); `email-template-editor` / "Rollback to a previous version"
 * (the UI lists versions before rolling back).
 *
 * Thin orchestrator over `ITemplateRepository.listVersions`. The adapter
 * returns every `template_versions` row for the template, ordered by
 * `editedAt` DESC (with a `rowid DESC` tiebreaker for sub-ms determinism —
 * PR 1). The use case does NOT re-sort or filter — it preserves the adapter's
 * order so the rollback UI shows the most recent version first.
 */
export class ListVersionsUseCase {
  constructor(private readonly repo: ITemplateRepository) {}

  async execute(templateId: string): Promise<TemplateVersion[]> {
    return this.repo.listVersions(templateId);
  }
}
