import { describe, expect, it } from 'vitest';

import {
  agregarMeses,
  estaVencidaHoy,
  esReactivable,
  esReinicioDeCadencia,
  fechaHoy,
  proximoEnvio,
  requiereDecision,
  seccionCola,
} from '../cadence';
import type { PipelineEmpresa } from '../entities';

/**
 * Pure date-math contract for the cadence engine (design §3): the
 * shared 3-month calendar arithmetic (DATEADD(month, 3, x) — descanso
 * T8→T9 and rechazo cooldown T14→T15), the weekly windows
 * (proximo = fechaUltimoEnvio + 7d exact), the 3-strike rule and the
 * queue predicates (vencida / decisión requerida / reinicio /
 * reactivable). Every predicate receives `hoy` as an injected
 * DATE-only string — the domain never reads the wall clock.
 */

/** Minimal pipeline fixture: CADENCIA armed with envío #1 on 2026-09-14. */
function pipeline(overrides: Partial<PipelineEmpresa> = {}): PipelineEmpresa {
  return {
    empresaId: 1,
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-09-14',
    fechaUltimoEnvio: '2026-09-14',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: 'tester',
    updatedAt: '2026-09-14T00:00:00',
    ...overrides,
  };
}
describe('agregarMeses — DATEADD(month) calendar math (design §3)', () => {
  it('adds whole calendar months within a year', () => {
    expect(agregarMeses('2026-03-10', 3)).toBe('2026-06-10');
  });

  it('clamps to the last day when the target month is shorter (Jan 31 → Apr 30)', () => {
    expect(agregarMeses('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('clamps across a non-leap February (Nov 30 + 3m → Feb 28)', () => {
    expect(agregarMeses('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('wraps into the next year (Dec 15 + 3m → Mar 15)', () => {
    expect(agregarMeses('2026-12-15', 3)).toBe('2027-03-15');
  });

  it('keeps month-end when the target month is long enough (Oct 31 + 3m → Jan 31)', () => {
    expect(agregarMeses('2025-10-31', 3)).toBe('2026-01-31');
  });

  it('is pure — the input string is never modified', () => {
    const fecha = '2026-03-10';
    agregarMeses(fecha, 3);
    expect(fecha).toBe('2026-03-10');
  });
});

describe('fechaHoy — injected Clock → DATE-only string (ADR-9 naive wall clock)', () => {
  it('formats the injected clock date as YYYY-MM-DD', () => {
    expect(fechaHoy(() => new Date(2026, 8, 19, 14, 30, 5))).toBe('2026-09-19');
  });

  it('zero-pads month and day', () => {
    expect(fechaHoy(() => new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('proximoEnvio — fechaUltimoEnvio + 7 días exactos (design §3 weekly)', () => {
  it.each([
    ['2026-09-14', '2026-09-21'], // same month
    ['2026-08-28', '2026-09-04'], // month boundary
    ['2026-12-28', '2027-01-04'], // year boundary
    ['2026-02-22', '2026-03-01'], // non-leap February
    ['2028-02-22', '2028-02-29'], // leap February keeps day 29
  ])('%s + 7d = %s', (ultimo, esperado) => {
    expect(proximoEnvio(ultimo)).toBe(esperado);
  });
});

describe('estaVencidaHoy — ACTIVE ∧ enviosCiclo < 3 ∧ proximo ≤ hoy (design §3)', () => {
  it.each([
    [
      '6 días después del envío — la semana no venció',
      { etapa: 'SEGUIMIENTO', flujo: 'INBOUND', enviosCiclo: 1, fechaUltimoEnvio: '2026-09-14' },
      '2026-09-20',
      false,
    ],
    [
      'exactamente 7 días — vence hoy (cotización del lunes, lunes siguiente)',
      { etapa: 'SEGUIMIENTO', flujo: 'INBOUND', enviosCiclo: 1, fechaUltimoEnvio: '2026-09-14' },
      '2026-09-21',
      true,
    ],
    [
      'atrasada sigue vencida hasta que se registre el envío (aparece 1 vez por semana)',
      { etapa: 'SEGUIMIENTO', flujo: 'INBOUND', enviosCiclo: 1, fechaUltimoEnvio: '2026-09-14' },
      '2026-09-25',
      true,
    ],
    [
      'semana 2 del ciclo (envíos=2) también vence',
      { etapa: 'SEGUIMIENTO', flujo: 'INBOUND', enviosCiclo: 2, fechaUltimoEnvio: '2026-09-21' },
      '2026-09-28',
      true,
    ],
    [
      'puerta OUTBOUND (CADENCIA) usa la misma ventana semanal',
      { etapa: 'CADENCIA', flujo: 'OUTBOUND', enviosCiclo: 1, fechaUltimoEnvio: '2026-09-14' },
      '2026-09-21',
      true,
    ],
    [
      '3-strike: enviosCiclo=3 NUNCA vuelve a vencer (sale por T8/T13)',
      { etapa: 'SEGUIMIENTO', flujo: 'INBOUND', enviosCiclo: 3, fechaUltimoEnvio: '2026-09-07' },
      '2026-09-30',
      false,
    ],
    [
      'etapa sin cadencia activa (T3 desarma al pasar a PRESENTACION) no vence',
      { etapa: 'PRESENTACION', flujo: 'INBOUND', enviosCiclo: 1, fechaUltimoEnvio: '2026-09-14' },
      '2026-09-30',
      false,
    ],
    [
      'DESCANSO no vence (su sección de cola es el reinicio)',
      { etapa: 'DESCANSO', flujo: 'OUTBOUND', enviosCiclo: 3 },
      '2026-09-30',
      false,
    ],
    [
      'sin fechaUltimoEnvio no hay ventana que vencer (defensivo)',
      { etapa: 'CADENCIA', flujo: 'OUTBOUND', enviosCiclo: 0, fechaUltimoEnvio: null },
      '2026-09-30',
      false,
    ],
  ])('%s', (_descripcion, overrides, hoy, esperado) => {
    expect(estaVencidaHoy(pipeline(overrides), hoy)).toBe(esperado);
  });

  it('hoy viene inyectado: Clock → fechaHoy → predicado, sin Date.now en el dominio', () => {
    const hoy = fechaHoy(() => new Date(2026, 8, 21, 9, 0, 0));
    expect(
      estaVencidaHoy(
        pipeline({ etapa: 'SEGUIMIENTO', flujo: 'INBOUND', enviosCiclo: 1, fechaUltimoEnvio: '2026-09-14' }),
        hoy,
      ),
    ).toBe(true);
  });
});

describe('requiereDecision — IN/SEGUIMIENTO agotada → fork T13/T14 (design §3 3-strike)', () => {
  it.each([
    [
      'INBOUND/SEGUIMIENTO con 3 envíos sin respuesta → decisión requerida',
      { flujo: 'INBOUND', etapa: 'SEGUIMIENTO', enviosCiclo: 3 },
      true,
    ],
    [
      'INBOUND/SEGUIMIENTO con 2 envíos → la cadencia sigue',
      { flujo: 'INBOUND', etapa: 'SEGUIMIENTO', enviosCiclo: 2 },
      false,
    ],
    [
      'OUTBOUND/CADENCIA con 3 envíos → NO es decisión (T8 es automático, asimetría del spec)',
      { flujo: 'OUTBOUND', etapa: 'CADENCIA', enviosCiclo: 3 },
      false,
    ],
    [
      'INBOUND/RECHAZADO con 3 envíos → no (está en cooldown, sale por T15)',
      { flujo: 'INBOUND', etapa: 'RECHAZADO', enviosCiclo: 3, rechazadoHasta: '2026-12-19' },
      false,
    ],
  ])('%s', (_descripcion, overrides, esperado) => {
    expect(requiereDecision(pipeline(overrides))).toBe(esperado);
  });
});

describe('esReinicioDeCadencia — DESCANSO ∧ descansoHasta ≤ hoy (T9, design §3)', () => {
  it('rest then repeat: 3er envío 2026-06-19 → descansoHasta (agregarMeses ×3) → due exacto a 3 meses', () => {
    const descansoHasta = agregarMeses('2026-06-19', 3);
    expect(descansoHasta).toBe('2026-09-19');
    expect(
      esReinicioDeCadencia(pipeline({ etapa: 'DESCANSO', descansoHasta }), '2026-09-19'),
    ).toBe(true);
  });

  it.each([
    [
      'un día antes del descansoHasta → aún descansa',
      '2026-09-20',
      '2026-09-19',
      false,
    ],
    [
      'vencido hace días → reinicio debido (la cola lo espera)',
      '2026-06-10',
      '2026-09-19',
      true,
    ],
  ])('%s', (_descripcion, descansoHasta, hoy, esperado) => {
    expect(esReinicioDeCadencia(pipeline({ etapa: 'DESCANSO', descansoHasta }), hoy)).toBe(esperado);
  });

  it.each([
    ['CADENCIA activa no es reinicio', { etapa: 'CADENCIA', descansoHasta: null }],
    ['DESCANSO sin fecha (defensivo: T8 siempre la arma) no es reinicio', { etapa: 'DESCANSO', descansoHasta: null }],
  ])('%s', (_descripcion, overrides) => {
    expect(esReinicioDeCadencia(pipeline(overrides), '2026-09-19')).toBe(false);
  });
});

describe('esReactivable — RECHAZADO ∧ rechazadoHasta ≤ hoy (T15, spec G4 cooldown)', () => {
  it('cooldown de 3 meses: rechazo 2026-06-19 → rechazadoHasta (agregarMeses ×3) → reactivable el día exacto', () => {
    const rechazadoHasta = agregarMeses('2026-06-19', 3);
    expect(rechazadoHasta).toBe('2026-09-19');
    expect(
      esReactivable(pipeline({ etapa: 'RECHAZADO', rechazadoHasta, motivoRechazo: 'Ya tiene proveedor' }), '2026-09-19'),
    ).toBe(true);
  });

  it.each([
    [
      'dentro del cooldown → oculta de la cola (spec: hidden 3 months)',
      '2026-12-19',
      '2026-09-19',
      false,
    ],
    [
      'cooldown vencido hace tiempo → reactivable',
      '2026-06-10',
      '2026-09-19',
      true,
    ],
  ])('%s', (_descripcion, rechazadoHasta, hoy, esperado) => {
    expect(esReactivable(pipeline({ etapa: 'RECHAZADO', rechazadoHasta }), hoy)).toBe(esperado);
  });

  it.each([
    ['etapa activa nunca es reactivable', { etapa: 'SEGUIMIENTO', flujo: 'INBOUND', rechazadoHasta: null }],
    ['RECHAZADO sin fecha (defensivo: T14 siempre la arma) no es reactivable', { etapa: 'RECHAZADO', rechazadoHasta: null }],
  ])('%s', (_descripcion, overrides) => {
    expect(esReactivable(pipeline(overrides), '2026-09-19')).toBe(false);
  });
});

describe('seccionCola — the queue is the union of the four predicates (tasks pr13/WU2, design §3)', () => {
  const HOY = '2026-09-19';

  it('classifies a due ACTIVE row as vencidasHoy', () => {
    expect(
      seccionCola(pipeline({ etapa: 'CADENCIA', enviosCiclo: 1, fechaUltimoEnvio: '2026-09-12' }), HOY),
    ).toBe('vencidasHoy');
    expect(
      seccionCola(pipeline({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO', enviosCiclo: 2, fechaUltimoEnvio: '2026-09-05' }), HOY),
    ).toBe('vencidasHoy');
  });

  it('classifies an agotada INBOUND/SEGUIMIENTO as decisionRequerida (3-strike fork)', () => {
    expect(
      seccionCola(pipeline({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO', enviosCiclo: 3, fechaUltimoEnvio: '2026-09-05' }), HOY),
    ).toBe('decisionRequerida');
  });

  it('classifies an expired DESCANSO as reinicios (T9 re-entry)', () => {
    expect(
      seccionCola(pipeline({ etapa: 'DESCANSO', enviosCiclo: 3, descansoHasta: HOY }), HOY),
    ).toBe('reinicios');
  });

  it('classifies an expired RECHAZADO as reactivables (T15)', () => {
    expect(
      seccionCola(
        pipeline({ etapa: 'RECHAZADO', rechazadoHasta: HOY, motivoRechazo: 'Ya tiene proveedor' }),
        HOY,
      ),
    ).toBe('reactivables');
  });

  it('returns null for rows outside the queue (armed-not-due, resting, cooling, disarmed stages)', () => {
    expect(seccionCola(pipeline({ enviosCiclo: 1, fechaUltimoEnvio: '2026-09-18' }), HOY)).toBeNull(); // proximo = 2026-09-25
    expect(seccionCola(pipeline({ etapa: 'DESCANSO', descansoHasta: '2026-09-20' }), HOY)).toBeNull(); // rest running
    expect(seccionCola(pipeline({ etapa: 'RECHAZADO', rechazadoHasta: '2026-12-01' }), HOY)).toBeNull(); // cooldown
    expect(seccionCola(pipeline({ flujo: 'INBOUND', etapa: 'REGISTRADO', enviosCiclo: 0, fechaCicloInicio: null, fechaUltimoEnvio: null }), HOY)).toBeNull();
    expect(seccionCola(pipeline({ etapa: 'ENTREGADA' }), HOY)).toBeNull();
  });
});
