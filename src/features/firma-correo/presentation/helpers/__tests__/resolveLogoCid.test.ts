import { describe, it, expect } from 'vitest';

import { resolveLogoCid } from '../resolveLogoCid';

/**
 * Preview substitution helper: `cid:holomedic-logo` → the PUBLIC path
 * `/logo-holomedic.png`, for DISPLAY ONLY (browser previews cannot
 * resolve smtp Content-ID references). Anything stored or sent keeps
 * the cid — this helper is never applied on those paths.
 */
describe('resolveLogoCid', () => {
  it('replaces a single cid reference with the public logo path', () => {
    const html = '<td><img src="cid:holomedic-logo" width="120" /></td>';
    expect(resolveLogoCid(html)).toBe(
      '<td><img src="/logo-holomedic.png" width="120" /></td>',
    );
  });

  it('replaces EVERY occurrence, not just the first', () => {
    const html = 'a cid:holomedic-logo b cid:holomedic-logo c';
    expect(resolveLogoCid(html)).toBe('a /logo-holomedic.png b /logo-holomedic.png c');
  });

  it('returns html without the cid byte-identical', () => {
    const html = '<p>Sin logo</p><img src="cid:otro-logo" />';
    expect(resolveLogoCid(html)).toBe(html);
  });

  it('leaves OTHER cid references untouched (only the signature logo)', () => {
    const html = '<img src="cid:invoice-pdf" />';
    expect(resolveLogoCid(html)).toBe('<img src="cid:invoice-pdf" />');
  });

  it('handles the empty string', () => {
    expect(resolveLogoCid('')).toBe('');
  });
});
