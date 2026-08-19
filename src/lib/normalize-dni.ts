/**
 * Normalizes a raw document (DNI) string to its canonical correlation key.
 *
 * The SIGLA stored procedures return the document in two shapes:
 *
 * - `SP_RPT_MATRIZICCGSA` prefixes it with its type label:
 *   `NroDId = C1.DesCon + ' ' + P.NroDId` → e.g. `"DNI 25721424"` or
 *   `"PASAPORTE EB7192642"`.
 * - `SP_SEL_ORDEN` / `VW_ORDEN` returns the bare document → `"EB7192642"`.
 *
 * To make both sides correlate to the same key, this helper:
 *
 *   1. Strips a leading KNOWN document-type label (`DNI`, `PASAPORTE`,
 *      `CARNET DE EXTRANJERIA`) — the only labels `Persona.TipDId` maps
 *      to in SIGLA (60001/60002/60003).
 *   2. Removes every formatting character (dots, dashes, colons,
 *      whitespace) while PRESERVING the letters that are part of
 *      foreign documents.
 *
 * Foreign (`extranjero`) documents are alphanumeric — passports like
 * `EB7192642` / `R05481670` and carnets like `18.362.427-K`. The
 * previous digits-only implementation destroyed the letter prefix, which
 * both showed the wrong document AND broke the file lookup: the patient
 * archive folders on the LAN share are keyed by the raw alphanumeric
 * document (e.g. `\\172.16.10.12\sigla\<ruc>\EB7192642\<idAten>\...`).
 *
 * @param raw - Raw document from `SpResultRow.NroDId` or `OrderRow.NroDId`.
 * @returns Normalized key: letters + digits only, type label removed.
 */
const DOC_TYPE_LABEL_RE = /^(DNI|PASAPORTE|CARNET DE EXTRANJERIA)(?=[^A-Za-z0-9]|$)/i;

export function normalizeDni(raw: string): string {
  const withoutLabel = raw.trim().replace(DOC_TYPE_LABEL_RE, '');
  return withoutLabel.replace(/[^A-Za-z0-9]/g, '');
}

/**
 * A patient document key that is safe to embed as a filesystem path
 * segment. Accepts both numeric DNIs and alphanumeric foreign documents
 * (passports like `EB7192642`, carnets like `R05481670`).
 *
 * The `dni` value travels straight into the LAN-share path
 * (`\\172.16.10.12\sigla\<ruc>\<dni>\<idAten>\...`), so this guard is a
 * traversal defense, not a format nicety: it rejects path separators,
 * dots, whitespace, and any other special character that could escape
 * the patient folder.
 */
const DOCUMENT_KEY_RE = /^[A-Za-z0-9]+$/;

export function isSafeDocumentKey(value: string): boolean {
  return DOCUMENT_KEY_RE.test(value);
}