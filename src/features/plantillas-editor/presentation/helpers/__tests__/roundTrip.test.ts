import { describe, it, expect } from 'vitest';

import { encodeToken } from '../tokenSerializer';
import { parseTokenPlaceholder } from '../tokenParser';
import { extractPlaceholders } from '../extractPlaceholders';
import {
  splitIntoSegments,
  serializeSubject,
} from '../splitIntoSegments';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Round-trip property + edge-case tests across the pure token helpers
 * (tasks 3.1–3.4). These pin the foundation of the editor: if the
 * `{{token}}` ↔ chip round-trip fails, the editor is broken.
 *
 * Spec `email-template-editor`:
 *  - "Round-trip body load preserves chips" — `{{empresa}}` and
 *    `{{tabla:examenes:fecha,monto}}` round-trip to their original attrs.
 *  - "Malformed placeholder degrades to plain text" — malformed `{{` is left
 *    as text and NEVER throws.
 *
 * Design Decision c (HIGH RISK mitigations): the storage format `{{token}}`
 * is independent of BlockNote internals; unknown/malformed placeholders
 * degrade to plain text (graceful, never throw); unknown keys parse to a
 * token node (validation is at insert time, not parse time).
 *
 * Two round-trip directions:
 *  1. Token-level:  parseTokenPlaceholder(encodeToken(attrs)) === attrs
 *  2. String-level: serialize(extractPlaceholders(text)) === text
 *     (where serialize = text-as-is + tokens via encodeToken)
 *
 * The "modulo whitespace normalization" caveat from the design applies at
 * the BlockNote DOC level (PR 3.10, mocked) — at the pure-string level the
 * round-trip is EXACT for valid placeholders.
 */

/** Re-serialize an `extractPlaceholders` result back into the source string. */
function serializeExtracted(
  segments: ReturnType<typeof extractPlaceholders>,
): string {
  return segments
    .map((s) => ('token' in s ? encodeToken(s.token) : s.text))
    .join('');
}

describe('round-trip: token-level (parse ∘ encode === identity)', () => {
  const tokenCases: Array<{ name: string; attrs: TokenAttrs }> = [
    { name: 'simple empresa', attrs: { key: 'empresa' } },
    { name: 'simple fecha', attrs: { key: 'fecha' } },
    { name: 'simple firma', attrs: { key: 'firma' } },
    {
      name: 'table 2 cols',
      attrs: { key: 'tabla', table: 'documentosVencidos', cols: ['fecha', 'monto'] },
    },
    {
      name: 'table 3 cols',
      attrs: { key: 'tabla', table: 'examenes', cols: ['fecha', 'nombre', 'resultado'] },
    },
    {
      name: 'table single col',
      attrs: { key: 'tabla', table: 'docs', cols: ['fecha'] },
    },
    {
      name: 'table empty cols',
      attrs: { key: 'tabla', table: 'docs', cols: [] },
    },
    {
      name: 'unknown key (parses to a token — validation is at insert time)',
      attrs: { key: 'doesNotExist' },
    },
    {
      name: 'key with hyphen',
      attrs: { key: 'firma-html' },
    },
  ];

  for (const { name, attrs } of tokenCases) {
    it(`parse(encode(${name})) === attrs`, () => {
      const encoded = encodeToken(attrs);
      const parsed = parseTokenPlaceholder(encoded);
      expect(parsed).not.toBeNull();
      expect(parsed).toEqual(attrs);
    });
  }
});

describe('round-trip: string-level (serialize ∘ extract === identity)', () => {
  const stringCases: Array<{ name: string; text: string }> = [
    { name: 'plain text, no placeholders', text: 'Hola mundo' },
    { name: 'empty string', text: '' },
    { name: 'lone simple token', text: '{{empresa}}' },
    { name: 'lone table token', text: '{{tabla:examenes:fecha,monto}}' },
    { name: 'text before token', text: 'Informe — {{fecha}}' },
    { name: 'text after token', text: '{{fecha}} fin del informe' },
    { name: 'text around token', text: 'Hola {{empresa}}, adiós' },
    { name: 'two adjacent tokens', text: '{{a}}{{b}}' },
    { name: 'two tokens with text between', text: '{{a}} y {{b}}' },
    {
      name: 'mixed simple + table tokens',
      text: 'Informe de {{empresa}} — {{tabla:docs:fecha,monto}}',
    },
  ];

  for (const { name, text } of stringCases) {
    it(`serialize(extract(${name})) === "${text}"`, () => {
      const segments = extractPlaceholders(text);
      expect(serializeExtracted(segments)).toBe(text);
    });
  }
});

