import { describe, it, expect } from 'vitest';
import { stripSignatureHtml } from '../signatureData';

// editor-firmas PR4 (task 4.4): the legacy client-side signature builder
// is REMOVED — the signature is now composed server-side (firma-correo
// feature, GET /api/plantillas/firma). This module KEEPS only the
// sentinel + strip pair so historical rows (persisted WITH the legacy
// appended signature, historial-envios-consolidados D8) still seed the
// reenvío editor cleanly. Fixtures inline the exact sentinel markup the
// legacy builder used to emit.
const SENTINEL = '<!--holomedic-firma-->';
const LEGACY_SIGNATURE = `${SENTINEL}<table><tr><td>María Pérez — firma histórica</td></tr></table>${SENTINEL}`;

describe('stripSignatureHtml (kept for historical reenvío)', () => {
  it('round-trips: body + legacy appended signature strips back to the exact body', () => {
    const body = '<p>Estimado paciente,</p><p>Adjuntamos sus resultados.</p>';
    const persisted = body + LEGACY_SIGNATURE;

    expect(stripSignatureHtml(persisted)).toBe(body);
  });

  it('strips content-agnostically: any markup between the sentinels is removed byte-for-byte', () => {
    const body = '<p>Hola</p>';
    const persisted =
      body + `${SENTINEL}<div>firmanteX<img src="logo.png" alt="Holomedic" /></div>${SENTINEL}`;

    expect(stripSignatureHtml(persisted)).toBe(body);
  });

  it('returns input unchanged when no sentinel is present (strip exactness)', () => {
    const html = '<p>Sin firma persistida</p>';
    expect(stripSignatureHtml(html)).toBe(html);
  });

  it('strips only the signature block, keeping content before and after', () => {
    const html = `<p>before</p>${LEGACY_SIGNATURE}<p>after</p>`;
    expect(stripSignatureHtml(html)).toBe('<p>before</p><p>after</p>');
  });

  it('handles the empty-body case', () => {
    expect(stripSignatureHtml('')).toBe('');
    // A persisted body consisting of only the legacy signature block
    // strips to the empty string.
    expect(stripSignatureHtml(LEGACY_SIGNATURE)).toBe('');
  });

  it('defends against a lone sentinel (malformed persisted body)', () => {
    expect(stripSignatureHtml(`<p>x</p>${SENTINEL}<p>y</p>`)).toBe('<p>x</p>');
  });
});
