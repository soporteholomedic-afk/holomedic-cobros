import { describe, it, expect } from 'vitest';

import { replaceFirmaFallback } from '../replaceFirmaFallback';
import { FIRMA_FALLBACK_HTML } from '@/features/envio-resultados/presentation/helpers/tokenResolvers/buildTokenResolverRegistry';

/**
 * replaceFirmaFallback — the marker-replacement recovery primitive
 * consumed by the email composers (EmailEditor, CobranzaEmailComposer,
 * EnviarValoracionesModal). Dumb and pure: swap every baked
 * `[Falta configurar firma]` fallback for the real firma html once the
 * deferred GET /api/plantillas/firma resolves. Never re-interpolates
 * (that would clobber operator edits); never touches a body without the
 * marker; never injects an empty firma.
 */

const COMPOSED_FIRMA = '<table><tr><td>Dra. Firma Guardada</td></tr></table>';

describe('replaceFirmaFallback', () => {
  it('replaces ALL marker occurrences with the firma html (split/join, no re-interpolation)', () => {
    const body = `<p>Hola</p>${FIRMA_FALLBACK_HTML}<p>Medio</p>${FIRMA_FALLBACK_HTML}`;
    expect(replaceFirmaFallback(body, COMPOSED_FIRMA)).toBe(
      `<p>Hola</p>${COMPOSED_FIRMA}<p>Medio</p>${COMPOSED_FIRMA}`,
    );
  });

  it('keeps every other byte of the body intact around the replacement', () => {
    const body = `<div><p>Estimados {{empresa}},</p>${FIRMA_FALLBACK_HTML}<p>Saludos</p></div>`;
    expect(replaceFirmaFallback(body, COMPOSED_FIRMA)).toBe(
      `<div><p>Estimados {{empresa}},</p>${COMPOSED_FIRMA}<p>Saludos</p></div>`,
    );
  });

  it('returns the body untouched when the marker is absent (operator edited/removed it)', () => {
    const body = '<p>Cuerpo editado por el operador, sin marcador</p>';
    expect(replaceFirmaFallback(body, COMPOSED_FIRMA)).toBe(body);
  });

  it('returns the body untouched when firmaHtml is empty (spec fallback preserved)', () => {
    const body = `<p>Hola</p>${FIRMA_FALLBACK_HTML}`;
    expect(replaceFirmaFallback(body, '')).toBe(body);
  });

  it('returns an empty body unchanged', () => {
    expect(replaceFirmaFallback('', COMPOSED_FIRMA)).toBe('');
  });
});
