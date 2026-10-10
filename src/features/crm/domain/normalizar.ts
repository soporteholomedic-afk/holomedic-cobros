/**
 * Pure normalization rules for the CRM registry — the single source of
 * truth for every dedup/merge key (spec G1 + design D1). Pure string
 * functions: no I/O, no framework, trivially testable.
 *
 * Consumers: the SQL Server adapter derives the stored *Normalizado
 * columns from raw input; the in-memory fake (application tests) mirrors
 * the same rules so use-case dedup tests stay faithful to the DB UQ
 * semantics. The import flow (pr5+) reuses these for grouping.
 */

/**
 * Registry dedup key: trim, uppercase, strip every non-alphanumeric
 * character — " 900-123456 " and "900123456" collapse to the same
 * `rucNormalizado` (the `UQ_CRM_Empresas_RucNormalizado` value).
 * Uppercasing keeps the optional verifier letter ("…-K") comparable.
 */
export function normalizarRuc(ruc: string): string {
  return ruc.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Contact merge key (design D1 name-match rule): trim, collapse
 * internal whitespace, lowercase, strip accents — "José  Pérez" and
 * "jose perez" share `nombreNormalizado` (the
 * `UQ_CRM_Contactos_EmpresaNombre` value, scoped per empresa).
 */
export function normalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Correo storage form: trim + lowercase (design §2 — addresses are
 * stored normalized under `UQ_CRM_Correos_ContactoCorreo`).
 */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Phone normalization (agente-ia-crm E1) — free-text phones live in
// CRM_Contactos.telefono today; the canal (E1 riesgo 2) needs ONE
// canonical key to route inbound WhatsApp messages to a conversation
// and to vincular it with the matching CRM_Contactos row. That key is
// E.164 Paraguay, persisted in CRM_Conversaciones.telefono.
// ---------------------------------------------------------------------------

/**
 * Free text → E.164 (agente-ia-crm E1). Strips spaces/hyphens/
 * parentheses/dots, then classifies: already international ('+' or
 * the '00' dialing prefix, 8–15 digits), local PY with the national
 * trunk '0' ('0981 234 567' → '+595981234567'), WhatsApp 'from' PY
 * sin '+' (T2: '595981234567' → '+595981234567'), local PY móvil
 * without '0' (9–10 digits starting with 9) or fijo without '0'
 * (7–8 digits starting with 2/3), y como último fallback cualquier
 * bloque internacional de 8–15 dígitos con primer dígito ≠ 0
 * (T2: '12125551234' EEUU → '+12125551234'). Total and never
 * throws: every unparsable shape → null.
 */
export function normalizarTelefonoE164(entrada: string): string | null {
  const limpio = entrada.replace(/[\s\-().]/g, '');
  if (limpio === '') return null;

  if (limpio.startsWith('+')) {
    return internacionalE164(limpio.slice(1));
  }
  // '00' international dialing prefix (Paraguay telecom habit):
  // '00595…' means the same as '+595…'.
  if (limpio.startsWith('00')) {
    return internacionalE164(limpio.slice(2));
  }
  if (!/^\d+$/.test(limpio)) return null;

  // Local PY with the national trunk '0' → '+595' + digits without it
  // ('0981 234 567' → '+595981234567', '0211234567' → '+595211234567').
  if (limpio.startsWith('0')) {
    const local = limpio.slice(1);
    if (local.length < 7 || local.length > 10) return null;
    return `+595${local}`;
  }
  // WhatsApp 'from' PY sin '+' (formato Kapso/Meta, agente-ia-crm T2):
  // dígitos internacionales que ya traen el país ('595981234567' —
  // '595' + 6–10 locales = 9–13 dígitos totales).
  if (limpio.startsWith('595') && limpio.length >= 9 && limpio.length <= 13) {
    return `+${limpio}`;
  }
  // Móvil PY without the trunk '0' ('981234567').
  if (limpio.startsWith('9') && limpio.length >= 9 && limpio.length <= 10) {
    return `+595${limpio}`;
  }
  // Fijo PY without the trunk '0' ('29112345' — interior 7–8 dígitos).
  if ((limpio.startsWith('2') || limpio.startsWith('3')) && limpio.length >= 7 && limpio.length <= 8) {
    return `+595${limpio}`;
  }
  // Último fallback (T2): internacional tal cual sin '+' — bloque de
  // 8–15 dígitos, primer dígito ≠ 0 (garantizado: el tronco '0' ya se
  // resolvió arriba y devuelve null fuera de rango).
  return internacionalE164(limpio);
}

/** 8–15 dígitos (E.164), sin cero inicial tras el '+' (ITU invalid). */
function internacionalE164(digitos: string): string | null {
  if (!/^\d+$/.test(digitos)) return null;
  if (digitos.startsWith('0')) return null;
  if (digitos.length < 8 || digitos.length > 15) return null;
  return `+${digitos}`;
}

/**
 * Matching key: pure digits, no '+' ('+595981234567' →
 * '595981234567'). Works on free text too ('(0981) 234-567' →
 * '0981234567') — used for comparisons, NOT for storage (that is
 * always the normalized E.164).
 */
export function telefonoDigitosClave(telefono: string): string {
  return telefono.replace(/[^0-9]/g, '');
}

/**
 * Compare one free-text CRM_Contactos phone against one canonical
 * E.164: both sides are normalized to E.164 first (so a local trunk
 * '0' matches the stored '+595…' form), then compared by digit key.
 * Null normalization on either side → false.
 */
export function telefonosCoinciden(telefonoLibre: string, e164: string): boolean {
  const a = normalizarTelefonoE164(telefonoLibre);
  const b = normalizarTelefonoE164(e164);
  if (a === null || b === null) return false;
  return telefonoDigitosClave(a) === telefonoDigitosClave(b);
}
