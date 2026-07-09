import type { Template } from '../domain/entities';
import type { ITemplateRepository } from '../domain/ports';

/**
 * Use case: roll a template back to a previous version.
 *
 * Spec: `email-template-store` / "Rollback is append-only"; `email-template-editor`
 * / "Rollback to a previous version".
 *
 * Thin orchestrator over `ITemplateRepository.rollback`. The adapter COPIES
 * the target version's `{subject, bodyHtml}` into a NEW `template_versions`
 * row (never mutating or deleting existing rows) and updates
 * `templates.currentVersionId` to the new version. Full history is preserved.
 *
 * `TemplateNotFoundError` (thrown by the adapter when the template or the
 * target version is missing) propagates so the route can map it to HTTP 404.
 */
export class RollbackTemplateUseCase {
  constructor(private readonly repo: ITemplateRepository) {}

  async execute(templateId: string, versionId: string): Promise<Template> {
    return this.repo.rollback(templateId, versionId);
  }
}
