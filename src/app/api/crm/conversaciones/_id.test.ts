import { describe, expect, it } from 'vitest';

import { parsearIdConversacion } from './_id';

/**
 * Contract for parsearIdConversacion (R2-dup-parse-id +
 * R3-lenient-id-parse, agente-ia-crm E1 advisory remediation): the
 * FOUR [id] routes share ONE strict parser instead of four copies of
 * a lenient `Number.parseInt`. Strict means: only ^\d+$, range
 * 1..2^31-1 (INT positive), null for everything else — '12abc' and
 * '1.5' (which parseInt silently truncates), '0', negatives, empty,
 * whitespace, giant numbers all reject. '007' stays 7 (leading zeros
 * are harmless digits).
 */

describe('parsearIdConversacion', () => {
  it('acepta enteros positivos en rango', () => {
    expect(parsearIdConversacion('5')).toBe(5);
    expect(parsearIdConversacion('1')).toBe(1);
    expect(parsearIdConversacion('007')).toBe(7);
    expect(parsearIdConversacion('2147483647')).toBe(2147483647); // 2^31-1, tope
  });

  it('rechaza basura que Number.parseInt aceptaría por truncado', () => {
    expect(parsearIdConversacion('12abc')).toBeNull();
    expect(parsearIdConversacion('1.5')).toBeNull();
    expect(parsearIdConversacion('abc')).toBeNull();
    expect(parsearIdConversacion('1e3')).toBeNull();
    expect(parsearIdConversacion('+5')).toBeNull();
    expect(parsearIdConversacion(' 5')).toBeNull();
  });

  it('rechaza vacío, cero, negativos y fuera de rango INT', () => {
    expect(parsearIdConversacion('')).toBeNull();
    expect(parsearIdConversacion('0')).toBeNull();
    expect(parsearIdConversacion('-1')).toBeNull();
    expect(parsearIdConversacion('2147483648')).toBeNull(); // 2^31
    expect(parsearIdConversacion('99999999999999999999')).toBeNull();
  });
});
