/**
 * Pre-convert `token` inline content nodes in a BlockNote document to
 * plain text nodes containing the `{{token}}` placeholder.
 *
 * Used by `BlockNoteEditorView.getHtml` immediately before calling
 * `editor.blocksToHTMLLossy`. The reason is that BlockNote's
 * `toExternalHTML` path for custom inline content goes through a React
 * portal (`renderToDOMSpec` → `elementRenderer`) that silently renders
 * an empty `<span></span>` in our setup — the browser surfaces this as
 * "ReactInlineContentSpec: renderHTML() failed" — so the saved HTML
 * would lack the `{{token}}` text. Pre-converting to text nodes
 * sidesteps the broken portal: the standard text serializer is stable
 * and matches the behaviour of typing `{{token}}` by hand.
 *
 * Pure: takes a `PartialBlock[]`-shaped array, returns a new array of
 * the same shape. No BlockNote import, no DOM access, fully testable.
 *
 * Only `token` nodes are touched. Every other block / inline content
 * type (tables, lists, headings, links, text) is passed through
 * untouched so BlockNote's own serializers handle them normally.
 */
export interface BlockLike {
  content?: Array<Record<string, unknown>> | Record<string, unknown>;
  children?: BlockLike[];
  [key: string]: unknown;
}

export type DocLike = BlockLike[];

interface TokenNodeProps {
  key?: string;
  table?: string;
  cols?: string;
}

interface TableCellLike {
  type: 'tableCell';
  props?: Record<string, unknown>;
  content: Array<Record<string, unknown>>;
}

interface TableContentLike {
  type: 'tableContent';
  rows: Array<{ cells: Array<Array<Record<string, unknown>> | TableCellLike> }>;
  [key: string]: unknown;
}

function tokenNodeToText(node: Record<string, unknown>): Record<string, unknown> {
  const props = (node.props as TokenNodeProps | undefined) ?? {};
  const key = props.key ?? '';
  const table = props.table ?? '';
  const cols = props.cols ?? '';
  const placeholder = table ? `{{${key}:${table}:${cols}}}` : `{{${key}}}`;
  return { type: 'text', text: placeholder, styles: {} };
}

function isTableContent(c: unknown): c is TableContentLike {
  return c !== null && typeof c === 'object' && (c as { type?: unknown }).type === 'tableContent';
}

function isTableCellLike(c: unknown): c is TableCellLike {
  return c !== null && typeof c === 'object' && (c as { type?: unknown }).type === 'tableCell';
}

function processContent(content: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  let changed = false;
  const next = content.map((node) => {
    if (node.type === 'token') {
      changed = true;
      return tokenNodeToText(node);
    }
    return node;
  });
  return changed ? next : content;
}

function processTableCell(
  cell: Array<Record<string, unknown>> | TableCellLike,
): Array<Record<string, unknown>> | TableCellLike {
  if (Array.isArray(cell)) {
    const next = processContent(cell);
    return next === cell ? cell : next;
  }
  if (isTableCellLike(cell)) {
    const nextContent = processContent(cell.content);
    if (nextContent === cell.content) return cell;
    return { ...cell, content: nextContent };
  }
  return cell;
}

function processTableContent(tc: TableContentLike): TableContentLike {
  let changed = false;
  const nextRows = tc.rows.map((row) => {
    let rowChanged = false;
    const nextCells = row.cells.map((cell) => {
      const nextCell = processTableCell(cell);
      if (nextCell !== cell) {
        rowChanged = true;
      }
      return nextCell;
    });
    if (rowChanged) {
      changed = true;
      return { ...row, cells: nextCells };
    }
    return row;
  });
  if (changed) {
    return { ...tc, rows: nextRows };
  }
  return tc;
}

function processBlockContent(content: BlockLike['content']): BlockLike['content'] {
  if (Array.isArray(content)) {
    return processContent(content);
  }
  if (isTableContent(content)) {
    return processTableContent(content);
  }
  return content;
}

function processBlock(block: BlockLike): BlockLike {
  const nextContent = processBlockContent(block.content);
  const nextChildren = block.children ? block.children.map(processBlock) : block.children;
  if (nextContent === block.content && nextChildren === block.children) {
    return block;
  }
  return {
    ...block,
    ...(nextContent !== undefined ? { content: nextContent } : {}),
    ...(nextChildren !== undefined ? { children: nextChildren } : {}),
  };
}

export function documentWithTokensAsText<T extends DocLike>(doc: T): T {
  return doc.map(processBlock) as T;
}
