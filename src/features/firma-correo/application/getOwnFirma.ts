import type { FirmaCorreo } from '../domain/entities';
import type { IFirmaRepository } from '../domain/ports';

/**
 * GetOwnFirmaUseCase (editor-firmas task 1.5) — reads the caller's
 * own signature through the storage port. Pure passthrough: the
 * `FirmaCorreo | null` decision (no signature stored, or corrupt row
 * degraded by the codec) belongs to the port implementation; the API
 * route composes HTML from the result.
 *
 * Own-row-only by construction: the ownerId is supplied by the
 * authenticated caller's session downstream — never by request data.
 */
export class GetOwnFirmaUseCase {
  constructor(private readonly firmaRepository: IFirmaRepository) {}

  execute(ownerId: string): Promise<FirmaCorreo | null> {
    return this.firmaRepository.getOwnFirma(ownerId);
  }
}
