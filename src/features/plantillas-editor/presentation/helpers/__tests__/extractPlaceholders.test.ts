import { describe, it, expect } from 'vitest';

import { extractPlaceholders } from '../extractPlaceholders';
import { encodeToken } from '../tokenSerializer';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Unit tests for `extractPlaceholders` — the pure regex scanner that splits
 * a string into an ordered list of text segments and token segments.
 *
 * Spec `email-template-editor`:
 *  - "Round-trip body load preserves chips" — the load pipeline walks each
 *    text node through this helper to split `{{token}}` out of surrounding
 *    text.
 *  - "Malformed placeholder degrades to plain text" — a `{{` without a
 *    matching `}}` MUST be left as text, never thrown.
 *
 * Design Decision c: regex `/\{\{([^}]+)\}\}/g` over the text. A matched
 * placeholder is parsed via `parseTokenPlaceholder`; if parse returns null
 * (e.g. `{{tabla:docs}}` — wrong colon count) the matched text degrades to
 * a plain text segment too.
 *
 * This helper does NOT collapse empty text segments — that is
 * `splitIntoSegments`'s job (task 3.4). Here we keep the raw scan so the
 * body load pipeline can decide what to do with empties.
 *
 * `extractPlaceholders` is a runtime value export so this import fails
 * first — a real RED.
 */
describe('extractPlaceholders', () => {
  describe('text with no placeholders', () => {
    it('returns a single text segment wrapping the whole string', () => {
      expect(extractPlaceholders('hello world')).toEqual([
        { text: 'hello world' },
      ]);
    });

    it('returns a single empty text segment for the empty string', () => {
      expect(extractPlaceholders('')).toEqual([{ text: '' }]);
    });
  });

  describe('a single placeholder', () => {
    it('splits surrounding text into [textBefore, token, textAfter]', () => {
      expect(extractPlaceholders('a {{empresa}} c')).toEqual([
        { text: 'a ' },
        { token: { key: 'empresa' } },
        { text: ' c' },
      ]);
    });

    it('emits an empty text segment before a placeholder at the start', () => {
      expect(extractPlaceholders('{{empresa}} tail')).toEqual([
        { text: '' },
        { token: { key: 'empresa' } },
        { text: ' tail' },
      ]);
    });

    it('emits an empty text segment after a placeholder at the end', () => {
      expect(extractPlaceholders('head {{empresa}}')).toEqual([
        { text: 'head ' },
        { token: { key: 'empresa' } },
        { text: '' },
      ]);
    });

    it('emits empty text segments around a lone placeholder', () => {
      expect(extractPlaceholders('{{empresa}}')).toEqual([
        { text: '' },
        { token: { key: 'empresa' } },
        { text: '' },
      ]);
    });

    it('parses a table placeholder into its attrs', () => {
      expect(extractPlaceholders('{{tabla:docs:fecha,monto}}')).toEqual([
        { text: '' },
        { token: { key: 'tabla', table: 'docs', cols: ['fecha', 'monto'] } },
        { text: '' },
      ]);
    });
  });

  describe('multiple placeholders', () => {
    it('splits multiple non-adjacent placeholders with text between', () => {
      expect(extractPlaceholders('{{a}} and {{b}}')).toEqual([
        { text: '' },
        { token: { key: 'a' } },
        { text: ' and ' },
        { token: { key: 'b' } },
        { text: '' },
      ]);
    });

    it('emits an empty text segment between adjacent placeholders', () => {
      expect(extractPlaceholders('{{a}}{{b}}')).toEqual([
        { text: '' },
        { token: { key: 'a' } },
        { text: '' },
        { token: { key: 'b' } },
        { text: '' },
      ]);
    });
  });

  describe('malformed placeholders degrade to text (never throw)', () => {
    it('leaves a {{ without a matching }} as plain text', () => {
      expect(extractPlaceholders('hello {{empresa world')).toEqual([
        { text: 'hello {{empresa world' },
      ]);
    });

    it('leaves a }} without a preceding {{ as plain text', () => {
      expect(extractPlaceholders('empresa}} done')).toEqual([
        { text: 'empresa}} done' },
      ]);
    });

    it('degrades a matched-but-invalid table form to a text segment', () => {
      // The regex matches {{tabla:docs}} but parseTokenPlaceholder rejects it
      // (wrong colon count) — the matched text must come back as text, not a
      // token, and must NOT be dropped.
      expect(extractPlaceholders('pre {{tabla:docs}} post')).toEqual([
        { text: 'pre ' },
        { text: '{{tabla:docs}}' },
        { text: ' post' },
      ]);
    });
  });

  describe('round-trip adjacency with encodeToken', () => {
    it('a token segment round-trips back to the same {{token}} string', () => {
      // Re-serializing the extracted segments must reproduce the input for
      // any valid placeholder. This is the body-load ↔ body-save contract.
      const input = 'Informe — {{fecha}} para {{empresa}}';
      const segments = extractPlaceholders(input);
      const reSerialized = segments
        .map((s) => ('token' in s ? encodeToken(s.token as TokenAttrs) : s.text))
        .join('');
      expect(reSerialized).toBe(input);
    });
  });
});
