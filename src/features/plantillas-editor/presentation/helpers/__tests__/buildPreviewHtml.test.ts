import { describe, it, expect } from 'vitest';

import { buildPreviewHtml } from '../buildPreviewHtml';
import type { MockPreviewData } from '../../../infrastructure/areaConfigRegistry';

/**
 * Unit tests for `buildPreviewHtml` — the pure client-side preview renderer
 * (design Decision i, PR 3 SIMPLE version).
 *
 * Spec `email-template-editor` / "Live preview with mock data":
 *  - "Preview renders tokens with mock data": `{{empresa}}` with mock
 *    `empresa: "Clinica SA"` → `Clinica SA` in the preview, rendered in a
 *    sandboxed iframe (the iframe wiring lives in `TemplateEditor`; this
 *    helper produces the `srcDoc` HTML).
 *  - "Preview removes empty-variable block": `<p>{{firma}}</p>` with mock
 *    `firma: ""` → the entire `<p>` block is removed.
 *
 * PR 3 scope note: this is a SIMPLE client-side token replace + simple
 * empty-block removal. The FULL `interpolateSpitch` refactor
 * (TokenResolverRegistry, configurable block-ancestor set, td-exclusion,
 * InterpolationContext) is PR 4. Here we use `DOMParser` to drop blocks
 * that become empty after replacement — enough for the preview UX.
 */
const mock: MockPreviewData = {
  companyName: 'Clínica Demo S.A.',
  patientNames: ['Juan Pérez'],
  fileNames: ['informe.pdf'],
  firma: '<p>Dr. Pérez — Clínica Demo S.A.</p>',
  area: 'consolidados',
  today: '2026-01-15',
};

const emptyFirmaMock: MockPreviewData = { ...mock, firma: '' };

describe('buildPreviewHtml', () => {
  describe('replaces simple tokens with mock data (spec: Preview renders tokens)', () => {
    it('replaces {{empresa}} with the mock companyName', () => {
      const out = buildPreviewHtml('<p>Hola {{empresa}}</p>', mock);
      expect(out).toContain('Hola Clínica Demo S.A.');
      expect(out).not.toContain('{{empresa}}');
    });

    it('replaces {{fecha}} with the mock today', () => {
      const out = buildPreviewHtml('<p>Fecha: {{fecha}}</p>', mock);
      expect(out).toContain('Fecha: 2026-01-15');
      expect(out).not.toContain('{{fecha}}');
    });

    it('replaces {{firma}} with the mock firma HTML', () => {
      const out = buildPreviewHtml('<p>{{firma}}</p>', mock);
      // firma is HTML — inserted as-is (the surrounding <p> wraps it).
      expect(out).toContain('Dr. Pérez — Clínica Demo S.A.');
      expect(out).not.toContain('{{firma}}');
    });

    it('replaces multiple tokens in one block', () => {
      const out = buildPreviewHtml(
        '<p>{{empresa}} — {{fecha}}</p>',
        mock,
      );
      expect(out).toContain('Clínica Demo S.A. — 2026-01-15');
    });
  });

  describe('table tokens get a simple placeholder (full table resolver is PR 4)', () => {
    it('replaces {{tabla:docs:fecha,monto}} with a readable placeholder listing the table and columns', () => {
      const out = buildPreviewHtml(
        '<p>{{tabla:documentosVencidos:fecha,monto}}</p>',
        mock,
      );
      // PR 3 does NOT render the real table (that is PR 4's table resolver).
      // The placeholder must show the table name + selected columns so the
      // user can see the token resolved to SOMETHING in the preview.
      expect(out).not.toContain('{{tabla:documentosVencidos:fecha,monto}}');
      expect(out).toContain('documentosVencidos');
      expect(out).toContain('fecha');
      expect(out).toContain('monto');
    });
  });

  describe('removes empty-variable blocks (spec: Preview removes empty-variable block)', () => {
    it('removes a <p> whose only content was an empty-resolving token', () => {
      const out = buildPreviewHtml('<p>{{firma}}</p>', emptyFirmaMock);
      // The <p> block is removed entirely — no empty paragraph remains.
      expect(out).not.toContain('<p>');
      expect(out).not.toContain('{{firma}}');
      expect(out.trim()).toBe('');
    });

    it('removes only the empty block, keeping non-empty siblings', () => {
      const out = buildPreviewHtml(
        '<p>{{firma}}</p><p>Hola {{empresa}}</p>',
        emptyFirmaMock,
      );
      expect(out).not.toContain('{{firma}}');
      expect(out).toContain('Hola Clínica Demo S.A.');
      // The empty <p> is gone; the non-empty <p> survives.
      const pCount = (out.match(/<p>/g) ?? []).length;
      expect(pCount).toBe(1);
    });

    it('removes an empty <li> but keeps non-empty siblings', () => {
      const out = buildPreviewHtml(
        '<ul><li>{{firma}}</li><li>Item {{empresa}}</li></ul>',
        emptyFirmaMock,
      );
      expect(out).not.toContain('{{firma}}');
      expect(out).toContain('Item Clínica Demo S.A.');
      const liCount = (out.match(/<li>/g) ?? []).length;
      expect(liCount).toBe(1);
    });

    it('keeps a <td> when its token resolves to empty (td exclusion — do not break table layout)', () => {
      // PR 3 simple version: td is NOT removed even if empty (removing a
      // cell breaks table layout). Only the token text is removed.
      const out = buildPreviewHtml(
        '<table><tr><td>{{firma}}</td><td>X</td></tr></table>',
        emptyFirmaMock,
      );
      expect(out).toContain('<td></td>');
      expect(out).toContain('<td>X</td>');
      expect(out).not.toContain('{{firma}}');
    });

    it('keeps a <p> that has other text alongside an empty-resolving token', () => {
      // The token is removed but the <p> with remaining text survives.
      const out = buildPreviewHtml(
        '<p>Prefix {{firma}} suffix</p>',
        emptyFirmaMock,
      );
      expect(out).toContain('Prefix');
      expect(out).toContain('suffix');
      expect(out).not.toContain('{{firma}}');
      expect(out).toContain('<p>');
    });
  });

  describe('unknown tokens are left as-is (no crash)', () => {
    it('leaves an unknown {{token}} in the output rather than throwing', () => {
      expect(() => buildPreviewHtml('<p>{{unknownToken}}</p>', mock)).not.toThrow();
      const out = buildPreviewHtml('<p>{{unknownToken}}</p>', mock);
      // Unknown tokens are not in the mock data — left visible so the user
      // sees the placeholder in the preview.
      expect(out).toContain('{{unknownToken}}');
    });
  });
});
