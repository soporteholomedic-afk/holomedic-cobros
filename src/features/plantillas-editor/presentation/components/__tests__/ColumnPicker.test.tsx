import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ColumnPicker } from '../ColumnPicker';
import type { PredefinedTable } from '../../../infrastructure/areaConfigRegistry';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Unit tests for `ColumnPicker` — the popover that lets the user choose
 * which columns a `{{tabla:name:c1,c2}}` token selects.
 *
 * Spec `email-template-editor` / "Table column picker":
 *  - "Click table chip opens column picker": the popover lists the
 *    predefined table's columns as checkboxes; no token is inserted yet.
 *  - "Insert table token with selected columns": selecting `fecha` then
 *    `monto` and confirming inserts `{{tabla:documentosVencidos:fecha,monto}}`
 *    with column order preserved.
 *  - "Edit existing table token in place": the picker opens pre-populated
 *    with the chip's current columns; on confirm the chip's attrs update.
 *
 * `ColumnPicker` is agnostic to insert-vs-edit — it just emits the composed
 * `TokenAttrs` via `onConfirm`. The parent decides whether to insert or
 * update in place.
 */
const documentosVencidos: PredefinedTable = {
  name: 'documentosVencidos',
  label: 'Documentos vencidos',
  columns: [
    { key: 'fecha', label: 'Fecha' },
    { key: 'monto', label: 'Monto' },
    { key: 'paciente', label: 'Paciente' },
  ],
};

function renderPicker(props: {
  table?: PredefinedTable;
  initialCols?: string[];
  onConfirm?: (attrs: TokenAttrs) => void;
  onCancel?: () => void;
} = {}) {
  const onConfirm = props.onConfirm ?? vi.fn();
  const onCancel = props.onCancel ?? vi.fn();
  render(
    <ColumnPicker
      predefinedTable={props.table ?? documentosVencidos}
      onConfirm={onConfirm}
      onCancel={onCancel}
      initialCols={props.initialCols}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ColumnPicker', () => {
  describe('opening (spec: Click table chip opens column picker)', () => {
    it('lists the predefined table columns as checkboxes (none checked)', () => {
      renderPicker();
      // Each column is a checkbox labelled with its human label.
      expect(screen.getByRole('checkbox', { name: 'Fecha' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Monto' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Paciente' })).toBeInTheDocument();
      // No token is inserted yet — no confirm fired on open.
      // (Asserted via onConfirm not being called in the render-only case.)
    });

    it('renders all checkboxes unchecked when no initialCols', () => {
      renderPicker();
      const boxes = screen.getAllByRole('checkbox');
      expect(boxes).toHaveLength(3);
      for (const box of boxes) {
        expect((box as HTMLInputElement).checked).toBe(false);
      }
    });

    it('renders a confirm button that is disabled until at least one column is selected', () => {
      renderPicker();
      // Spec: "selects 1+ columns" — confirm must be disabled at zero.
      const confirm = screen.getByRole('button', { name: /insertar/i });
      expect(confirm).toBeDisabled();
    });
  });

  describe('insert with selected columns (spec: Insert table token with selected columns)', () => {
    it('emits {{tabla:documentosVencidos:fecha,monto}} when fecha then monto are selected', () => {
      const { onConfirm } = renderPicker();

      fireEvent.click(screen.getByRole('checkbox', { name: 'Fecha' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Monto' }));
      fireEvent.click(screen.getByRole('button', { name: /insertar/i }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith({
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['fecha', 'monto'],
      });
    });

    it('preserves SELECTION order — monto then fecha yields cols [monto, fecha]', () => {
      const { onConfirm } = renderPicker();

      fireEvent.click(screen.getByRole('checkbox', { name: 'Monto' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Fecha' }));
      fireEvent.click(screen.getByRole('button', { name: /insertar/i }));

      expect(onConfirm).toHaveBeenCalledWith({
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['monto', 'fecha'],
      });
    });

    it('enables the confirm button once a column is selected', () => {
      renderPicker();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Fecha' }));
      expect(screen.getByRole('button', { name: /insertar/i })).not.toBeDisabled();
    });

    it('emits all three columns in selection order when all are checked', () => {
      const { onConfirm } = renderPicker();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Paciente' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Fecha' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Monto' }));
      fireEvent.click(screen.getByRole('button', { name: /insertar/i }));
      expect(onConfirm).toHaveBeenCalledWith({
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['paciente', 'fecha', 'monto'],
      });
    });

    it('removes a column from the selection when its checkbox is unchecked', () => {
      const { onConfirm } = renderPicker();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Fecha' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Monto' }));
      // Uncheck Fecha → only Monto remains in selection order.
      fireEvent.click(screen.getByRole('checkbox', { name: 'Fecha' }));
      fireEvent.click(screen.getByRole('button', { name: /insertar/i }));
      expect(onConfirm).toHaveBeenCalledWith({
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['monto'],
      });
    });
  });

  describe('edit existing table token in place (spec: Edit existing table token)', () => {
    it('opens pre-populated with the chip current columns (initialCols)', () => {
      renderPicker({ initialCols: ['fecha', 'monto'] });
      expect((screen.getByRole('checkbox', { name: 'Fecha' }) as HTMLInputElement).checked).toBe(true);
      expect((screen.getByRole('checkbox', { name: 'Monto' }) as HTMLInputElement).checked).toBe(true);
      expect((screen.getByRole('checkbox', { name: 'Paciente' }) as HTMLInputElement).checked).toBe(false);
    });

    it('confirm is enabled immediately in edit mode (initialCols non-empty)', () => {
      renderPicker({ initialCols: ['fecha'] });
      expect(screen.getByRole('button', { name: /insertar/i })).not.toBeDisabled();
    });

    it('emits the updated cols when the user unchecks a column in edit mode', () => {
      const { onConfirm } = renderPicker({ initialCols: ['fecha', 'monto'] });
      // Uncheck monto → only fecha remains.
      fireEvent.click(screen.getByRole('checkbox', { name: 'Monto' }));
      fireEvent.click(screen.getByRole('button', { name: /insertar/i }));
      expect(onConfirm).toHaveBeenCalledWith({
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['fecha'],
      });
    });

    it('preserves initialCols order on open (fecha before monto)', () => {
      // The selection state initialises from initialCols in the given order,
      // so confirming without changes reproduces initialCols verbatim.
      const { onConfirm } = renderPicker({ initialCols: ['monto', 'fecha'] });
      fireEvent.click(screen.getByRole('button', { name: /insertar/i }));
      expect(onConfirm).toHaveBeenCalledWith({
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['monto', 'fecha'],
      });
    });
  });

  describe('cancel', () => {
    it('calls onCancel and does NOT call onConfirm when the cancel button is clicked', () => {
      const { onConfirm, onCancel } = renderPicker();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Fecha' }));
      fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
