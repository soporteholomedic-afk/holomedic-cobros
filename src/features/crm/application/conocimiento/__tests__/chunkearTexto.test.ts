import { describe, expect, it } from 'vitest';

import { chunkearTexto } from '../chunkearTexto';

/**
 * Contrato puro del troceador de conocimiento (agente-ia-crm E4·T7):
 * - Divide por párrafos (\n\n+) y acumula hacia un objetivo ~900
 *   caracteres por chunk.
 * - El chunk N+1 repite la COLA del chunk N (~150 caracteres) como
 *   solape — la primera sección del siguiente ES un sufijo literal del
 *   anterior, arrancando en borde de palabra.
 * - Nunca corta a mitad de palabra (corte en el último espacio).
 * - Tope duro de 200 chunks (el excedente se descarta).
 * - Entrada vacía / solo espacios → [].
 */

/** Párrafo determinista de longitud fija (~60 chars) indexado. */
function parrafo(indice: number, longitud = 60): string {
  const base = `parrafo${indice} `;
  const relleno = 'x'.repeat(Math.max(0, longitud - base.length - 1));
  return `${base}${relleno} fin${indice}`;
}

function textoDeParrafos(cantidad: number, longitud = 60): string {
  return Array.from({ length: cantidad }, (_, i) => parrafo(i, longitud)).join('\n\n');
}

describe('chunkearTexto', () => {
  it('entrada vacía o solo espacios → []', () => {
    expect(chunkearTexto('')).toEqual([]);
    expect(chunkearTexto('   \n\n  \n\n ')).toEqual([]);
  });

  it('texto corto → un único chunk con el contenido íntegro (sin solape)', () => {
    const texto = 'Primera linea corta.\n\nSegunda linea corta.';
    expect(chunkearTexto(texto)).toEqual([texto]);
  });

  it('acumula hacia el objetivo ~900: nada supera el objetivo + solape y no hay un chunk por párrafo', () => {
    // 40 párrafos de ~60 chars ≈ 2400 chars → ~3 chunks (no 40).
    const chunks = chunkearTexto(textoDeParrafos(40));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(4);
    // Objetivo 900 + solape 150 + margen del separador: nada pasa de ~1052.
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1052);
    }
  });

  it('solape: el chunk N+1 repite una cola literal del chunk N (≥100 chars), alineada a palabra', () => {
    const chunks = chunkearTexto(textoDeParrafos(30));
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length - 1; i++) {
      const actual = chunks[i] ?? '';
      const siguiente = chunks[i + 1] ?? '';
      // El solape puede abarcar varios párrafos (contiene \n\n), así
      // que se mide como el sufijo-de-actual más largo que prefija al
      // siguiente — que es exactamente lo que el contrato exige.
      let solape = 0;
      const maximo = Math.min(actual.length, siguiente.length);
      for (let len = 1; len <= maximo; len++) {
        if (actual.endsWith(siguiente.slice(0, len))) solape = len;
      }
      expect(solape, 'hay solape sustancial entre chunks consecutivos').toBeGreaterThanOrEqual(100);
      expect(solape, 'el solape no supera la ventana (~150)').toBeLessThanOrEqual(152);
      const previo = actual.slice(0, actual.length - solape);
      expect(
        previo === '' || previo.endsWith(' ') || previo.endsWith('\n'),
        'el solape arranca en borde de palabra (nunca a mitad)',
      ).toBe(true);
    }
  });

  it('nunca corta a mitad de palabra en párrafos largos (corte en el último espacio)', () => {
    // Párrafo único de ~2000 chars: palabras de 10 chars separadas por espacios.
    const parrafoLargo = Array.from({ length: 200 }, () => 'abcdefghij').join(' ');
    const chunks = chunkearTexto(parrafoLargo);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const tokens = chunk.split(' ').filter((t) => t !== '');
      const primero = tokens[0] ?? '';
      const ultimo = tokens[tokens.length - 1] ?? '';
      expect(primero, 'el chunk arranca en palabra completa').toBe('abcdefghij');
      expect(ultimo, 'el chunk termina en palabra completa').toBe('abcdefghij');
    }
  });

  it('palabra sin espacios más larga que el objetivo se corta dura (caso documentado, sin colgar)', () => {
    const gigante = 'a'.repeat(2000);
    const chunks = chunkearTexto(gigante);
    expect(chunks.length).toBe(3);
    // Sin espacios no hay borde de palabra: cortes duros a 900, y el
    // solape (ventana sin espacios → entera) repite 'a's. Solo hay
    // 'a' y separadores de párrafo, y todo el contenido queda cubierto.
    expect(chunks.every((chunk) => /^[a\n]+$/.test(chunk))).toBe(true);
    expect(chunks.join('').split('a').length - 1).toBeGreaterThanOrEqual(gigante.length);
  });

  it('tope duro de 200 chunks: el excedente se descarta', () => {
    // 250 párrafos de ~900 chars → sin acumular (cada uno rebasa el
    // objetivo por sí solo + solape) → ~250 chunks potenciales → 200.
    const chunks = chunkearTexto(textoDeParrafos(250, 880));
    expect(chunks.length).toBe(200);
  });

  it('es determinista: la misma entrada produce exactamente los mismos chunks', () => {
    const texto = textoDeParrafos(25);
    expect(chunkearTexto(texto)).toEqual(chunkearTexto(texto));
  });
});
