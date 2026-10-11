import { describe, expect, it } from 'vitest';

import {
  SQL_ACTUALIZAR,
  SQL_LEER,
  normalizarTelefonoE164,
  parsearArgumentos,
  planificarNormalizacion,
} from '../crm-normalizar-telefonos.mjs';
import {
  normalizarTelefonoE164 as normalizarTelefonoE164Dominio,
} from '../../src/features/crm/domain/normalizar';

/**
 * Pure-derivation pins for the telefonoNormalizado backfill script
 * (agente-ia-crm E2·T8 — E1 advisory R3-scan-tabla-complea):
 * - Arg parsing: DRY-RUN by default; `--apply` writes; anything else
 *   (including the sembrar script's `--limpiar`, NOT needed here — a
 *   re-run is already a no-op) is surfaced and refused by main.
 * - Plan shape: one entry per row classified actualizar / sin cambio /
 *   no normalizable; feeding the post-apply state back yields ZERO
 *   actualizar rows (idempotent re-run = no-op).
 * - Parity: the script's copied E.164 rule matches the DOMAIN
 *   normalizer (src/features/crm/domain/normalizar.ts) on every case —
 *   the duplicate is documented in the script and pinned here.
 */

describe('parsearArgumentos', () => {
  it('sin flags → dry-run (aplicar en false)', () => {
    expect(parsearArgumentos([])).toEqual({ aplicar: false, desconocidos: [] });
  });

  it('--apply → escribir', () => {
    expect(parsearArgumentos(['--apply'])).toEqual({ aplicar: true, desconocidos: [] });
  });

  it('flags desconocidos (incl. --limpiar, que ya no existe) quedan listados', () => {
    const args = parsearArgumentos(['--limpiar', '--force']);
    expect(args.aplicar).toBe(false);
    expect(args.desconocidos).toEqual(['--limpiar', '--force']);
  });
});

describe('normalizarTelefonoE164 — paridad con el dominio', () => {
  const CASOS = [
    ['+595981234567', '+595981234567'],
    ['+595 981 234 567', '+595981234567'],
    ['0981 234 567', '+595981234567'],
    ['0981-234-567', '+595981234567'],
    ['(0981) 234-567', '+595981234567'],
    ['00595981234567', '+595981234567'],
    ['595981234567', '+595981234567'],
    ['981234567', '+595981234567'],
    ['29112345', '+59529112345'],
    ['0211234567', '+595211234567'],
    ['12125551234', '+12125551234'],
    ['0', null],
    ['+595', null],
    ['00', null],
    ['1234', null],
    ['abc', null],
    ['+-()', null],
    ['', null],
    ['   ', null],
    ['5959812345678901', null],
  ];

  it('produce exactamente lo que el dominio produce (copia documentada)', () => {
    for (const [entrada] of CASOS) {
      expect(normalizarTelefonoE164(entrada)).toBe(normalizarTelefonoE164Dominio(entrada));
    }
  });

  it('cubre los valores esperados del dominio (no solo auto-consistencia)', () => {
    for (const [entrada, esperado] of CASOS) {
      expect(normalizarTelefonoE164(entrada)).toBe(esperado);
      expect(normalizarTelefonoE164Dominio(entrada)).toBe(esperado);
    }
  });
});

describe('planificarNormalizacion (forma idempotente)', () => {
  const filas = [
    { id: 1, telefono: '0981 234 567', telefonoNormalizado: null },
    { id: 2, telefono: '0981 234 567', telefonoNormalizado: '+595981234567' },
    { id: 3, telefono: '1234', telefonoNormalizado: null },
    { id: 4, telefono: null, telefonoNormalizado: '+595981234567' }, // drift: se limpia a NULL
  ];

  it('clasifica actualizar / sin cambio / no normalizable', () => {
    expect(planificarNormalizacion(filas)).toEqual([
      { id: 1, telefono: '0981 234 567', normalizado: '+595981234567', accion: 'actualizar' },
      { id: 2, telefono: '0981 234 567', normalizado: '+595981234567', accion: 'sin cambio' },
      { id: 3, telefono: '1234', normalizado: null, accion: 'no normalizable' },
      { id: 4, telefono: null, normalizado: null, accion: 'actualizar' },
    ]);
  });

  it('re-run sobre el estado post-apply = cero actualizaciones (no-op)', () => {
    const trasApply = planificarNormalizacion(filas).map((p) => ({
      id: p.id,
      telefono: p.telefono,
      telefonoNormalizado: p.normalizado,
    }));
    const reRun = planificarNormalizacion(trasApply);
    expect(reRun.filter((p) => p.accion === 'actualizar')).toEqual([]);
    expect(reRun.map((p) => p.accion)).toEqual([
      'sin cambio',
      'sin cambio',
      'no normalizable',
      'no normalizable',
    ]);
  });
});

describe('SQL (UPDATE acotado, lectura prefiltrada)', () => {
  it('el UPDATE solo toca filas donde el valor difiere (comparación ISNULL)', () => {
    expect(SQL_ACTUALIZAR).toContain('UPDATE dbo.CRM_Contactos');
    expect(SQL_ACTUALIZAR).toContain('SET telefonoNormalizado = @normalizado');
    expect(SQL_ACTUALIZAR).toContain("ISNULL(telefonoNormalizado, '') <> ISNULL(@normalizado, '')");
    expect(SQL_ACTUALIZAR).toContain('WHERE id = @id');
  });

  it('la lectura prefiltra filas relevantes (telefono o normalizado presentes)', () => {
    expect(SQL_LEER).toContain('FROM dbo.CRM_Contactos');
    expect(SQL_LEER).toContain('WHERE telefono IS NOT NULL OR telefonoNormalizado IS NOT NULL');
  });
});
