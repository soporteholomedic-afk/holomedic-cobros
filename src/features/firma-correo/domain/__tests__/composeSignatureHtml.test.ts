import { describe, it, expect } from 'vitest';

import type { FirmaCorreo } from '../entities';
import { composeSignatureHtml } from '../composeSignatureHtml';

/**
 * Pure unit tests for the email-safe signature composer (editor-firmas
 * task 1.4). The SAME pure function composes the send-time `ctx.firma`
 * (server-side, PR4 wiring) and the form's live preview (PR3), so the
 * two are byte-identical by construction. Contract: every user value
 * HTML-escaped at composition, an email-safe `<table>` block with
 * inline styles only, a mailto link for the correo, and the Tel/Anexo
 * line OMITTED entirely when both are empty.
 */
const FIRMA: FirmaCorreo = {
  nombre: 'Blanca Chirinos',
  area: 'Consolidados',
  correo: 'blanca@holomedic.com.pe',
  telefono: '+51 989 211 757',
  anexo: '303',
};

describe('composeSignatureHtml — block shape', () => {
  it('renders an email-safe table block with inline styles', () => {
    const html = composeSignatureHtml(FIRMA);
    expect(html).toContain('<table');
    expect(html).toContain('border-collapse: collapse');
    expect(html).toContain('</table>');
  });

  it('renders the nombre, área and a mailto link for the correo', () => {
    const html = composeSignatureHtml(FIRMA);
    expect(html).toContain('Blanca Chirinos');
    expect(html).toContain('Consolidados');
    expect(html).toContain('href="mailto:blanca@holomedic.com.pe"');
    expect(html).toContain('>blanca@holomedic.com.pe</a>');
  });

  it('is deterministic — same input, byte-identical output', () => {
    expect(composeSignatureHtml(FIRMA)).toBe(composeSignatureHtml({ ...FIRMA }));
  });
});

describe('composeSignatureHtml — escaping', () => {
  it('escapes a hostile nombre: markup stored as text, never rendered', () => {
    const html = composeSignatureHtml({ ...FIRMA, nombre: '<b>X</b>' });
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(html).not.toContain('<b>X</b>');
  });

  it('escapes every user value (quotes break out of attributes)', () => {
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
    expect(html).toContain('href="mailto:&quot;q&quot;@b.co"');
    expect(html).not.toContain('3"4');
    expect(html).not.toContain('<script>');
  });

  it('escapes ampersands in text values', () => {
    const html = composeSignatureHtml({ ...FIRMA, area: 'I&D' });
    expect(html).toContain('I&amp;D');
  });
});

describe('composeSignatureHtml — Tel/Anexo line', () => {
  it('renders Tel and Anexo on a single line separated by · when both present', () => {
    const html = composeSignatureHtml(FIRMA);
    expect(html).toContain('Tel: +51 989 211 757 · Anexo: 303');
  });

  it('renders only the Tel segment when anexo is empty', () => {
    const html = composeSignatureHtml({ ...FIRMA, anexo: '' });
    expect(html).toContain('Tel: +51 989 211 757');
    expect(html).not.toContain('Anexo:');
    expect(html).not.toContain('·');
  });

  it('renders only the Anexo segment when telefono is empty', () => {
    const html = composeSignatureHtml({ ...FIRMA, telefono: '' });
    expect(html).toContain('Anexo: 303');
    expect(html).not.toContain('Tel:');
    expect(html).not.toContain('·');
  });

  it('OMITS the whole line when both are empty', () => {
    const html = composeSignatureHtml({ ...FIRMA, telefono: '', anexo: '' });
    expect(html).not.toContain('Tel:');
    expect(html).not.toContain('Anexo:');
    expect(html).not.toContain('·');
    // Block still renders the core identity fields.
    expect(html).toContain('Blanca Chirinos');
    expect(html).toContain('mailto:blanca@holomedic.com.pe');
  });
});
