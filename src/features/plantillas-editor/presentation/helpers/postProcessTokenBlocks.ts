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
 * A `tableContent` shape (BlockNote v0.51 blocks with `content: "table"` tag
 * — e.g. the default `table` block). `content` is NOT an array of inline
 * content; it is this single object holding rows of cells, and each cell is
 * either a bare `InlineContent[]` (the historical form) or a `TableCell`
 * wrapper (with `props` and `content`). We mirror both forms here so the
 * helper stays pure (no `@blocknote/core` import).
 */
export interface TableCellLike {
  type: 'tableCell';
  props?: Record<string, unknown>;
  content: AnyInlineContent[];
}

export interface TableContentLike {
  type: 'tableContent';
  columnWidths: (number | undefined)[];
  headerRows?: number;
  headerCols?: number;
  rows: Array<{ cells: Array<AnyInlineContent[] | TableCellLike> }>;
}

/**
 * A structural BlockNote block shape — the minimum `postProcessTokenBlocks`
 * needs to introspect. Real BlockNote blocks carry more fields (props, id,
 * etc.); they pass through untouched because this walk only rewrites
 * `content` and recurses into `children`.
 *
 * `content` is a UNION on purpose: BlockNote blocks use three different
 * shapes depending on the `content` tag of their spec:
 *   - `"inline"` → `InlineContent[]` (paragraphs, headings, list items…)
 *   - `"table"`  → `TableContentLike` (the default `table` block)
 *   - `"none"`   → `undefined` (image, video, audio, file…)
 * The first shape is the one we split `{{token}}` placeholders out of; the
 * second we recurse into cell-by-cell; the third we pass through.
 */
export interface BlockLike {
  id?: string;
  type?: string;
  content?: AnyInlineContent[] | TableContentLike;
  children?: BlockLike[];
  [k: string]: unknown;
}

function isTextInline(c: AnyInlineContent): c is TextInlineContent {
  return c !== null && typeof c === 'object' && (c as { type?: unknown }).type === 'text';
}

function isTableContent(c: unknown): c is TableContentLike {
  return c !== null && typeof c === 'object' && (c as { type?: unknown }).type === 'tableContent';
}

function isTableCellLike(c: unknown): c is TableCellLike {
  return c !== null && typeof c === 'object' && (c as { type?: unknown }).type === 'tableCell';
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
  const nextContent = processBlockContent(block.content);
  const nextChildren = block.children ? block.children.map(processBlock) : block.children;
  if (nextContent === block.content && nextChildren === block.children) {
    return block;
  }
  return { ...block, content: nextContent, children: nextChildren };
}

/**
 * Dispatcher for `block.content`. Centralises the type-narrowing: we only
 * walk into an array of inline content (the `"inline"` block case) or a
 * `tableContent` object (the `"table"` block case). Anything else
 * (`undefined` for `"none"` blocks, or a future BlockNote shape we don't
 * recognise) passes through verbatim — never iterated, never thrown on.
 *
 * This is the chokepoint that prevents the `content is not iterable` crash
 * reported when a template's body HTML contains a literal `<table>`
 * (BlockNote parses it into a `table` block whose `content` is a
 * `TableContent` object, not an array).
 */
function processBlockContent(content: BlockLike['content']): BlockLike['content'] {
  if (Array.isArray(content)) {
    return processContent(content);
  }
  if (isTableContent(content)) {
    return processTableContent(content);
  }
  return content;
}

function processTableContent(tc: TableContentLike): TableContentLike {
  return {
    ...tc,
    rows: tc.rows.map((row) => ({
      ...row,
      cells: row.cells.map(processTableCell),
    })),
  };
}

function processTableCell(
  cell: AnyInlineContent[] | TableCellLike,
): AnyInlineContent[] | TableCellLike {
  if (Array.isArray(cell)) {
    return processContent(cell);
  }
  if (isTableCellLike(cell)) {
    return { ...cell, content: processContent(cell.content) };
  }
  return cell;
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
