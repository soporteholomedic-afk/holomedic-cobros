import { describe, it, expect } from 'vitest';
import {
  buildSignatureHtml,
  DEFAULT_SIGNATURE_DATA,
  stripSignatureHtml,
} from '../signatureData';

// historial-envios-consolidados PR4 (task 4.1, design D8): the built
// signature is wrapped in `<!--holomedic-firma-->` sentinels so the
// persisted body can be stripped exactly before reenvío re-appends it.
const SENTINEL = '<!--holomedic-firma-->';

describe('buildSignatureHtml (D8 sentinels)', () => {
  it('wraps the signature table in exactly one sentinel pair', () => {
    const html = buildSignatureHtml(DEFAULT_SIGNATURE_DATA);

    expect(html.startsWith(SENTINEL)).toBe(true);
    expect(html.endsWith(SENTINEL)).toBe(true);
    // Splitting on the sentinel yields [empty, table, empty] — exactly
    // two sentinels, no stray occurrences inside the table markup.
    expect(html.split(SENTINEL)).toHaveLength(3);
    expect(html).toContain('<table');
  });
});

describe('stripSignatureHtml', () => {
  it('round-trips: body + signature strips back to the exact body, and re-appending reproduces the persisted HTML', () => {
    const body = '<p>Estimado paciente,</p><p>Adjuntamos sus resultados.</p>';
    const persisted = body + buildSignatureHtml(DEFAULT_SIGNATURE_DATA);

    const stripped = stripSignatureHtml(persisted);
    expect(stripped).toBe(body);
    // The editor re-appends the signature at send time — the result must
    // equal the persisted HTML verbatim (no duplication, D8).
    expect(stripped + buildSignatureHtml(DEFAULT_SIGNATURE_DATA)).toBe(persisted);
  });

  it('returns input unchanged when no sentinel is present (strip exactness)', () => {
    const html = '<p>Sin firma persistida</p>';
    expect(stripSignatureHtml(html)).toBe(html);
  });

  it('strips only the signature block, keeping content before and after', () => {
    const before = '<p>before</p>';
    const after = '<p>after</p>';
    const html = before + buildSignatureHtml(DEFAULT_SIGNATURE_DATA) + after;
    expect(stripSignatureHtml(html)).toBe(before + after);
  });

  it('handles the empty-body case', () => {
    expect(stripSignatureHtml('')).toBe('');
    // A persisted empty body (htmlBody memo yields '' when body is empty)
    // carries no signature at all — stripping is a no-op.
    expect(stripSignatureHtml(buildSignatureHtml(DEFAULT_SIGNATURE_DATA))).toBe('');
  });

  it('defends against a lone sentinel (malformed persisted body)', () => {
    expect(stripSignatureHtml(`<p>x</p>${SENTINEL}<p>y</p>`)).toBe('<p>x</p>');
  });
});
