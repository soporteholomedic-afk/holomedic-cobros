import { describe, it, expect } from 'vitest';

import { documentWithTokensAsText } from '../documentWithTokensAsText';
import { encodeToken } from '../tokenSerializer';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Minimal shape of the `tableContent` block output asserted below.
 * The production return type does not expose `rows` directly, so the
 * tests cast through `unknown` after verifying the runtime shape.
 */
interface TableContentShape {
  rows: Array<{ cells: unknown[] }>;
}

/**
 * Tests for the pre-conversion helper.
 *
 * This helper is the core of the `getHtml` fix: it walks a BlockNote
 * document and substitutes every `token` inline content node with a
 * plain text node containing the `{{token}}` placeholder BEFORE the
 * document is handed to `editor.blocksToHTMLLossy`. The text serializer
 * in BlockNote is stable; the custom inline content `toExternalHTML`
 * path silently fails in our setup, so we route tokens through text.
 *
 * The contract is:
 *  - text nodes are passed through untouched
 *  - token nodes become text nodes with the same `{{token}}` shape
 *    produced by `encodeToken`
 *  - every other block / inline content type is untouched
 *  - blocks whose `content` is NOT an inline array (e.g. `tableContent`
 *    objects) are passed through untouched so BlockNote's table
 *    serializer keeps working
 *  - the result shape matches the input shape (same `PartialBlock[]`
 *    contract BlockNote expects)
 */

describe('documentWithTokensAsText — simple tokens', () => {
  it('converts a single token node to a text node with {{key}}', () => {
    const out = documentWithTokensAsText([
      {
        content: [
          { type: 'text', text: 'Hola ' },
          { type: 'token', props: { key: 'empresa', table: '', cols: '' } },
          { type: 'text', text: ', tu informe.' },
        ],
      },
    ]);
    expect(out[0]?.content?.[1]).toEqual({
      type: 'text',
      text: '{{empresa}}',
      styles: {},
    });
  });

  it('matches encodeToken for a simple token shape', () => {
    const out = documentWithTokensAsText([
      {
        content: [
          { type: 'token', props: { key: 'dni', table: '', cols: '' } },
        ],
      },
    ]);
    const textNode = out[0]?.content?.[0] as unknown as { text: string };
    expect(textNode.text).toBe(encodeToken({ key: 'dni' }));
  });

  it('preserves text nodes verbatim', () => {
    const out = documentWithTokensAsText([
      {
        content: [{ type: 'text', text: 'plain text' }],
      },
    ]);
    expect(out[0]?.content?.[0]).toEqual({ type: 'text', text: 'plain text' });
  });

  it('preserves text styles in untouched text nodes', () => {
    const out = documentWithTokensAsText([
      {
        content: [{ type: 'text', text: 'bold', styles: { bold: true } }],
      },
    ]);
    expect(out[0]?.content?.[0]).toEqual({
      type: 'text',
      text: 'bold',
      styles: { bold: true },
    });
  });
});

describe('documentWithTokensAsText — table tokens', () => {
  it('converts a table token to a text node with {{tabla:name:cols}}', () => {
    const out = documentWithTokensAsText([
      {
        content: [
          {
            type: 'token',
            props: { key: 'tabla', table: 'examenes', cols: 'fecha,resultado' },
          },
        ],
      },
    ]);
    const textNode = out[0]?.content?.[0] as unknown as { text: string };
    expect(textNode.text).toBe('{{tabla:examenes:fecha,resultado}}');
  });

  it('matches encodeToken for a table token with multiple cols', () => {
    const attrs: TokenAttrs = {
      key: 'tabla',
      table: 'documentosVencidos',
      cols: ['fecha', 'monto', 'paciente'],
    };
    const out = documentWithTokensAsText([
      {
        content: [
          {
            type: 'token',
            props: {
              key: attrs.key,
              table: attrs.table,
              cols: attrs.cols?.join(',') ?? '',
            },
          },
        ],
      },
    ]);
    const textNode = out[0]?.content?.[0] as unknown as { text: string };
    expect(textNode.text).toBe(encodeToken(attrs));
  });

  it('matches encodeToken for a table token with empty cols', () => {
    const out = documentWithTokensAsText([
      {
        content: [
          {
            type: 'token',
            props: { key: 'tabla', table: 'docs', cols: '' },
          },
        ],
      },
    ]);
    const textNode = out[0]?.content?.[0] as unknown as { text: string };
    expect(textNode.text).toBe('{{tabla:docs:}}');
  });
});

