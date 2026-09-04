import { describe, expect, it } from 'vitest';
import {
  findDeliveryNameCollisions,
  validateDeliveryName,
  type DeliveryNameCheck,
  type DeliveryNameIssue,
} from '../validateDeliveryName';

/**
 * Shared delivery-name validator (change: editor-nombre-adjuntos-correo,
 * WU-2 — REQ-03 · design D2/D4/D5/D6).
 *
 * REQ-03 rule table (test oracle):
 *   | Traversal `..`, `/`, `\`                       | Reject |
 *   | Windows-illegal chars (`<>:"|?*`, C0 controls) | Reject |
 *   | Length > 255                                   | Reject |
 *   | LAN ready/cert attachments (forcePdf)          | Effective name MUST end `.pdf` (appended if missing) |
 *   | Duplicate effective names in batch             | Flagged — ONLY override-involved collisions (D6) |
 *
 * Behavior note carried over from WU-1 characterization: C0 controls
 * (`\t`, `\n`, …) inside the name are REJECTED here (ILLEGAL_CHAR) — the
 * validator rejects operator input; it never silently sanitizes (D4).
 * Only leading/trailing whitespace is trimmed before checking.
 */

function issueOf(check: DeliveryNameCheck): DeliveryNameIssue {
  expect(check.ok).toBe(false);
  if (check.ok) throw new Error('expected a failing check');
  return check.issue;
}

function valueOf(check: DeliveryNameCheck): string {
  expect(check.ok).toBe(true);
  if (!check.ok) throw new Error('expected a passing check');
  return check.value;
}

describe('validateDeliveryName — traversal (REQ-03: Traversal rejected both sides)', () => {
  it('rejects "../../evil.pdf" with TRAVERSAL (spec scenario)', () => {
    expect(issueOf(validateDeliveryName('../../evil.pdf', { forcePdf: true }))).toEqual({
      code: 'TRAVERSAL',
    });
  });

  it('rejects a forward-slash path segment', () => {
    expect(issueOf(validateDeliveryName('subdir/informe.pdf', { forcePdf: true }))).toEqual({
      code: 'TRAVERSAL',
    });
  });

  it('rejects a backslash path segment', () => {
    expect(issueOf(validateDeliveryName('subdir\\informe.pdf', { forcePdf: true }))).toEqual({
      code: 'TRAVERSAL',
    });
  });

  it('rejects a bare ".." component', () => {
    expect(issueOf(validateDeliveryName('..', { forcePdf: false }))).toEqual({ code: 'TRAVERSAL' });
  });

  it('rejects an embedded ".." run inside the basename', () => {
    expect(issueOf(validateDeliveryName('informe..pdf', { forcePdf: true }))).toEqual({
      code: 'TRAVERSAL',
    });
  });
});

describe('validateDeliveryName — Windows-illegal chars and C0 controls (REQ-03 rule row 2)', () => {
  it('rejects every reserved char <>:"|?* and reports them', () => {
    expect(issueOf(validateDeliveryName('a<b>c:d"e|f?g*h.pdf', { forcePdf: true }))).toEqual({
      code: 'ILLEGAL_CHAR',
      chars: '<>:"|?*',
    });
  });

  it('reports each offending char once, in first-appearance order', () => {
    expect(issueOf(validateDeliveryName('x<<>>y.pdf', { forcePdf: false }))).toEqual({
      code: 'ILLEGAL_CHAR',
      chars: '<>',
    });
  });

  it('rejects a C0 control char embedded in the name', () => {
    expect(issueOf(validateDeliveryName('informe\x07x.pdf', { forcePdf: true }))).toEqual({
      code: 'ILLEGAL_CHAR',
      chars: '\x07',
    });
  });

  it('rejects an embedded tab (C0) — validator rejects, never sanitizes (WU-1 note)', () => {
    expect(issueOf(validateDeliveryName('infor\tmate.pdf', { forcePdf: true }))).toEqual({
      code: 'ILLEGAL_CHAR',
      chars: '\t',
    });
  });

  it('rejects an embedded newline (C0)', () => {
    expect(issueOf(validateDeliveryName('line1\nline2.pdf', { forcePdf: true }))).toEqual({
      code: 'ILLEGAL_CHAR',
      chars: '\n',
    });
  });

  it('traversal wins over illegal chars when both are present', () => {
    expect(issueOf(validateDeliveryName('<a>/b.pdf', { forcePdf: true })).code).toBe('TRAVERSAL');
  });
});

describe('validateDeliveryName — length > 255 (REQ-03 rule row 3)', () => {
  it('accepts a 255-char final name (boundary)', () => {
    const name = 'a'.repeat(255);
    expect(valueOf(validateDeliveryName(name, { forcePdf: false }))).toBe(name);
  });

  it('rejects a 256-char name with TOO_LONG and reports the length', () => {
    const name = 'a'.repeat(256);
    expect(issueOf(validateDeliveryName(name, { forcePdf: false }))).toEqual({
      code: 'TOO_LONG',
      length: 256,
    });
  });

  it('enforces the limit on the FINAL name: 252 chars + appended ".pdf" = 256 → TOO_LONG', () => {
    const name = 'a'.repeat(252);
    expect(issueOf(validateDeliveryName(name, { forcePdf: true }))).toEqual({
      code: 'TOO_LONG',
      length: 256,
    });
  });
});