describe('round-trip: HTML-fragment edges (tags do not confuse the scanner)', () => {
  // The body load pipeline runs extractPlaceholders on text nodes between
  // HTML block boundaries, but the scanner must also handle a full fragment
  // where the placeholder sits inside an HTML tag pair — the tags are just
  // text to the regex, and the round-trip must be exact.
  const htmlCases: Array<{ name: string; html: string }> = [
    { name: 'token in <p>', html: '<p>{{empresa}}</p>' },
    { name: 'token in <li>', html: '<li>{{empresa}}</li>' },
    { name: 'token in <td>', html: '<td>{{empresa}}</td>' },
    {
      name: 'token in <td> with surrounding text',
      html: '<td>Total: {{monto}}</td>',
    },
    {
      name: 'table token in <li>',
      html: '<li>{{tabla:docs:fecha,monto}}</li>',
    },
    {
      name: 'token at block start with text after',
      html: '<p>{{empresa}} envía resultados</p>',
    },
    {
      name: 'token at block end with text before',
      html: '<p>Resultados para {{empresa}}</p>',
    },
    {
      name: 'token alone in a block',
      html: '<p>{{firma}}</p>',
    },
    {
      name: 'two adjacent tokens in a block',
      html: '<p>{{a}}{{b}}</p>',
    },
  ];

  for (const { name, html } of htmlCases) {
    it(`serialize(extract(${name})) === "${html}"`, () => {
      const segments = extractPlaceholders(html);
      expect(serializeExtracted(segments)).toBe(html);
    });
  }

  it('a token inside <li> is parsed as a token segment (not swallowed by the tag)', () => {
    const segments = extractPlaceholders('<li>{{empresa}}</li>');
    const tokenSeg = segments.find((s) => 'token' in s);
    expect(tokenSeg).toBeDefined();
    expect(tokenSeg).toEqual({ token: { key: 'empresa' } });
  });
});

describe('spec scenario: Round-trip body load preserves chips', () => {
  // GIVEN a stored bodyHtml containing {{empresa}} and {{tabla:examenes:fecha,monto}}
  // WHEN the template is loaded into the editor
  // THEN both placeholders render as token chips with their original attrs
  // AND surrounding text is preserved.
  const bodyHtml = '<p>Hola {{empresa}}</p><p>Adjunto: {{tabla:examenes:fecha,monto}}</p>';

  it('extracts both placeholders as token segments with original attrs', () => {
    const segments = extractPlaceholders(bodyHtml);
    const tokens = segments.filter((s) => 'token' in s);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toEqual({ token: { key: 'empresa' } });
    expect(tokens[1]).toEqual({
      token: {
        key: 'tabla',
        table: 'examenes',
        cols: ['fecha', 'monto'],
      },
    });
  });

  it('preserves surrounding text (HTML tags + literal text)', () => {
    const segments = extractPlaceholders(bodyHtml);
    const textSegments = segments
      .filter((s) => 'text' in s)
      .map((s) => (s as { text: string }).text);
    // The full HTML structure is recoverable from the text segments joined
    // with the encoded tokens.
    expect(serializeExtracted(segments)).toBe(bodyHtml);
    // Sanity: the surrounding text genuinely contains the tag bytes.
    expect(textSegments.join('').length).toBeGreaterThan(0);
  });
});

