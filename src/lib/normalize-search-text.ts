/**
 * Normalize text for accent- and case-insensitive search.
 *
 * Same algorithm as the `PatientsList` / `CompanySelector` buscadores:
 * lowercase, NFD-decompose, then strip combining diacritics. Used at
 * write time (the precomputed `search*` columns of
 * `dbo.envios_consolidados`) and at query time so both sides compare
 * in the same canonical space regardless of the DB collation.
 */
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
