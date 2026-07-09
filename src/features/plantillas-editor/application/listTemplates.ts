import type { SpitchType, Template } from '../domain/entities';
import type { ITemplateRepository } from '../domain/ports';

/**
 * Use case: list templates for an area.
 *
 * Spec: `email-template-store` / "List active templates by area+type" +
 * "Trash view returns only soft-deleted".
 *
 * Two operations back the two list routes:
 *  - `listActive(area, type?)` — `GET /api/plantillas?area=&type=`. When
 *    `type` is provided, delegates to `listByAreaAndType`; otherwise to
 *    `listByArea` (all types). Both exclude soft-deleted at the SQL level.
 *  - `listTrash(area)` — `GET /api/plantillas/trash?area=`. Delegates to
 *    `listDeletedByArea` (the inverse filter; active templates excluded).
 *
 * The use case does not post-filter: the active/deleted split is enforced
 * in the adapter so the contract is testable at the SQL level (PR 1).
 */
export class ListTemplatesUseCase {
  constructor(private readonly repo: ITemplateRepository) {}

  /** Active templates for the area (optionally filtered by type). */
  async listActive(area: string, type?: SpitchType): Promise<Template[]> {
    return type === undefined
      ? this.repo.listByArea(area)
      : this.repo.listByAreaAndType(area, type);
  }

  /** Soft-deleted templates for the area (trash view). */
  async listTrash(area: string): Promise<Template[]> {
    return this.repo.listDeletedByArea(area);
  }
}