describe('spec scenario: Malformed placeholder degrades to plain text', () => {
  // GIVEN a stored bodyHtml containing {{empresa (no closing braces)
  // WHEN the template is loaded
  // THEN the malformed text renders as plain text AND the editor does NOT throw.

  it('a {{ without }} is left as a single text segment (no throw)', () => {
    const malformed = 'Hola {{empresa';
    expect(() => extractPlaceholders(malformed)).not.toThrow();
    expect(extractPlaceholders(malformed)).toEqual([{ text: 'Hola {{empresa' }]);
  });

  it('a }} without {{ is left as text (no throw)', () => {
    const malformed = 'empresa}} fin';
    expect(() => extractPlaceholders(malformed)).not.toThrow();
    expect(extractPlaceholders(malformed)).toEqual([{ text: 'empresa}} fin' }]);
  });

  it('a matched-but-invalid table form degrades to text (no throw, no drop)', () => {
    // {{tabla:docs}} is matched by the regex but rejected by parseTokenPlaceholder
    // (wrong colon count). The bytes must survive the round-trip verbatim.
    const malformed = '<p>{{tabla:docs}}</p>';
    expect(() => extractPlaceholders(malformed)).not.toThrow();
    expect(serializeExtracted(extractPlaceholders(malformed))).toBe(malformed);
  });

  it('a malformed placeholder among valid ones preserves the valid tokens', () => {
    const mixed = 'Hola {{empresa}} — {{malformed table: ok?}} adiós';
    const segments = extractPlaceholders(mixed);
    const tokens = segments.filter((s) => 'token' in s);
    // The valid {{empresa}} must still become a token; the malformed one
    // degrades to text. Round-trip is exact.
    expect(tokens).toEqual([{ token: { key: 'empresa' } }]);
    expect(serializeExtracted(segments)).toBe(mixed);
  });
});

describe('unknown token key becomes a token node (validation is at insert time)', () => {
  // The parser does NOT reject keys it doesn't recognise — it returns the
  // attrs and the editor decides whether to allow the chip. This lets an
  // old stored template with a since-renamed token load as a chip.
  it('{{unknownKey}} parses to a token segment (extract keeps empty text neighbours; splitIntoSegments collapses them)', () => {
    // extractPlaceholders keeps the surrounding empty text segments (raw scan):
    expect(extractPlaceholders('{{unknownKey}}')).toEqual([
      { text: '' },
      { token: { key: 'unknownKey' } },
      { text: '' },
    ]);
    // splitIntoSegments collapses the empties → a single token segment:
    expect(splitIntoSegments('{{unknownKey}}')).toEqual([
      { type: 'token', attrs: { key: 'unknownKey' } },
    ]);
  });

  it('an unknown key round-trips through encode/parse exactly', () => {
    const attrs: TokenAttrs = { key: 'unknownKey' };
    expect(parseTokenPlaceholder(encodeToken(attrs))).toEqual(attrs);
  });
});

describe('subject round-trip is exact for every spec scenario', () => {
  // The subject uses splitIntoSegments + serializeSubject (the collapsed
  // shape). The round-trip must hold for every case the editor can produce.
  const subjectCases: Array<{ name: string; subject: string }> = [
    { name: 'spec example Informe — {{fecha}}', subject: 'Informe — {{fecha}}' },
    { name: 'plain subject', subject: 'Resultados consolidados' },
    { name: 'empty subject', subject: '' },
    { name: 'only a token', subject: '{{empresa}}' },
    { name: 'two tokens', subject: '{{empresa}} — {{fecha}}' },
    {
      name: 'table token in subject',
      subject: 'Adjunto {{tabla:docs:fecha,monto}}',
    },
  ];

  for (const { name, subject } of subjectCases) {
    it(`serializeSubject(splitIntoSegments(${name})) === "${subject}"`, () => {
      expect(serializeSubject(splitIntoSegments(subject))).toBe(subject);
    });
  }
});

describe('column order is preserved across the full round-trip', () => {
  // Selection order is significant (design Decision g). (fecha, monto) and
  // (monto, fecha) are DIFFERENT table tokens and must not collapse.
  it('(fecha, monto) ≠ (monto, fecha) through encode → parse → encode', () => {
    const orderA: TokenAttrs = {
      key: 'tabla',
      table: 'docs',
      cols: ['fecha', 'monto'],
    };
    const orderB: TokenAttrs = {
      key: 'tabla',
      table: 'docs',
      cols: ['monto', 'fecha'],
    };
    const encodedA = encodeToken(orderA);
    const encodedB = encodeToken(orderB);
    expect(encodedA).not.toBe(encodedB);
    expect(parseTokenPlaceholder(encodedA)).toEqual(orderA);
    expect(parseTokenPlaceholder(encodedB)).toEqual(orderB);
  });
});
