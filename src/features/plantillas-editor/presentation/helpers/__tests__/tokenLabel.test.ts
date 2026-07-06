import { describe, it, expect } from 'vitest';

import { resolveTokenLabel } from '../tokenLabel';
import { AREA_CONFIGS } from '../../../infrastructure/areaConfigRegistry';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Unit tests for `resolveTokenLabel` — pure helper that maps a `TokenAttrs`
 * chip to its human label via the area's `areaConfig.availableTokens`.
 *
 * Spec `email-template-editor` / "Drag token from palette into body":
 *  - the chip displays the human label from areaConfig.
 *
 * Used by `SubjectTokenInput`, `TemplateEditor`, and the BlockNote `token`
 * inline-content spec render so every chip shows the same label regardless
 * of where it was inserted from.
 *
 * `resolveTokenLabel` is a runtime value export so this import fails first.
 */
const consolidados = AREA_CONFIGS.get('consolidados')!;

describe('resolveTokenLabel', () => {
  it('resolves a simple token key to its TokenDef label', () => {
    expect(resolveTokenLabel({ key: 'empresa' }, consolidados)).toBe('Empresa');
  });

  it('resolves a different simple key (triangulate)', () => {
    expect(resolveTokenLabel({ key: 'fecha' }, consolidados)).toBe('Fecha');
  });

  it('resolves a table token by matching tableRef', () => {
    const attrs: TokenAttrs = {
      key: 'tabla',
      table: 'documentosVencidos',
      cols: ['fecha', 'monto'],
    };
    expect(resolveTokenLabel(attrs, consolidados)).toBe('Documentos vencidos');
  });

  it('resolves a different table token (triangulate — examenes)', () => {
    const attrs: TokenAttrs = {
      key: 'tabla',
      table: 'examenes',
      cols: ['fecha'],
    };
    expect(resolveTokenLabel(attrs, consolidados)).toBe('Exámenes');
  });

  it('falls back to the encoded placeholder for an unknown key', () => {
    // A token whose key is not in areaConfig (e.g. an old template with a
    // renamed token) still renders SOMETHING readable — the raw placeholder
    // is shown so the user sees the token exists and can fix it.
    expect(resolveTokenLabel({ key: 'doesNotExist' }, consolidados)).toBe(
      '{{doesNotExist}}',
    );
  });

  it('falls back to the encoded placeholder for a table token with an unknown table', () => {
    const attrs: TokenAttrs = {
      key: 'tabla',
      table: 'unknownTable',
      cols: ['x'],
    };
    expect(resolveTokenLabel(attrs, consolidados)).toBe(
      '{{tabla:unknownTable:x}}',
    );
  });
});
