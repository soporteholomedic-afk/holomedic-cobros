import type { FirmaValidationResult } from '../domain/validation';
import { validateFirmaCorreo } from '../domain/validation';
import type { IFirmaRepository } from '../domain/ports';

/**
 * SaveOwnFirmaUseCase (editor-firmas task 1.5) — validates the
 * candidate signature FIRST, then persists only ok results. Invalid
 * input returns the validation result verbatim (per-field Spanish
 * messages for the form) and NEVER touches the port — invalid data
 * must not persist (spec). The repository receives the validated,
 * trimmed entity; storage semantics are the adapter's concern.
 */
export class SaveOwnFirmaUseCase {
  constructor(private readonly firmaRepository: IFirmaRepository) {}

  async execute(ownerId: string, input: unknown): Promise<FirmaValidationResult> {
    const result = validateFirmaCorreo(input);
    if (!result.ok) return result;
    await this.firmaRepository.saveOwnFirma(ownerId, result.value);
    return result;
  }
}
