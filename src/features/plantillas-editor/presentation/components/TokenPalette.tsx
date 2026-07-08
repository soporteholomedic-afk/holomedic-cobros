'use client';

import { useDraggable } from '@dnd-kit/core';

import type {
  AreaConfig,
  TokenDef,
} from '../../infrastructure/areaConfigRegistry';
import type { TokenAttrs } from '../../domain/entities';
import { TokenChip } from './TokenChip';

/**
 * Props for `TokenPalette`.
 *
 * `areaConfig` is the CURRENT area's config (the parent Server Component
 * resolved it and the editor received it as a serializable prop). The
 * palette reads `availableTokens` ONLY — tokens from other areas never
 * appear (spec "Palette shows only current area tokens").
 *
 * `onPickTable` is fired when the user clicks a table chip (`isTable:true`).
 * The parent opens `ColumnPicker` for that table's columns; the composed
 * `{{tabla:name:c1,c2}}` token is then inserted via the editor's insert
 * path. Simple (non-table) chips are DRAGGED into the body/subject — the
 * `DndContext` ancestor (owned by `TemplateEditor`) carries the chip's
 * `TokenAttrs` in the drag payload.
 */
export interface TokenPaletteProps {
  areaConfig: AreaConfig;
  onPickTable: (token: TokenDef) => void;
}

/**
 * A palette of token chips grouped by category, filtered to the current
 * area's `areaConfig.availableTokens`.
 *
 * - Simple chips: draggable via `@dnd-kit/core` `useDraggable`. The drag
 *   payload is `{ type: 'token', attrs: { key } }` so the editor's
 *   `onDragEnd` can insert the token at the drop target (body or subject).
 * - Table chips: click-to-open-picker (design Decision g) — a `<button>`
 *   that calls `onPickTable(token)`. Table chips are NOT draggable because
 *   their columns must be chosen before insertion.
 */
export function TokenPalette({ areaConfig, onPickTable }: TokenPaletteProps) {
  return (
    <aside
      data-testid="token-palette"
      aria-label={`Paleta de tokens — ${areaConfig.label}`}
      className="space-y-4"
    >
      {areaConfig.availableTokens.map((category) => (
        <section key={category.category}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            {category.category}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {category.tokens.map((token) => (
              <li key={`${category.category}-${token.key}-${token.label}`}>
                {token.isTable === true ? (
                  <button
                    type="button"
                    onClick={() => onPickTable(token)}
                    aria-label={`Insertar tabla ${token.label}`}
                    className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-md"
                  >
                    <TokenChip
                      label={token.label}
                      attrs={{
                        key: token.key,
                        table: token.tableRef,
                      }}
                    />
                  </button>
                ) : (
                  <DraggableSimpleChip token={token} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}

/**
 * A single draggable simple-token chip. Isolated into its own component so
 * the `useDraggable` hook runs per-chip (hooks cannot be called inside a
 * `.map` callback in the parent without violating the rules of hooks).
 */
function DraggableSimpleChip({ token }: { token: TokenDef }) {
  const attrs: TokenAttrs = { key: token.key };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `palette-${token.key}-${token.label}`,
    data: { type: 'token', attrs, label: token.label },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`palette-chip-${token.key}`}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="cursor-grab active:cursor-grabbing"
    >
      <TokenChip label={token.label} attrs={attrs} />
    </div>
  );
}
