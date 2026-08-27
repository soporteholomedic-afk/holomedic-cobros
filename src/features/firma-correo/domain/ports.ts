import type { FirmaCorreo } from './entities';

/**
 * Outbound port for the user's OWN email-signature row (editor-firmas).
 *
 * Implementations key rows by (ownerId, reserved storage area) — the
 * use cases never accept a caller-supplied owner id, so read/write is
 * own-row-only by construction. Storage semantics (JSON-in-bodyHtml on
 * dbo.templates) belong to the infrastructure adapter, not to this
 * contract.
 */
export interface IFirmaRepository {
  getOwnFirma(ownerId: string): Promise<FirmaCorreo | null>;
  saveOwnFirma(ownerId: string, firma: FirmaCorreo): Promise<void>;
}
