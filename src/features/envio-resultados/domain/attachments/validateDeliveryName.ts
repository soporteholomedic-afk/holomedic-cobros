/**
 * Shared delivery-name validator (design D2 — one pure module used by
 * BOTH the client preview and the server enforcement; zero `node:*`
 * imports so it is browser-importable).
 *
 * Semantics per design D4 — REJECTION, not sanitization: the operator
 * typed the value, so a broken value must surface as a predictable
 * error, never be silently rewritten. (This is the deliberate opposite
 * of `sanitizeComponent`, which replaces illegal chars with `_`.)
 *
 * Check order (deterministic, first failure wins):
 *   1. trim; empty ⇒ `{ ok: true, value: '' }` — the CALLER treats an
 *      empty override as "fall back to the auto name" (REQ-01/D4).
 *   2. TRAVERSAL — `..`, `/`, or `\` anywhere (spec rule row 1).
 *   3. ILLEGAL_CHAR — Windows-reserved `<>:"|?*` plus the C0 control
 *      range (spec rule row 2). Separators are already rejected above,
 *      so they are intentionally NOT part of this set.
 *   4. Extension handling — ONLY when `ctx.forcePdf` is true (D5: the
 *      use case sets it where the auto-rename pipeline applies, i.e.
 *      `parseReadyFile(name)` OR `looksLikeGeneratedCertificate(name)`;
 *      local attachments are sanitize-only and may keep any extension):
 *        - no `.` suffix  → `.pdf` is APPENDED (spec: appended if missing)
 *        - `.pdf` (any case) → kept verbatim
 *        - any other extension → BAD_EXTENSION
 *   5. TOO_LONG — enforced on the FINAL (post-append) value so the
 *      delivered name always fits the 255-char filesystem limit.
 *
 * `findDeliveryNameCollisions` implements design D6: only collisions
 * INVOLVING an override are reported; auto-auto duplicates stay allowed
 * (rejecting those would break existing same-name sends). Comparison is
 * case-insensitive, matching Windows share semantics.
 */

export type DeliveryNameIssue =
  | { code: 'TRAVERSAL' }
  | { code: 'ILLEGAL_CHAR'; chars: string }
  | { code: 'TOO_LONG'; length: number }
  | { code: 'BAD_EXTENSION'; got: string }
  | { code: 'DUPLICATE'; name: string };

export type DeliveryNameCheck =
  | { ok: true; value: string }
  | { ok: false; issue: DeliveryNameIssue };

export interface DeliveryNameContext {
  /**
   * True when the auto-rename pipeline applies to this attachment
   * (ready file or generated certificate) — the effective name MUST
   * end in `.pdf`, appended when missing. False for local attachments
   * (no extension rules at all).
   */
  forcePdf: boolean;
}

const MAX_DELIVERY_NAME_LENGTH = 255;
const PDF_EXTENSION = '.pdf';

/** Windows-reserved chars EXCLUDING path separators (those are TRAVERSAL). */
const ILLEGAL_CHARS_RE = /[<>:"|?*\x00-\x1f]/g;

function containsTraversal(value: string): boolean {
  return value.includes('..') || value.includes('/') || value.includes('\\');
}

/** Unique illegal chars in first-appearance order, joined for the error. */
function illegalCharsIn(value: string): string {
  return [...new Set(value.match(ILLEGAL_CHARS_RE) ?? [])].join('');
}

function pdfExtensionOf(value: string): string {
  const lastDot = value.lastIndexOf('.');
  return lastDot === -1 ? '' : value.slice(lastDot).toLowerCase();
}

export function validateDeliveryName(raw: string, ctx: DeliveryNameContext): DeliveryNameCheck {
  const value = raw.trim();

  // Empty (or whitespace-only) ⇒ the caller falls back to the auto name.
  if (value === '') return { ok: true, value: '' };

  if (containsTraversal(value)) return { ok: false, issue: { code: 'TRAVERSAL' } };

  const chars = illegalCharsIn(value);
  if (chars !== '') return { ok: false, issue: { code: 'ILLEGAL_CHAR', chars } };

  let candidate = value;
  if (ctx.forcePdf) {
    const ext = pdfExtensionOf(value);
    if (ext === '') candidate = value + PDF_EXTENSION;
    else if (ext !== PDF_EXTENSION) return { ok: false, issue: { code: 'BAD_EXTENSION', got: ext } };
  }

  if (candidate.length > MAX_DELIVERY_NAME_LENGTH) {
    return { ok: false, issue: { code: 'TOO_LONG', length: candidate.length } };
  }

  return { ok: true, value: candidate };
}

export interface DeliveryNameItem {
  /** Effective (validated) delivery name. Empty values are never compared. */
  value: string;
  /** True when this item carries an operator override. */
  overridden: boolean;
}

export function findDeliveryNameCollisions(items: readonly DeliveryNameItem[]): DeliveryNameIssue[] {
  const groups = new Map<string, { name: string; overridden: boolean }[]>();
  for (const item of items) {
    if (item.value === '') continue;
    const key = item.value.toLowerCase();
    const group = groups.get(key);
    if (group) group.push({ name: item.value, overridden: item.overridden });
    else groups.set(key, [{ name: item.value, overridden: item.overridden }]);
  }

  const issues: DeliveryNameIssue[] = [];
  for (const group of groups.values()) {
    if (group.length > 1 && group.some((g) => g.overridden)) {
      issues.push({ code: 'DUPLICATE', name: group[0]!.name });
    }
  }
  return issues;
}
