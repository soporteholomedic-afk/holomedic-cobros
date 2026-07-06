import { describe, it, expect } from 'vitest';

import { splitIntoSegments, serializeSubject } from '../splitIntoSegments';
import type { SubjectSegment } from '../splitIntoSegments';

/**
 * Unit tests for `splitIntoSegments` + `serializeSubject` — the subject-line
 * parse/serialize pair.
 *
 * Spec `email-template-editor` / "Interactive subject with token chips":
 *  - "Subject round-trip": GIVEN a subject string `Informe — {{fecha}}`,
 *    WHEN it is parsed into segments and re-serialized, THEN the output
 *    equals `Informe — {{fecha}}` AND empty text segments are collapsed.
 *
 * Design Decision d: the subject uses the SAME `extractPlaceholders` helper
 * as the body, but a different segment shape (`{type:'text',value}` |
 * `{type:'token',attrs}`) and empty text segments are collapsed (a single
 * line doesn't need the body's "token at boundary" fidelity).
 *
 * Both functions are runtime value exports so this import fails first — a
 * real RED.
 */
describe('splitIntoSegments', () => {
  describe('text with no placeholders', () => {
    it('returns a single text segment for plain text', () => {
      expect(splitIntoSegments('plain text')).toEqual([
        { type: 'text', value: 'plain text' },
      ]);
    });

    it('returns an empty array for the empty string (empty text collapsed)', () => {
      expect(splitIntoSegments('')).toEqual([]);
    });
  });

  describe('tokens', () => {
    it('parses a lone simple-token subject (empty text segments collapsed)', () => {
      expect(splitIntoSegments('{{empresa}}')).toEqual([
        { type: 'token', attrs: { key: 'empresa' } },
      ]);
    });

    it('parses a subject with text before and after a token', () => {
      expect(splitIntoSegments('Informe — {{fecha}}')).toEqual([
        { type: 'text', value: 'Informe — ' },
        { type: 'token', attrs: { key: 'fecha' } },
      ]);
    });

    it('parses adjacent tokens with no text between (empties collapsed)', () => {
      expect(splitIntoSegments('{{a}}{{b}}')).toEqual([
        { type: 'token', attrs: { key: 'a' } },
        { type: 'token', attrs: { key: 'b' } },
      ]);
    });

    it('parses a table token into its attrs', () => {
      expect(
        splitIntoSegments('{{tabla:docs:fecha,monto}}'),
      ).toEqual([
        {
          type: 'token',
          attrs: {
            key: 'tabla',
            table: 'docs',
            cols: ['fecha', 'monto'],
          },
        },
      ]);
    });

    it('preserves column order from the placeholder', () => {
      const segs = splitIntoSegments('{{tabla:docs:monto,fecha}}');
      expect(segs).toHaveLength(1);
      expect(segs[0]).toEqual({
        type: 'token',
        attrs: { key: 'tabla', table: 'docs', cols: ['monto', 'fecha'] },
      });
    });
  });

  describe('malformed placeholders degrade to text', () => {
    it('leaves a {{ without }} as a text segment', () => {
      expect(splitIntoSegments('hello {{empresa')).toEqual([
        { type: 'text', value: 'hello {{empresa' },
      ]);
    });

    it('leaves a matched-but-invalid table form as a text segment', () => {
      expect(splitIntoSegments('{{tabla:docs}}')).toEqual([
        { type: 'text', value: '{{tabla:docs}}' },
      ]);
    });
  });
});

describe('serializeSubject', () => {
  it('serializes a single text segment to its value', () => {
    expect(serializeSubject([{ type: 'text', value: 'Hello' }])).toBe('Hello');
  });

  it('serializes a single token segment to its {{token}} placeholder', () => {
    expect(
      serializeSubject([{ type: 'token', attrs: { key: 'empresa' } }]),
    ).toBe('{{empresa}}');
  });

  it('serializes a table token segment preserving column order', () => {
    expect(
      serializeSubject([
        {
          type: 'token',
          attrs: { key: 'tabla', table: 'docs', cols: ['fecha', 'monto'] },
        },
      ]),
    ).toBe('{{tabla:docs:fecha,monto}}');
  });

  it('concatenates mixed segments in order', () => {
    const segments: SubjectSegment[] = [
      { type: 'text', value: 'Informe — ' },
      { type: 'token', attrs: { key: 'fecha' } },
      { type: 'text', value: ' para ' },
      { type: 'token', attrs: { key: 'empresa' } },
    ];
    expect(serializeSubject(segments)).toBe('Informe — {{fecha}} para {{empresa}}');
  });

  it('serializes the empty segment list to the empty string', () => {
    expect(serializeSubject([])).toBe('');
  });
});

describe('subject round-trip: serialize(parse(s)) === s', () => {
  const cases: Array<{ name: string; subject: string }> = [
    { name: 'plain text', subject: 'plain text' },
    { name: 'empty string', subject: '' },
    { name: 'lone simple token', subject: '{{empresa}}' },
    { name: 'text + token', subject: 'Informe — {{fecha}}' },
    { name: 'token + text', subject: '{{fecha}} fin' },
    { name: 'adjacent tokens', subject: '{{a}}{{b}}' },
    { name: 'table token', subject: '{{tabla:docs:fecha,monto}}' },
    {
      name: 'mixed text + two tokens',
      subject: 'Informe — {{fecha}} para {{empresa}}',
    },
  ];

  for (const { name, subject } of cases) {
    it(`round-trips: ${name} — "${subject}"`, () => {
      const segments = splitIntoSegments(subject);
      expect(serializeSubject(segments)).toBe(subject);
    });
  }
});
