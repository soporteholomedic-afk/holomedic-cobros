import { describe, expect, it } from 'vitest';

import { esTextoConfirmacionCierre, TEXTO_CONFIRMACION_CIERRE } from '../textosCierreAgente';

describe('TEXTO_CONFIRMACION_CIERRE', () => {
  it('define un texto fijo por cada tipo de cierre', () => {
    expect(Object.keys(TEXTO_CONFIRMACION_CIERRE).sort()).toEqual([
      'ACEPTACION',
      'CONFIRMACION_PRESENTACION',
      'CONVERSION_CLIENTE',
    ]);
  });
});

describe('esTextoConfirmacionCierre', () => {
  it.each(Object.values(TEXTO_CONFIRMACION_CIERRE))('coincidencia exacta → true (%s)', (texto) => {
    expect(esTextoConfirmacionCierre(texto)).toBe(true);
  });

  it('tolera espacios alrededor', () => {
    expect(esTextoConfirmacionCierre(`  ${TEXTO_CONFIRMACION_CIERRE.ACEPTACION}\n`)).toBe(true);
  });

  it('texto parcial, distinto o vacío → false', () => {
    expect(esTextoConfirmacionCierre(TEXTO_CONFIRMACION_CIERRE.ACEPTACION.slice(0, 20))).toBe(false);
    expect(esTextoConfirmacionCierre(`${TEXTO_CONFIRMACION_CIERRE.ACEPTACION} Gracias`)).toBe(false);
    expect(esTextoConfirmacionCierre('Hola')).toBe(false);
    expect(esTextoConfirmacionCierre('')).toBe(false);
  });
});
