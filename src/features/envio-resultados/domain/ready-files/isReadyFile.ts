/**
 * Strict regex for "ready-to-send" file names produced by the upstream
 * scanning system. Two flavors:
 *
 * - `{digits}CERT.pdf` — the medical certificate
 * - `{digits}EXPED.pdf` — the patient expedient
 *
 * The digit run is unconstrained (any length ≥ 1) on purpose: different
 * sites use different DNI/file-number conventions, and the upstream tool
 * occasionally renames with an internal numeric id. Matching is
 * case-insensitive against the surrounding whitespace-trimmed name.
 *
 * NOTE: The pattern is anchored at both ends so neither a prefix
 * (`ABC75618561CERT.pdf`) nor a suffix (`75618561CERT.pdf.bak`) match.
 */
const READY_FILE_PATTERN = /^\d+(CERT|EXPED)\.pdf$/i;

export function isReadyFile(name: string): boolean {
  return READY_FILE_PATTERN.test(name.trim());
}
