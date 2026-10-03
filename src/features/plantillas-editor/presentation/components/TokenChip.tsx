import type { TokenAttrs } from '../../domain/entities';

/**
 * Props for `TokenChip`.
 *
 * `label` is the human-readable text resolved from `areaConfig` by the
 * parent (palette, subject input, or the BlockNote `token` inline-content
 * spec render). `attrs` is optional: the palette renders chips from
 * `TokenDef` (label-only, before columns are chosen in the picker); body
 * and subject chips carry the full `TokenAttrs`.
 */
export interface TokenChipProps {
  label: string;
  attrs?: TokenAttrs;
  /** Optional class override for drag-handle / sortable contexts. */
  className?: string;
}

/**
 * A non-editable pill that renders a token's human label.
 *
 * Used in three places:
 *  1. `TokenPalette` — each palette entry is a draggable `TokenChip`.
 *  2. `SubjectTokenInput` — each token segment renders a `TokenChip`.
 *  3. The BlockNote `token` inline-content spec render — wraps `TokenChip`
 *     so the body chip and the palette chip look identical.
 *
 * Purely presentational: no hooks, no event handlers, no browser APIs — so
 * it does NOT need `"use client"`. It renders identically on the server and
 * the client and is safe to import from either.
 *
 * The `data-token-*` attributes let integration tests and the editor
 * inspect a chip's attrs (e.g. to open the column picker on click). The pill
 * is explicitly `contentEditable="false"` so ProseMirror treats it as an
 * atomic inline node (the user cannot type into it).
 */
export function TokenChip({ label, attrs, className }: TokenChipProps) {
  const dataAttrs: Record<string, string> = {};
  if (attrs) {
    dataAttrs['data-token-key'] = attrs.key;
    if (attrs.table) dataAttrs['data-token-table'] = attrs.table;
    if (attrs.cols) dataAttrs['data-token-cols'] = attrs.cols.join(',');
  }
  return (
    <span
      contentEditable={false}
      role="img"
      aria-label={label}
      data-token-chip=""
      {...dataAttrs}
      className={
        'inline-flex max-w-full items-center rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold leading-5 text-sky-900 ' +
        'dark:border-sky-700/80 dark:bg-sky-950/70 dark:text-sky-100 ' +
        'select-none cursor-default align-middle break-words [overflow-wrap:anywhere] ' +
        (className ?? '')
      }
    >
      {label}
    </span>
  );
}
