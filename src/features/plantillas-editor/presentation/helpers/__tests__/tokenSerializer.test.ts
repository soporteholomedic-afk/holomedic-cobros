import { describe, it, expect } from 'vitest';

import { encodeToken } from '../tokenSerializer';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Unit tests for `encodeToken` — the pure serializer that turns a
 * `TokenAttrs` chip into the `{{token}}` Mustache placeholder stored in
 * `bodyHtml` / `subject`.
 *
 * Spec `email-template-editor`:
 *  - "Save serializes chips to Mustache placeholders" — the stored bodyHtml
 *    contains `{{token}}` (and `{{tabla:name:c1,c2}}` for tables) as plain
 *    inline text.
 *
 * Storage format (design Decision c):
 *  - Simple: `{ key: 'empresa' }`                 → `{{empresa}}`
 *  - Table:  `{ key: 'tabla', table, cols }`      → `{{tabla:<name>:<c1>,<c2>}}`
 *
 * `encodeToken` is a runtime value export so this import fails first — a
 * real RED, not a type-only false green.
 */
describe('encodeToken', () => {
  describe('simple tokens', () => {
    it('encodes a simple key-only token to {{key}}', () => {
      const attrs: TokenAttrs = { key: 'empresa' };
      expect(encodeToken(attrs)).toBe('{{empresa}}');
    });

    it('encodes a different simple key (triangulate — no hardcoding)', () => {
      const attrs: TokenAttrs = { key: 'fecha' };
      expect(encodeToken(attrs)).toBe('{{fecha}}');
    });
  });

  describe('table tokens', () => {
    it('encodes a table token with multiple columns joined by comma', () => {
      const attrs: TokenAttrs = {
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['fecha', 'monto'],
      };
      expect(encodeToken(attrs)).toBe(
        '{{tabla:documentosVencidos:fecha,monto}}',
      );
    });

    it('encodes a table token with a single column (no trailing comma)', () => {
      const attrs: TokenAttrs = {
        key: 'tabla',
        table: 'examenes',
        cols: ['fecha'],
      };
      expect(encodeToken(attrs)).toBe('{{tabla:examenes:fecha}}');
    });

    it('preserves column order from selection (fecha, monto) ≠ (monto, fecha)', () => {
      const a: TokenAttrs = {
        key: 'tabla',
        table: 'docs',
        cols: ['fecha', 'monto'],
      };
      const b: TokenAttrs = {
        key: 'tabla',
        table: 'docs',
        cols: ['monto', 'fecha'],
      };
      expect(encodeToken(a)).toBe('{{tabla:docs:fecha,monto}}');
      expect(encodeToken(b)).toBe('{{tabla:docs:monto,fecha}}');
      expect(encodeToken(a)).not.toBe(encodeToken(b));
    });

    it('preserves special characters in the table name verbatim', () => {
      const attrs: TokenAttrs = {
        key: 'tabla',
        table: 'docs_vencidos-2026',
        cols: ['fecha'],
      };
      expect(encodeToken(attrs)).toBe('{{tabla:docs_vencidos-2026:fecha}}');
    });
  });

  describe('edge cases', () => {
    it('encodes a table token with an empty cols array as {{tabla:name:}}', () => {
      // Degenerate but must NOT throw — the parser must round-trip it back
      // to the same attrs (empty cols). Documented behaviour.
      const attrs: TokenAttrs = { key: 'tabla', table: 'docs', cols: [] };
      expect(encodeToken(attrs)).toBe('{{tabla:docs:}}');
    });

    it('encodes a token whose key contains non-alpha characters', () => {
      const attrs: TokenAttrs = { key: 'firma-html' };
      expect(encodeToken(attrs)).toBe('{{firma-html}}');
    });

    it('treats a table key WITHOUT a table field as a simple token (defensive)', () => {
      // If a caller passes `key: 'tabla'` without `table`, we cannot compose
      // the table form — degrade to the simple form rather than throw.
      const attrs: TokenAttrs = { key: 'tabla' };
      expect(encodeToken(attrs)).toBe('{{tabla}}');
    });
  });
});
