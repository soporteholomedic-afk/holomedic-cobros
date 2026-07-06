import type { SaveTemplateInput, Template } from '../domain/entities';
import type { ITemplateRepository } from '../domain/ports';

/**
 * Use case: save (create OR update) a template.
 *
 * Spec: `email-template-store` / "Save appends version"; `email-template-editor`
 * / "Save new template" + "Save existing template appends version".
 *
 * Thin orchestrator: the append-only versioning, the snapshot update, and
 * default-handling (when `isDefault` is provided) all live in the adapter so
 * they run inside the uniqueness-enforcing transaction. The use case
 * forwards `SaveTemplateInput` verbatim — it does NOT inject a default
 * `isDefault`, because that would erase the signal "caller wants this to be
 * the default" vs "caller doesn't care" (the adapter resolves `?? false`).
 *
 * Errors propagate: `TemplateNotFoundError` (thrown by `save` when updating
 * a missing id) and unique-constraint failures bubble up so the route can
 * map them to HTTP 404 / 500.
 */
export class SaveTemplateUseCase {
  constructor(private readonly repo: ITemplateRepository) {}

  async execute(input: SaveTemplateInput): Promise<Template> {
    return this.repo.save(input);
  }
}
