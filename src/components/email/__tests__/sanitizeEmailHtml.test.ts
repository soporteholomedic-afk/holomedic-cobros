import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml } from '../sanitizeEmailHtml';

/**
 * Realistic spitch body shape (tables, links, inline styles, images)
 * as produced by the plantillas editor for email templates.
 */
const SPITCH_FIXTURE = [
  '<div style="font-family: Arial, sans-serif; color: #333333;">',
  '<h2>Holomedic — Resultados de laboratorio</h2>',
  '<p>Estimado paciente <strong>Juan Pérez</strong>,</p>',
  '<table cellpadding="0" cellspacing="0" style="border-collapse: collapse; width: 100%;">',
  '<thead><tr><th align="left" style="padding: 8px; border-bottom: 1px solid #ccc;">Documento</th></tr></thead>',
  '<tbody><tr><td valign="top" style="padding: 8px;">CAMO.pdf</td></tr></tbody>',
  '</table>',
  '<p><a href="https://www.holomedic.com.pe" target="_blank">Visitar el sitio</a></p>',
  '<p><a href="mailto:consolidados@holomedic.com.pe">Escribirnos</a></p>',
  '<img src="https://holomedic.com.pe/logo.png" alt="Holomedic" width="140" height="auto" />',
  '<hr />',
  '<em>Mensaje confidencial</em>',
  '</div>',
].join('');

describe('sanitizeEmailHtml', () => {
  it('strips <script> blocks entirely from hostile markup', () => {
    const hostile =
      '<div><p>Contenido seguro</p><script>alert("xss")</script></div>';
    const result = sanitizeEmailHtml(hostile);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<p>Contenido seguro</p>');
  });

  it('strips inline event handlers from hostile markup', () => {
    const hostile =
      '<div><img src="x.png" alt="logo" onerror="alert(1)" onload="steal()"><p>Texto</p></div>';
    const result = sanitizeEmailHtml(hostile);
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onload');
    expect(result).toContain('src="x.png"');
    expect(result).toContain('<p>Texto</p>');
  });

  it('neutralizes javascript: URLs while keeping safe hrefs', () => {
    const hostile =
      '<p><a href="javascript:evil()">malicious</a> <a href="https://holomedic.com.pe">safe</a></p>';
    const result = sanitizeEmailHtml(hostile);
    expect(result).not.toContain('javascript:');
    expect(result).toContain('href="https://holomedic.com.pe"');
  });

  it('strips disallowed elements (iframe) but keeps their safe text', () => {
    const hostile = '<div><iframe src="https://evil.example"></iframe><p>resto</p></div>';
    const result = sanitizeEmailHtml(hostile);
    expect(result).not.toContain('<iframe');
    expect(result).toContain('<p>resto</p>');
  });

  it('preserves spitch template markup intact (tables, links, styles)', () => {
    const result = sanitizeEmailHtml(SPITCH_FIXTURE);
    expect(result).toContain('<h2>Holomedic — Resultados de laboratorio</h2>');
    expect(result).toContain('<table cellpadding="0" cellspacing="0"');
    expect(result).toContain('style="border-collapse: collapse; width: 100%;"');
    expect(result).toContain('<th align="left"');
    expect(result).toContain('<td valign="top"');
    expect(result).toContain('href="https://www.holomedic.com.pe"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('href="mailto:consolidados@holomedic.com.pe"');
    expect(result).toContain('<img src="https://holomedic.com.pe/logo.png"');
    expect(result).toContain('alt="Holomedic"');
    expect(result).toContain('width="140"');
    expect(result).toContain('<hr');
    expect(result).toContain('<em>Mensaje confidencial</em>');
    expect(result).toContain('<strong>Juan Pérez</strong>');
  });

  it('returns the empty string unchanged', () => {
    expect(sanitizeEmailHtml('')).toBe('');
  });

  it('preserves signature-shaped table markup (nested rows, images, mailto)', () => {
    // Mirrors the shape of a persisted email-signature block: a two-cell
    // table with inline styles, a logo image, a mailto link and social
    // icons (the composed firma travels inline in dispatched bodies).
    const signature = [
      '<table cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif;">',
      '<tr>',
      '<td valign="middle" style="padding-right: 20px; text-align: center; width: 160px;">',
      '<img src="https://holomedic.com.pe/logo.png" alt="Holomedic" style="display: block; width: 140px;" />',
      '<a href="https://www.holomedic.com.pe" target="_blank" style="font-weight: bold;">www.holomedic.com.pe</a>',
      '</td>',
      '<td valign="top" style="border-left: 2px solid rgb(0, 86, 179);">',
      '<div style="font-size: 14px;">María Pérez <span style="color: rgb(0, 86, 179);">|</span> Área Consolidados</div>',
      '<div><a href="mailto:consolidados@holomedic.com.pe">consolidados@holomedic.com.pe</a></div>',
      '<div>Móvil: (051) 989211757</div>',
      '</td>',
      '</tr>',
      '</table>',
    ].join('');
    const result = sanitizeEmailHtml(signature);
    expect(result).toContain('María Pérez');
    expect(result).toContain('Área Consolidados');
    expect(result).toContain('Móvil: (051) 989211757');
    expect(result).toContain('href="mailto:consolidados@holomedic.com.pe"');
    expect(result).toContain('cellpadding="0"');
    expect(result).toContain('valign="top"');
    expect(result).toContain('border-left: 2px solid rgb(0, 86, 179)');
    expect(result).toContain('alt="Holomedic"');
  });
});
