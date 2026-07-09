import { describe, it, expect } from 'vitest';

import { parseTokenPlaceholder } from '../tokenParser';
import { encodeToken } from '../tokenSerializer';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Unit tests for `parseTokenPlaceholder` — the pure parser that turns a
 * `{{token}}` Mustache placeholder string back into a `TokenAttrs` chip.
 *
 * Spec `email-template-editor`:
 *  - "Round-trip body load preserves chips" — `{{empresa}}` and
 *    `{{tabla:examenes:fecha,monto}}` parse back to their original attrs.
 *  - "Malformed placeholder degrades to plain text" — a malformed
 *    placeholder MUST parse to `null` (the caller then leaves it as plain
 *    text); it MUST NOT throw.
 *
 * Storage format (design Decision c):
 *  - `{{empresa}}`                       → { key: 'empresa' }
 *  - `{{tabla:docs:fecha,monto}}`        → { key: 'tabla', table: 'docs', cols: ['fecha','monto'] }
 *  - malformed                           → null
 *  - unknown key                         → still parses (validation is at
 *                                          insert time, NOT parse time)
 *
 * `parseTokenPlaceholder` is a runtime value export so this import fails
 * first — a real RED, not a type-only false green.
 */
describe('parseTokenPlaceholder', () => {
  describe('simple tokens', () => {
    it('parses {{empresa}} to { key: "empresa" }', () => {
      expect(parseTokenPlaceholder('{{empresa}}')).toEqual({ key: 'empresa' });
    });

    it('parses a different simple key (triangulate)', () => {
      expect(parseTokenPlaceholder('{{fecha}}')).toEqual({ key: 'fecha' });
    });

    it('parses an unknown key without rejecting it (validation is at insert time)', () => {
      // The parser does NOT know which keys are valid — it returns the attrs
      // and the editor decides whether to allow the chip. This lets old
      // stored templates with since-renamed tokens load as chips rather than
      // crashing the editor.
      expect(parseTokenPlaceholder('{{doesNotExist}}')).toEqual({
        key: 'doesNotExist',
      });
    });
  });

  describe('table tokens', () => {
    it('parses {{tabla:docs:fecha,monto}} to { key, table, cols }', () => {
      const attrs = parseTokenPlaceholder('{{tabla:docs:fecha,monto}}');
      expect(attrs).toEqual({
        key: 'tabla',
        table: 'docs',
        cols: ['fecha', 'monto'],
      });
    });

    it('parses a single-column table token', () => {
      expect(parseTokenPlaceholder('{{tabla:examenes:fecha}}')).toEqual({
        key: 'tabla',
        table: 'examenes',
        cols: ['fecha'],
      });
    });

    it('parses a 3-column table token preserving column order', () => {
      expect(
        parseTokenPlaceholder('{{tabla:docs:fecha,monto,paciente}}'),
      ).toEqual({
        key: 'tabla',
        table: 'docs',
        cols: ['fecha', 'monto', 'paciente'],
      });
    });

    it('parses {{tabla:docs:}} to empty cols array (round-trips encodeToken)', () => {
      // encodeToken({ key:'tabla', table:'docs', cols:[] }) === '{{tabla:docs:}}'
      // so the parser must recover cols:[] (NOT ['']) for the empty case.
      expect(parseTokenPlaceholder('{{tabla:docs:}}')).toEqual({
        key: 'tabla',
        table: 'docs',
        cols: [],
      });
    });
  });

  describe('malformed placeholders return null (never throw)', () => {
    it('returns null for a placeholder missing the closing braces', () => {
      expect(parseTokenPlaceholder('{{empresa')).toBeNull();
    });

    it('returns null for a placeholder missing the opening braces', () => {
      expect(parseTokenPlaceholder('empresa}}')).toBeNull();
    });

    it('returns null for an empty placeholder {{}}', () => {
      expect(parseTokenPlaceholder('{{}}')).toBeNull();
    });

    it('returns null for a plain string with no braces at all', () => {
      expect(parseTokenPlaceholder('empresa')).toBeNull();
    });

    it('returns null for a table form missing the cols segment (2 parts)', () => {
      // {{tabla:docs}} has only one colon — neither a valid table form
      // (needs key:table:cols) nor a valid simple form (key with a colon
      // is not a real key).
      expect(parseTokenPlaceholder('{{tabla:docs}}')).toBeNull();
    });

    it('returns null for a table form with too many colons (4 parts)', () => {
      expect(parseTokenPlaceholder('{{tabla:docs:a:b}}')).toBeNull();
    });

    it('returns null for a table form with an empty table name', () => {
      expect(parseTokenPlaceholder('{{tabla::fecha}}')).toBeNull();
    });
  });

  describe('round-trip with encodeToken', () => {
    it('parse(encode(simple)) === original attrs', () => {
      const attrs: TokenAttrs = { key: 'empresa' };
      expect(parseTokenPlaceholder(encodeToken(attrs))).toEqual(attrs);
    });

    it('parse(encode(table)) === original attrs (order preserved)', () => {
      const attrs: TokenAttrs = {
        key: 'tabla',
        table: 'docs',
        cols: ['fecha', 'monto'],
      };
      expect(parseTokenPlaceholder(encodeToken(attrs))).toEqual(attrs);
    });
  });
});
