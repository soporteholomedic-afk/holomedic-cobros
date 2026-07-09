import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { TokenChip } from '../TokenChip';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Unit tests for `TokenChip` — the non-editable pill that renders a token's
 * human label (resolved from `areaConfig` by the parent).
 *
 * Spec `email-template-editor` / "Drag token from palette into body":
 *  - GIVEN a user is editing a template body in the BlockNote editor
 *  - WHEN they drag a token chip from the palette and drop it at the cursor
 *  - THEN a non-editable inline token chip is inserted at the cursor
 *  - AND the chip displays the human label from areaConfig.
 *
 * `TokenChip` is a presentational component (no hooks, no event handlers)
 * so it does NOT need `"use client"` — it renders identically on server and
 * client. It's reused by `TokenPalette`, `SubjectTokenInput`, and the
 * BlockNote `token` inline-content spec render.
 */
describe('TokenChip', () => {
  it('renders the human label as visible text', () => {
    render(<TokenChip label="Empresa" attrs={{ key: 'empresa' }} />);
    expect(screen.getByText('Empresa')).toBeInTheDocument();
  });

  it('renders a different label (triangulate — no hardcoding)', () => {
    render(<TokenChip label="Fecha" attrs={{ key: 'fecha' }} />);
    expect(screen.getByText('Fecha')).toBeInTheDocument();
    expect(screen.queryByText('Empresa')).not.toBeInTheDocument();
  });

  it('exposes the token key as a data attribute for selection/inspection', () => {
    render(<TokenChip label="Empresa" attrs={{ key: 'empresa' }} />);
    const chip = screen.getByText('Empresa').closest('[data-token-key]');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('data-token-key')).toBe('empresa');
  });

  it('exposes the table + cols for a table-token chip', () => {
    const attrs: TokenAttrs = {
      key: 'tabla',
      table: 'documentosVencidos',
      cols: ['fecha', 'monto'],
    };
    render(<TokenChip label="Documentos vencidos" attrs={attrs} />);
    const chip = screen.getByText('Documentos vencidos').closest(
      '[data-token-key]',
    );
    expect(chip?.getAttribute('data-token-table')).toBe('documentosVencidos');
    expect(chip?.getAttribute('data-token-cols')).toBe('fecha,monto');
  });

  it('is non-editable (the pill text is not contentEditable)', () => {
    // The chip is a non-editable inline node — the user cannot type into it.
    // Asserting the absence of contentEditable="true" is the semantic check.
    render(<TokenChip label="Empresa" attrs={{ key: 'empresa' }} />);
    const chip = screen.getByText('Empresa').closest('[data-token-key]');
    expect(chip?.getAttribute('contenteditable')).not.toBe('true');
  });

  it('renders without attrs (label-only is valid for palette display)', () => {
    // The palette renders chips from TokenDef (which has the label but not
    // yet a fully-formed TokenAttrs — cols are chosen in the picker). So
    // TokenChip must render with just a label.
    render(<TokenChip label="Documentos vencidos" />);
    expect(screen.getByText('Documentos vencidos')).toBeInTheDocument();
  });
});
