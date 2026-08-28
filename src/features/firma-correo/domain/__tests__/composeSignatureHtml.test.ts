import { describe, it, expect } from 'vitest';

import type { FirmaCorreo } from '../entities';
import {
  composeSignatureHtml,
  FIRMA_DIRECCION,
  FIRMA_LOGO_CID,
  FIRMA_TELEFONO_FIJO,
} from '../composeSignatureHtml';

/**
 * Pure unit tests for the email-safe signature composer (signature
 * redesign). Contract: two-column `<table>` layout — logo cell
 * (`cid:holomedic-logo`) LEFT, identity/contact rows RIGHT — with
 * inline styles only, FIXED company contact data (Telef. 480-0217 +
 * address with EN DASH) always present, an `<hr>` separator BELOW the
 * block, and every user value HTML-escaped. The SAME pure function
 * composes the send-time `ctx.firma` and the form's live preview.
 */
const FIRMA: FirmaCorreo = {
  nombre: 'Blanca Chirinos',
  area: 'Consolidados',
  correo: 'blanca@holomedic.com.pe',
  telefono: '+51 989 211 757',
  anexo: '303',
};

const DIRECCION =
  'Pasaje La India 169, Urb. Los Sauces – Surquillo (Altura de 9 y 10 de la Av. Villarán)';

describe('composeSignatureHtml — exported constants', () => {
  it('exports the logo cid, the fixed phone and the exact address', () => {
    expect(FIRMA_LOGO_CID).toBe('cid:holomedic-logo');
    expect(FIRMA_TELEFONO_FIJO).toBe('480-0217');
    expect(FIRMA_DIRECCION).toBe(DIRECCION);
  });
});

describe('composeSignatureHtml — two-column block shape', () => {
  it('renders an email-safe table block with inline styles', () => {
    const html = composeSignatureHtml(FIRMA);
    expect(html).toContain('<table');
    expect(html).toContain('border-collapse: collapse');
    expect(html).toContain('</table>');
  });

  it('renders the logo img in the LEFT cell with the exact cid and a 110–130px width', () => {
    const html = composeSignatureHtml(FIRMA);
    expect(html).toContain(`<img src="${FIRMA_LOGO_CID}"`);
    expect(html).toMatch(/width="1[1-3][0-9]"/);
    // Left cell: vertical-align top and right padding (logo column).
    expect(html).toContain('valign="top"');
    expect(html).toMatch(/padding-right:\s*\d+px/);
  });

  it('renders line 1 as "nombre | Área area" with the nombre in <strong>', () => {
    const html = composeSignatureHtml(FIRMA);
    expect(html).toContain('<strong>Blanca Chirinos</strong> | Área Consolidados');
  });

  it('renders the correo as PLAIN ESCAPED TEXT — no mailto link', () => {
    const html = composeSignatureHtml(FIRMA);
    expect(html).toContain('>blanca@holomedic.com.pe<');
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('<a ');
  });

  it('renders the FIXED company phone ALWAYS, with Anexo appended only when present', () => {
    const withAnexo = composeSignatureHtml(FIRMA);
    expect(withAnexo).toContain(`Telef. ${FIRMA_TELEFONO_FIJO} Anexo: 303`);

    const sinAnexo = composeSignatureHtml({ ...FIRMA, anexo: '' });
    expect(sinAnexo).toContain(`Telef. ${FIRMA_TELEFONO_FIJO}`);
    expect(sinAnexo).not.toContain('Anexo:');
  });

  it('renders the FIXED address ALWAYS — exact text including the EN DASH', () => {
    const html = composeSignatureHtml({ ...FIRMA, telefono: '', anexo: '' });
    expect(html).toContain(DIRECCION);
    // EN DASH (U+2013), not a hyphen — byte-exact address contract.
    expect(DIRECCION).toContain('Sauces – Surquillo');
    expect(DIRECCION).not.toContain('Sauces - Surquillo');
  });

  it('renders a subtle <hr> separator BELOW the table block', () => {
    const html = composeSignatureHtml(FIRMA);
    const tableEnd = html.indexOf('</table>');
    const hrPos = html.indexOf('<hr');
    expect(tableEnd).toBeGreaterThan(-1);
    expect(hrPos).toBeGreaterThan(tableEnd);
    expect(html).toMatch(/<hr[^>]*border-top:\s*1px solid/);
  });

  it('is deterministic — same input, byte-identical output', () => {
    expect(composeSignatureHtml(FIRMA)).toBe(composeSignatureHtml({ ...FIRMA }));
  });
});

describe('composeSignatureHtml — Móvil line', () => {
  it('renders "Móvil: {telefono}" when telefono is non-empty', () => {
    const html = composeSignatureHtml(FIRMA);
    expect(html).toContain('Móvil: +51 989 211 757');
  });

  it('OMITS the Móvil line entirely when telefono is empty', () => {
    const html = composeSignatureHtml({ ...FIRMA, telefono: '' });
    expect(html).not.toContain('Móvil:');
    // Fixed rows are unaffected.
    expect(html).toContain(`Telef. ${FIRMA_TELEFONO_FIJO}`);
    expect(html).toContain(DIRECCION);
  });
});

describe('composeSignatureHtml — escaping', () => {
  it('escapes a hostile nombre: markup stored as text, never rendered', () => {
    const html = composeSignatureHtml({ ...FIRMA, nombre: '<b>X</b>' });
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(html).not.toContain('<b>X</b>');
  });

  it('escapes every user value (quotes cannot break out of attributes)', () => {
    const html = composeSignatureHtml({
      ...FIRMA,
      nombre: 'A"onmouseover="x',
      area: 'Área <script>',
      correo: '"q"@b.co',
      telefono: '+51 1"2',
      anexo: '3"4',
    });
    expect(html).not.toContain('"onmouseover');
    expect(html).toContain('A&quot;onmouseover=&quot;x');
    expect(html).toContain('Área &lt;script&gt;');
    // correo is plain escaped TEXT now — the hostile quote must never
    // reach an attribute position (there is no mailto href anymore).
    expect(html).toContain('&quot;q&quot;@b.co');
    expect(html).not.toContain('3"4');
    expect(html).not.toContain('<script>');
  });

  it('escapes ampersands in text values', () => {
    const html = composeSignatureHtml({ ...FIRMA, area: 'I&D' });
    expect(html).toContain('I&amp;D');
  });
});
