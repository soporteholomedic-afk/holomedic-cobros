import { describe, expect, it } from 'vitest';

import {
  CARGO_DEFAULT,
  TRABAJADORES_DEFAULT,
  construirInforme,
  planificarBackfills,
} from '../crm-normalizar-datos.mjs';

/**
 * Pure-derivation pins for the one-off test-data normalization script
 * (spec crm-data-normalization, decision 11 test-data-only):
 * - Backfill ONLY what the product itself defines as default (decision 5:
 *   cargo "Recursos Humanos / Seguridad", 30 trabajadores) and ONLY where
 *   the column is NULL — the plan shape guarantees idempotent re-runs.
 * - Sector is NEVER auto-backfilled (no derivable source) — reported.
 * - Contactos without telefono are reported, never mutated.
 */

/** Row factory mirroring the script's SELECT (empresa LEFT JOIN contacto). */
function fila(sobreescritos = {}) {
  return {
    empresaId: 1,
    razonSocial: 'Constructora Andes SAC',
    sector: 'Construcción',
    cantidadTrabajadores: 30,
    contactoId: 11,
    contactoCargo: 'Recursos Humanos / Seguridad',
    telefono: '987654321',
    ...sobreescritos,
  };
}

describe('planificarBackfills', () => {
  it('pins the decision-5 default constants', () => {
    expect(CARGO_DEFAULT).toBe('Recursos Humanos / Seguridad');
    expect(TRABAJADORES_DEFAULT).toBe(30);
  });

  it('plans cargo and trabajadores backfills ONLY for NULL columns (deduped)', () => {
    const filas = [
      // Empresa 1 via contacto 11: both backfills due (trabajadores NULL).
      fila({ contactoId: 11, contactoCargo: null, cantidadTrabajadores: null }),
      // Same empresa via a second contacto: trabajadores must appear ONCE.
      fila({ contactoId: 12, contactoCargo: 'Jefe de Obra', cantidadTrabajadores: null }),
      fila({ empresaId: 2, razonSocial: 'Minera Tres Raíces', sector: null, cantidadTrabajadores: null, contactoId: null, contactoCargo: null, telefono: null }),
    ];

    expect(planificarBackfills(filas)).toEqual({
      cargosPorContacto: [11],
      trabajadoresPorEmpresa: [1, 2],
    });
  });

  it('returns EMPTY plans for complete rows (idempotent re-run shape)', () => {
    // Deliberate setup: every column already populated → the emptiness is
    // produced by the NULL-guards, not by missing input.
    const filas = [fila(), fila({ empresaId: 2, contactoId: null, contactoCargo: null })];

    expect(planificarBackfills(filas)).toEqual({
      cargosPorContacto: [],
      trabajadoresPorEmpresa: [],
    });
  });
});

describe('construirInforme', () => {
  it('counts plans and reports sin-sector / sin-telefono rows by name', () => {
    const filas = [
      fila({ telefono: null }),
      fila({ empresaId: 2, razonSocial: 'Minera Tres Raíces', sector: null, cantidadTrabajadores: null, contactoId: null, contactoCargo: null, telefono: null }),
      fila({ empresaId: 3, razonSocial: 'Transportes Río Sur', contactoId: 31, contactoCargo: null, telefono: null }),
    ];

    const informe = construirInforme(filas);

    expect(informe).toEqual({
      totalEmpresas: 3,
      totalContactos: 2,
      porBackfillCargo: 1,
      porBackfillTrabajadores: 1,
      sinSector: ['Minera Tres Raíces'],
      sinTelefono: ['Constructora Andes SAC', 'Transportes Río Sur'],
    });
  });

  it('reports NO findings for fully normalized rows', () => {
    // Deliberate setup: nothing NULL → all report lists empty by evaluation.
    const filas = [fila(), fila({ empresaId: 2, razonSocial: 'Otra SAC', contactoId: null, contactoCargo: null })];

    expect(construirInforme(filas)).toEqual({
      totalEmpresas: 2,
      totalContactos: 1,
      porBackfillCargo: 0,
      porBackfillTrabajadores: 0,
      sinSector: [],
      sinTelefono: [],
    });
  });
});