describe('documentWithTokensAsText — defensive', () => {
  it('handles a token node with missing props gracefully', () => {
    const out = documentWithTokensAsText([
      {
        content: [{ type: 'token' }],
      },
    ]);
    const textNode = out[0]?.content?.[0] as unknown as { text: string };
    // Empty key, no table → produces `{{}}` (a degenerate placeholder)
    expect(textNode.text).toBe('{{}}');
  });

  it('handles a token node with empty key', () => {
    const out = documentWithTokensAsText([
      {
        content: [{ type: 'token', props: { key: '', table: '', cols: '' } }],
      },
    ]);
    const textNode = out[0]?.content?.[0] as unknown as { text: string };
    expect(textNode.text).toBe('{{}}');
  });

  it('returns an empty array unchanged', () => {
    expect(documentWithTokensAsText([])).toEqual([]);
  });

  it('passes through a block with no content', () => {
    const out = documentWithTokensAsText([{ type: 'paragraph' }]);
    expect(out[0]).toEqual({ type: 'paragraph' });
  });

  it('passes through a block whose content is a tableContent object (not an inline array)', () => {
    // BlockNote table blocks hold a `TableContent` OBJECT in `content`,
    // not an array of inline content. We must NOT try to walk it as an
    // array — that's exactly the path that broke table rendering when
    // we tried a full custom serializer.
    const tableBlock = {
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [{ cells: [[{ type: 'text', text: 'cell' }]] }],
      },
    };
    const out = documentWithTokensAsText([tableBlock]);
    expect(out[0]).toBe(tableBlock);
  });
});

describe('documentWithTokensAsText — mixed content', () => {
  it('preserves the canonical spitch-001 shape after substitution', () => {
    const out = documentWithTokensAsText([
      {
        content: [
          { type: 'text', text: 'Estimado(a) equipo de ' },
          { type: 'token', props: { key: 'empresa', table: '', cols: '' } },
          { type: 'text', text: ',' },
        ],
      },
      {
        content: [
          { type: 'text', text: 'Total de pacientes: ' },
          {
            type: 'token',
            props: { key: 'totalPacientes', table: '', cols: '' },
          },
        ],
      },
    ]);
    // The token slots now contain the placeholder text so the eventual
    // text serialization in blocksToHTMLLossy produces {{empresa}} and
    // {{totalPacientes}} literally.
    expect(out[0]?.content?.[1]).toEqual({
      type: 'text',
      text: '{{empresa}}',
      styles: {},
    });
    expect(out[1]?.content?.[1]).toEqual({
      type: 'text',
      text: '{{totalPacientes}}',
      styles: {},
    });
  });

  it('does not mutate the input array (pure)', () => {
    const input = [
      {
        content: [
          { type: 'token', props: { key: 'empresa', table: '', cols: '' } },
        ],
      },
    ];
    const original = JSON.parse(JSON.stringify(input));
    documentWithTokensAsText(input);
    expect(input).toEqual(original);
  });
});

describe('documentWithTokensAsText — tokens inside table cells', () => {
  it('converts a token in a bare-array table cell', () => {
    const tableBlock = {
      type: 'table',
      content: {
        type: 'tableContent',
        columnWidths: [100],
        rows: [
          {
            cells: [
              [
                { type: 'text', text: 'Dato: ' },
                { type: 'token', props: { key: 'dni', table: '', cols: '' } },
              ],
            ],
          },
        ],
      },
    };
    const out = documentWithTokensAsText([tableBlock]);
    const outTc = out[0]!.content as unknown as TableContentShape;
    expect(outTc.rows[0].cells[0]).toEqual([
      { type: 'text', text: 'Dato: ' },
      { type: 'text', text: '{{dni}}', styles: {} },
    ]);
  });

  it('converts a token in a TableCell container cell', () => {
    const tableBlock = {
      type: 'table',
      content: {
        type: 'tableContent',
        columnWidths: [100],
        rows: [
          {
            cells: [
              {
                type: 'tableCell',
                props: { backgroundColor: 'default' },
                content: [
                  { type: 'token', props: { key: 'dni', table: '', cols: '' } },
                ],
              },
            ],
          },
        ],
      },
    };
    const out = documentWithTokensAsText([tableBlock]);
    const outTc = out[0]!.content as unknown as TableContentShape;
    expect(outTc.rows[0].cells[0]).toEqual({
      type: 'tableCell',
      props: { backgroundColor: 'default' },
      content: [
        { type: 'text', text: '{{dni}}', styles: {} },
      ],
    });
  });

  it('preserves the block reference if a table block contains no tokens', () => {
    const tableBlock = {
      type: 'table',
      content: {
        type: 'tableContent',
        columnWidths: [100],
        rows: [
          {
            cells: [
              [
                { type: 'text', text: 'plain text' },
              ],
            ],
          },
        ],
      },
    };
    const out = documentWithTokensAsText([tableBlock]);
    expect(out[0]).toBe(tableBlock);
  });
});

