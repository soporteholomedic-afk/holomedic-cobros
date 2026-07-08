import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { describe, it, expect, vi } from 'vitest';

import { TokenPalette } from '../TokenPalette';
import type { AreaConfig, TokenDef } from '../../../infrastructure/areaConfigRegistry';

/**
 * Unit tests for `TokenPalette` — the dnd-kit-driven palette grouped by
 * category that reads `areaConfig.availableTokens` ONLY.
 *
 * Spec `email-template-editor` / "Drag-drop palette filtered by area":
 *  - "Palette shows only current area tokens": GIVEN the user is editing in
 *    area `consolidados`, WHEN the palette renders, THEN only tokens from
 *    `consolidados`'s areaConfig appear AND tokens from other areas do NOT.
 *
 * Spec / "Table column picker":
 *  - "Click table chip opens column picker": GIVEN a table chip is shown in
 *    the palette, WHEN the user clicks it, THEN a popover lists the
 *    predefined table's columns (handled by `ColumnPicker` via the
 *    `onPickTable` callback).
 *
 * The palette is wrapped in a `DndContext` in production (the editor owns
 * the context so chips drag into both body and subject). Tests mirror that
 * by wrapping in `DndContext`.
 */
function renderPalette(props: {
  areaConfig: AreaConfig;
  onPickTable?: (token: TokenDef) => void;
}) {
  return render(
    <DndContext>
      <TokenPalette
        areaConfig={props.areaConfig}
        onPickTable={props.onPickTable ?? vi.fn()}
      />
    </DndContext>,
  );
}

const consolidadosConfig: AreaConfig = {
  area: 'consolidados',
  label: 'Consolidados',
  availableTokens: [
    {
      category: 'Empresa',
      tokens: [
        { key: 'empresa', label: 'Empresa' },
        { key: 'fecha', label: 'Fecha' },
      ],
    },
    { category: 'Firma', tokens: [{ key: 'firma', label: 'Firma' }] },
    {
      category: 'Tablas',
      tokens: [
        {
          key: 'tabla',
          label: 'Documentos vencidos',
          isTable: true,
          tableRef: 'documentosVencidos',
        },
        {
          key: 'tabla',
          label: 'Exámenes',
          isTable: true,
          tableRef: 'examenes',
        },
      ],
    },
  ],
  predefinedTables: [
    {
      name: 'documentosVencidos',
      label: 'Documentos vencidos',
      columns: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'monto', label: 'Monto' },
      ],
    },
    {
      name: 'examenes',
      label: 'Exámenes',
      columns: [{ key: 'fecha', label: 'Fecha' }],
    },
  ],
  mockPreviewData: {
    companyName: 'X',
    patientNames: [],
    fileNames: [],
    firma: '',
    area: 'consolidados',
    today: '2026-01-01',
    pacienteDni: '12345678',
    pacienteNombre: 'Test Paciente',
  },
};

// A minimal custom config to triangulate that the palette reads the PROP,
// not a hardcoded list — only these two tokens may appear.
const minimalConfig: AreaConfig = {
  area: 'custom',
  label: 'Custom',
  availableTokens: [
    { category: 'Solo', tokens: [{ key: 'alpha', label: 'Alpha' }] },
  ],
  predefinedTables: [],
  mockPreviewData: {
    companyName: '',
    patientNames: [],
    fileNames: [],
    firma: '',
    area: 'custom',
    today: '2026-01-01',
    pacienteDni: '',
    pacienteNombre: '',
  },
};

describe('TokenPalette', () => {
  describe('reads only areaConfig.availableTokens (spec: only current area tokens)', () => {
    it('renders every token chip from the consolidados config', () => {
      renderPalette({ areaConfig: consolidadosConfig });
      // Chips have role="img" + aria-label (from TokenChip). The category
      // heading "Empresa" is role="heading" so the two never collide.
      expect(screen.getByRole('img', { name: 'Empresa' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Fecha' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Firma' })).toBeInTheDocument();
      expect(
        screen.getByRole('img', { name: 'Documentos vencidos' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Exámenes' })).toBeInTheDocument();
    });

    it('renders ONLY the tokens from the prop config — a minimal config shows just Alpha', () => {
      // Triangulation: if the palette hardcoded the consolidados labels,
      // this minimal config would still show them. It must NOT.
      renderPalette({ areaConfig: minimalConfig });
      expect(screen.getByRole('img', { name: 'Alpha' })).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Empresa' })).not.toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Firma' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('img', { name: 'Documentos vencidos' }),
      ).not.toBeInTheDocument();
    });

    it('groups tokens by category (category headings render as headings)', () => {
      renderPalette({ areaConfig: consolidadosConfig });
      // Headings are <h3> → role="heading". The "Empresa" heading coexists
      // with the "Empresa" chip because their roles differ.
      expect(
        screen.getByRole('heading', { name: 'Empresa' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Firma' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Tablas' })).toBeInTheDocument();
    });
  });

  describe('table chips are click-to-open-picker (design Decision g)', () => {
    it('calls onPickTable with the table TokenDef when a table chip is clicked', () => {
      const onPickTable = vi.fn();
      renderPalette({ areaConfig: consolidadosConfig, onPickTable });

      // Table chips render as a button wrapping a TokenChip.
      fireEvent.click(
        screen.getByRole('button', { name: 'Insertar tabla Documentos vencidos' }),
      );

      expect(onPickTable).toHaveBeenCalledTimes(1);
      const arg = onPickTable.mock.calls[0]?.[0] as TokenDef;
      expect(arg.isTable).toBe(true);
      expect(arg.tableRef).toBe('documentosVencidos');
      expect(arg.key).toBe('tabla');
    });

    it('calls onPickTable with the examenes table TokenDef when that chip is clicked', () => {
      const onPickTable = vi.fn();
      renderPalette({ areaConfig: consolidadosConfig, onPickTable });

      fireEvent.click(
        screen.getByRole('button', { name: 'Insertar tabla Exámenes' }),
      );

      expect(onPickTable).toHaveBeenCalledTimes(1);
      const arg = onPickTable.mock.calls[0]?.[0] as TokenDef;
      expect(arg.tableRef).toBe('examenes');
    });

    it('does NOT call onPickTable when a simple (non-table) chip is clicked', () => {
      const onPickTable = vi.fn();
      renderPalette({ areaConfig: consolidadosConfig, onPickTable });

      // "Empresa" is a simple chip (no isTable) — it is NOT a button, so
      // clicking the chip must not open the picker. Click the chip image;
      // the surrounding div has no onClick → onPickTable stays untouched.
      fireEvent.click(screen.getByRole('img', { name: 'Empresa' }));
      expect(onPickTable).not.toHaveBeenCalled();
    });
  });

  describe('simple chips are draggable (dnd-kit payload carries the attrs)', () => {
    it('renders simple chips with a draggable role (dnd-kit wired)', () => {
      renderPalette({ areaConfig: consolidadosConfig });
      // dnd-kit sets aria-roledescription="draggable" on the activator.
      const chip = screen
        .getByRole('img', { name: 'Empresa' })
        .closest('[aria-roledescription]');
      expect(chip).not.toBeNull();
      expect(chip?.getAttribute('aria-roledescription')).toBe('draggable');
    });
  });
});