describe('validateDeliveryName — ".pdf" forced only where auto-rename applies (REQ-03: Extension forced, D5)', () => {
  it('appends ".pdf" to an extension-less override (spec scenario)', () => {
    expect(valueOf(validateDeliveryName('Informe Juan', { forcePdf: true }))).toBe('Informe Juan.pdf');
  });

  it('accepts an existing lowercase ".pdf" unchanged', () => {
    expect(valueOf(validateDeliveryName('Informe Juan.pdf', { forcePdf: true }))).toBe(
      'Informe Juan.pdf',
    );
  });

  it('treats ".PDF" case-insensitively and never double-appends', () => {
    expect(valueOf(validateDeliveryName('Informe Juan.PDF', { forcePdf: true }))).toBe(
      'Informe Juan.PDF',
    );
  });

  it('rejects an explicit non-pdf extension with BAD_EXTENSION', () => {
    expect(issueOf(validateDeliveryName('Informe Juan.txt', { forcePdf: true }))).toEqual({
      code: 'BAD_EXTENSION',
      got: '.txt',
    });
  });

  it('illegal-char rejection precedes the extension check', () => {
    expect(issueOf(validateDeliveryName('a<b>.txt', { forcePdf: true })).code).toBe('ILLEGAL_CHAR');
  });

  it('does NOT append or check extension when forcePdf is false (D5: locals sanitize-only)', () => {
    expect(valueOf(validateDeliveryName('scan', { forcePdf: false }))).toBe('scan');
    expect(valueOf(validateDeliveryName('scan.jpg', { forcePdf: false }))).toBe('scan.jpg');
  });
});

describe('validateDeliveryName — trim and empty fallback (REQ-01 empty-override contract)', () => {
  it('trims surrounding whitespace from the override', () => {
    expect(valueOf(validateDeliveryName('  Informe Juan.pdf  ', { forcePdf: true }))).toBe(
      'Informe Juan.pdf',
    );
  });

  it('maps a whitespace-only override to an empty value (caller falls back to auto name)', () => {
    expect(valueOf(validateDeliveryName('   ', { forcePdf: true }))).toBe('');
    expect(valueOf(validateDeliveryName('\t\n', { forcePdf: false }))).toBe('');
  });

  it('maps an empty override to an empty value', () => {
    expect(valueOf(validateDeliveryName('', { forcePdf: true }))).toBe('');
  });
});

describe('findDeliveryNameCollisions — override-involved duplicates only (REQ-03 Batch duplicate, D6)', () => {
  it('flags a collision between two overrides with the same effective name', () => {
    const issues = findDeliveryNameCollisions([
      { value: 'Informe Juan.pdf', overridden: true },
      { value: 'Informe Juan.pdf', overridden: true },
    ]);
    expect(issues).toEqual([{ code: 'DUPLICATE', name: 'Informe Juan.pdf' }]);
  });

  it('flags a collision when only ONE side is an override', () => {
    const issues = findDeliveryNameCollisions([
      { value: 'CAMO-JUAN PEREZ-UNACEM.pdf', overridden: false },
      { value: 'CAMO-JUAN PEREZ-UNACEM.pdf', overridden: true },
    ]);
    expect(issues).toEqual([{ code: 'DUPLICATE', name: 'CAMO-JUAN PEREZ-UNACEM.pdf' }]);
  });

  it('allows auto-auto duplicates (D6: rejecting them would break existing same-name sends)', () => {
    const issues = findDeliveryNameCollisions([
      { value: 'CAMO-JUAN PEREZ.pdf', overridden: false },
      { value: 'CAMO-JUAN PEREZ.pdf', overridden: false },
    ]);
    expect(issues).toEqual([]);
  });

  it('compares effective names case-insensitively (Windows share semantics)', () => {
    const issues = findDeliveryNameCollisions([
      { value: 'INFORME JUAN.PDF', overridden: true },
      { value: 'informe juan.pdf', overridden: false },
    ]);
    expect(issues).toEqual([{ code: 'DUPLICATE', name: 'INFORME JUAN.PDF' }]);
  });

  it('ignores distinct names entirely', () => {
    const issues = findDeliveryNameCollisions([
      { value: 'Informe Juan.pdf', overridden: true },
      { value: 'EMO-MARIA GARCIA.pdf', overridden: false },
    ]);
    expect(issues).toEqual([]);
  });

  it('never flags empty values (empty ⇒ auto fallback upstream)', () => {
    const issues = findDeliveryNameCollisions([
      { value: '', overridden: true },
      { value: '', overridden: true },
    ]);
    expect(issues).toEqual([]);
  });

  it('reports one issue per colliding name across a mixed batch', () => {
    const issues = findDeliveryNameCollisions([
      { value: 'a.pdf', overridden: false },
      { value: 'a.pdf', overridden: false },
      { value: 'b.pdf', overridden: true },
      { value: 'B.PDF', overridden: false },
      { value: 'c.pdf', overridden: true },
      { value: 'c.pdf', overridden: true },
    ]);
    expect(issues).toEqual([
      { code: 'DUPLICATE', name: 'b.pdf' },
      { code: 'DUPLICATE', name: 'c.pdf' },
    ]);
  });
});
