'use client';

import { useState } from 'react';

import type { PredefinedTable } from '../../infrastructure/areaConfigRegistry';
import type { TokenAttrs } from '../../domain/entities';

/**
 * Props for `ColumnPicker`.
 *
 * `predefinedTable` is the table whose columns are offered (resolved by the
 * parent from `areaConfig.predefinedTables` using the clicked chip's
 * `tableRef`). `initialCols` is set in EDIT mode — the chip's current
 * columns, used to pre-populate the selection. `onConfirm` receives the
 * composed `{ key: 'tabla', table, cols }` attrs with `cols` in selection
 * order; the parent decides whether to INSERT (new chip) or UPDATE IN PLACE
 * (existing chip's attrs via a ProseMirror transaction).
 */
export interface ColumnPickerProps {
  predefinedTable: PredefinedTable;
  onConfirm: (attrs: TokenAttrs) => void;
  onCancel: () => void;
  initialCols?: string[];
}

/**
 * A popover that lets the user pick which columns a `{{tabla:name:c1,c2}}`
 * token selects, in selection order (design Decision g).
 *
 * - Checkboxes are displayed in the predefined table's column order.
 * - The SELECTION order is the order the user checks boxes — checking
 *   `monto` then `fecha` yields `cols: ['monto', 'fecha']`, different from
 *   `['fecha', 'monto']`. Unchecking removes the column from the selection.
 * - The confirm button is disabled until at least one column is selected
 *   (spec: "selects 1+ columns").
 * - In EDIT mode (`initialCols` provided), the selection initialises from
 *   the chip's current columns in their stored order, and confirm is
 *   enabled immediately.
 *
 * The component is agnostic to insert-vs-edit — it only emits the composed
 * `TokenAttrs`. The parent routes the result.
 */
export function ColumnPicker({
  predefinedTable,
  onConfirm,
  onCancel,
  initialCols,
}: ColumnPickerProps) {
  // Selection order is significant — an array of column keys in check order.
  const [selected, setSelected] = useState<string[]>(
    initialCols ? [...initialCols] : [],
  );

  function toggleColumn(colKey: string) {
    setSelected((prev) =>
      prev.includes(colKey)
        ? prev.filter((k) => k !== colKey)
        : [...prev, colKey],
    );
  }

  function handleConfirm() {
    onConfirm({
      key: 'tabla',
      table: predefinedTable.name,
      cols: selected,
    });
  }

  return (
    <div
      role="dialog"
      aria-label={`Seleccionar columnas — ${predefinedTable.label}`}
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-3 space-y-2 w-64"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {predefinedTable.label}
      </p>
      <ul className="space-y-1">
        {predefinedTable.columns.map((col) => {
          const checked = selected.includes(col.key);
          return (
            <li key={col.key}>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleColumn(col.key)}
                  aria-label={col.label}
                />
                {col.label}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={selected.length === 0}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Insertar
        </button>
      </div>
    </div>
  );
}
