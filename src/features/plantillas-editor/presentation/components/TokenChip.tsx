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
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ' +
        'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200 ' +
        'select-none cursor-default align-middle ' +
        (className ?? '')
      }
    >
      {label}
    </span>
  );
}
