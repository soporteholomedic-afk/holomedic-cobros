import { extractPlaceholders } from './extractPlaceholders';

/**
 * A text inline-content node — the shape BlockNote produces for plain/styled
 * text after `tryParseHTMLToBlocks`. The `styles` field is optional because
 * plain text has no styles.
 */
export interface TextInlineContent {
  type: 'text';
  text: string;
  styles?: Record<string, unknown>;
}

/**
 * A `token` custom inline-content node — the shape BlockNote stores for a
 * chip. `props.cols` is a comma-joined STRING (BlockNote's `PropSchema` only
 * accepts boolean/number/string, so an array is serialised at the boundary).
 * The renderer splits it back into an array for `TokenChip`/`encodeToken`.
 */
export interface TokenInlineContent {
  type: 'token';
  props: { key: string; table: string; cols: string };
}

/**
 * Any other inline-content node (link, etc.). `postProcessTokenBlocks` does
 * NOT introspect these — they pass through verbatim.
 */
export type OtherInlineContent = {
  type: string;
  text?: string;
  [k: string]: unknown;
};

export type AnyInlineContent = TextInlineContent | TokenInlineContent | OtherInlineContent;

/**
 * A structural BlockNote block shape — the minimum `postProcessTokenBlocks`
 * needs to introspect. Real BlockNote blocks carry more fields (props, id,
 * etc.); they pass through untouched because this walk only rewrites
 * `content` and recurses into `children`.
 */
export interface BlockLike {
  id?: string;
  type?: string;
  content?: AnyInlineContent[];
  children?: BlockLike[];
  [k: string]: unknown;
}

function isTextInline(c: AnyInlineContent): c is TextInlineContent {
  return c !== null && typeof c === 'object' && (c as { type?: unknown }).type === 'text';
}

/**
 * The pure core of the body LOAD pipeline (design Decision c).
 *
 * After `editor.tryParseHTMLToBlocks(html)` produces a doc where `{{token}}`
 * placeholders are PLAIN TEXT inside text inline-content nodes, this walk
 * splits each such text node into `[textBefore, TokenNode, textAfter, ...]`
 * so the editor shows chips instead of raw `{{...}}` text. Non-text inline
 * content (links, existing token nodes) passes through unchanged. Recurses
 * into nested `children`.
 *
 * Malformed placeholders (e.g. `{{empresa` with no closing braces, or
 * `{{tabla:docs}}` with the wrong colon count) are left as text —
 * `extractPlaceholders` already degrades them, so they survive verbatim and
 * the editor never throws (spec "Malformed placeholder degrades to plain
 * text"). Unknown keys (e.g. `{{oldToken}}`) become token nodes — validation
 * is at INSERT time, not parse time.
 *
 * The returned `token` props carry `cols` as a comma-joined STRING (BlockNote
 * `PropSchema` constraint). The renderer/serializer split it back into an
 * array at the boundary.
 *
 * Pure: no side effects, no BlockNote import. Tested without any BlockNote
 * mock; `TemplateEditor` wires it between `tryParseHTMLToBlocks` and
 * `replaceBlocks`.
 */
export function postProcessTokenBlocks(blocks: BlockLike[]): BlockLike[] {
  return blocks.map(processBlock);
}

function processBlock(block: BlockLike): BlockLike {
  const nextContent = block.content ? processContent(block.content) : block.content;
  const nextChildren = block.children ? block.children.map(processBlock) : block.children;
  if (nextContent === block.content && nextChildren === block.children) {
    return block;
  }
  return { ...block, content: nextContent, children: nextChildren };
}

function processContent(content: AnyInlineContent[]): AnyInlineContent[] {
  const out: AnyInlineContent[] = [];
  for (const node of content) {
    if (!isTextInline(node)) {
      out.push(node);
      continue;
    }
    const segments = extractPlaceholders(node.text);
    // If there are no token segments, extractPlaceholders returns a single
    // text segment equal to the original — keep the original node verbatim
    // (preserves identity for non-placeholder text).
    if (!segments.some((s) => 'token' in s)) {
      out.push(node);
      continue;
    }
    for (const seg of segments) {
      if ('token' in seg) {
        out.push({
          type: 'token',
          props: {
            key: seg.token.key,
            table: seg.token.table ?? '',
            cols: (seg.token.cols ?? []).join(','),
          },
        } as TokenInlineContent);
      } else {
        // Skip empty text segments — a token at a text-node boundary must
        // NOT leave a zero-length text node behind it (the body-load
        // pipeline collapses empties, like splitIntoSegments does for the
        // subject). The round-trip stays exact: empty text contributes "".
        if (seg.text.length === 0) continue;
        // Re-emit the text segment with the original styles preserved.
        const textSeg: TextInlineContent = { type: 'text', text: seg.text };
        if (node.styles !== undefined) textSeg.styles = node.styles;
        out.push(textSeg);
      }
    }
  }
  return out;
}
