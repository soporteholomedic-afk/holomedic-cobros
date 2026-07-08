import { describe, it, expect } from 'vitest';

import { postProcessTokenBlocks } from '../postProcessTokenBlocks';
import type {
  BlockLike,
  TextInlineContent,
  TokenInlineContent,
} from '../postProcessTokenBlocks';

/**
 * Unit tests for `postProcessTokenBlocks` — the pure core of the body LOAD
 * pipeline (design Decision c).
 *
 * After BlockNote `tryParseHTMLToBlocks(html)` produces a doc with `{{token}}`
 * as PLAIN TEXT inline nodes, this walk splits each text node's `{{token}}`
 * placeholders into `token` inline-content nodes (so the editor shows chips,
 * not raw `{{...}}` text). Non-text inline content passes through unchanged.
 *
 * BlockNote is NOT imported here — the helper operates on a structural
 * `BlockLike` shape, so it is tested without any BlockNote mock. The
 * TemplateEditor wires it between `tryParseHTMLToBlocks` and `replaceBlocks`.
 */
type AnyInline = TextInlineContent | TokenInlineContent | { type: string; text?: string; [k: string]: unknown };

function textInline(text: string, styles?: Record<string, unknown>): TextInlineContent {
  return { type: 'text', text, styles };
}
function tokenInline(key: string, table = '', cols = ''): TokenInlineContent {
  return { type: 'token', props: { key, table, cols } };
}
function block(content: AnyInline[], children: BlockLike[] = []): BlockLike {
  return { id: 'b1', type: 'paragraph', content, children };
}

describe('postProcessTokenBlocks', () => {
  describe('text without placeholders passes through unchanged', () => {
    it('leaves a plain-text block content untouched', () => {
      const blocks = [block([textInline('Hello world')])];
      const out = postProcessTokenBlocks(blocks);
      expect(out).toEqual(blocks);
    });

    it('leaves a block with no content untouched', () => {
      const blocks = [{ id: 'b', type: 'image', props: { url: 'x' } }];
      expect(postProcessTokenBlocks(blocks)).toEqual(blocks);
    });
  });

  describe('splits {{token}} text into text + token inline content', () => {
    it('splits "Hello {{empresa}}" into [text, token]', () => {
      const blocks = [block([textInline('Hello {{empresa}}')])];
      const out = postProcessTokenBlocks(blocks);
      expect(out[0]!.content).toEqual([
        textInline('Hello '),
        tokenInline('empresa'),
      ]);
    });

    it('splits "{{empresa}} bye" into [token, text]', () => {
      const blocks = [block([textInline('{{empresa}} bye')])];
      const out = postProcessTokenBlocks(blocks);
      expect(out[0]!.content).toEqual([
        tokenInline('empresa'),
        textInline(' bye'),
      ]);
    });

    it('splits "a {{x}} b {{y}} c" into [text, token, text, token, text]', () => {
      const blocks = [block([textInline('a {{x}} b {{y}} c')])];
      const out = postProcessTokenBlocks(blocks);
      expect(out[0]!.content).toEqual([
        textInline('a '),
        tokenInline('x'),
        textInline(' b '),
        tokenInline('y'),
        textInline(' c'),
      ]);
    });

    it('splits a lone {{tabla:docs:fecha,monto}} into a token with cols joined by comma', () => {
      const blocks = [block([textInline('{{tabla:docs:fecha,monto}}')])];
      const out = postProcessTokenBlocks(blocks);
      expect(out[0]!.content).toEqual([
        tokenInline('tabla', 'docs', 'fecha,monto'),
      ]);
    });

    it('preserves styles on the surviving text segments', () => {
      const styles = { textColor: 'red' };
      const blocks = [block([textInline('Hi {{empresa}}', styles)])];
      const out = postProcessTokenBlocks(blocks);
      const textSeg = out[0]!.content![0] as TextInlineContent;
      expect(textSeg.styles).toEqual(styles);
      // The token segment has no styles (it is not styled text).
      const tokenSeg = out[0]!.content![1] as TokenInlineContent;
      expect('styles' in tokenSeg).toBe(false);
    });
  });

  describe('malformed placeholders stay as text (never throw, never drop)', () => {
    it('leaves a {{ without }} as a single text segment', () => {
      const blocks = [block([textInline('hello {{empresa world')])];
      const out = postProcessTokenBlocks(blocks);
      expect(out[0]!.content).toEqual([textInline('hello {{empresa world')]);
    });

    it('leaves a matched-but-invalid table form as text', () => {
      const blocks = [block([textInline('{{tabla:docs}}')])];
      const out = postProcessTokenBlocks(blocks);
      expect(out[0]!.content).toEqual([textInline('{{tabla:docs}}')]);
    });
  });

  describe('unknown token key becomes a token node (validation at insert time)', () => {
    it('splits {{unknownKey}} into a token segment (not rejected)', () => {
      const blocks = [block([textInline('{{unknownKey}}')])];
      const out = postProcessTokenBlocks(blocks);
      expect(out[0]!.content).toEqual([tokenInline('unknownKey')]);
    });
  });

  describe('non-text inline content passes through', () => {
    it('leaves a link inline content untouched', () => {
      const link = { type: 'link', href: 'https://x', content: [textInline('link')] };
      const blocks = [block([textInline('See '), link as unknown as AnyInline])];
      const out = postProcessTokenBlocks(blocks);
      // The text before the link is plain (no placeholder) → unchanged.
      // The link passes through unchanged.
      expect(out[0]!.content![0]).toEqual(textInline('See '));
      expect(out[0]!.content![1]).toEqual(link);
    });
  });

  describe('recurses into children', () => {
    it('splits placeholders inside a child block', () => {
      const child = block([textInline('child {{fecha}}')]);
      const blocks = [{ ...block([]), children: [child] }];
      const out = postProcessTokenBlocks(blocks);
      const outChild = out[0]!.children![0];
      expect(outChild.content).toEqual([
        textInline('child '),
        tokenInline('fecha'),
      ]);
    });
  });

  describe('spec scenario: Round-trip body load preserves chips', () => {
    it('two placeholders in one block both become token nodes with original attrs', () => {
      const blocks = [
        block([textInline('Hola {{empresa}} — {{tabla:examenes:fecha,monto}}')]),
      ];
      const out = postProcessTokenBlocks(blocks);
      expect(out[0]!.content).toEqual([
        textInline('Hola '),
        tokenInline('empresa'),
        textInline(' — '),
        tokenInline('tabla', 'examenes', 'fecha,monto'),
      ]);
    });
  });
});
