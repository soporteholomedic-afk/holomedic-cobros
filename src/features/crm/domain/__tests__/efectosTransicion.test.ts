import { describe, expect, it } from 'vitest';

import type { PipelineEmpresa } from '../entities';
import { efectosTransicion } from '../efectosTransicion';

/**
 * Pure denormalized-counter projection (tasks pr10/WU1, design D3
 * effects column): the state machine (pr9) owns `{flujo, etapa}`; these
 * effects own the CRM_Pipeline cadence counters and DATE markers each
 * transition writes. Pinned contracts:
 * - T2/T7/T12 arm/re-arm: ciclo=1, enviosCiclo=1, both dates = hoy.
 * - T8: descansoHasta = fechaUltimoEnvio + 3 calendar months (fallback
 *   hoy when no send was ever logged — the stage guard alone does not
 *   prove a send exists).
 * - T9: ciclo+1, enviosCiclo=1, dates = hoy, descansoHasta cleared.
 * - T14: rechazadoHasta = hoy + 3 months, motivoRechazo = motivo.
 * - T13/T15 (entries into the unarmed NUEVO stage): enviosCiclo back
 *   to 0; T15 additionally clears the rejection markers.
 * - Everything else: passthrough (audit/result write, not counters).
 */

function fila(overrides: Partial<PipelineEmpresa> = {}): PipelineEmpresa {
  return {
    empresaId: 1,
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 2,
    fechaCicloInicio: '2026-02-01',
    fechaUltimoEnvio: '2026-03-10',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: 'jperez',
    updatedAt: '2026-03-10T10:00:00.000Z',
    ...overrides,
  };
}

const HOY = '2026-06-01';

describe('efectosTransicion — arming the cadence (T2/T7/T12)', () => {
  it('T2 arms the cycle from INBOUND/REGISTRADO: ciclo=1, envios=1, both dates = hoy', () => {
    const efectos = efectosTransicion(
      fila({ flujo: 'INBOUND', etapa: 'REGISTRADO', ciclo: 1, enviosCiclo: 0, fechaCicloInicio: null, fechaUltimoEnvio: null }),
      'CotizaciónEnviada',
      HOY,
    );
    expect(efectos.ciclo).toBe(1);
    expect(efectos.enviosCiclo).toBe(1);
    expect(efectos.fechaCicloInicio).toBe(HOY);
    expect(efectos.fechaUltimoEnvio).toBe(HOY);
  });

  it('T7 arms the outbound cycle from OUTBOUND/NUEVO the same way', () => {
    const efectos = efectosTransicion(
      fila({ flujo: 'OUTBOUND', etapa: 'NUEVO', enviosCiclo: 0, fechaCicloInicio: null, fechaUltimoEnvio: null }),
      'PresentaciónEnviada',
      HOY,
    );
    expect(efectos.ciclo).toBe(1);
    expect(efectos.enviosCiclo).toBe(1);
    expect(efectos.fechaUltimoEnvio).toBe(HOY);
  });

  it('T12 RE-ARMS after the flow flip (fresh cycle from OUTBOUND/DATOS)', () => {
    const efectos = efectosTransicion(
      fila({ flujo: 'OUTBOUND', etapa: 'DATOS', ciclo: 2, enviosCiclo: 3 }),
      'CotizaciónEnviada',
      HOY,
    );
    expect(efectos.ciclo).toBe(1);
    expect(efectos.enviosCiclo).toBe(1);
    expect(efectos.fechaCicloInicio).toBe(HOY);
    expect(efectos.fechaUltimoEnvio).toBe(HOY);
  });
});

describe('efectosTransicion — the 3-month rest and cooldown markers', () => {
  it('T8 derives descansoHasta = fechaUltimoEnvio + 3 months and leaves the counters alone', () => {
    const efectos = efectosTransicion(fila({ enviosCiclo: 3 }), 'EnviosAgotados', HOY);
    expect(efectos.descansoHasta).toBe('2026-06-10');
    expect(efectos.enviosCiclo).toBe(3);
    expect(efectos.ciclo).toBe(1);
    expect(efectos.fechaUltimoEnvio).toBe('2026-03-10');
  });

  it('T8 falls back to hoy + 3 months when no send was ever logged (defensive)', () => {
    const efectos = efectosTransicion(fila({ fechaUltimoEnvio: null }), 'EnviosAgotados', HOY);
    expect(efectos.descansoHasta).toBe('2026-09-01');
  });

  it('T9 restarts the cycle: ciclo+1, envios=1, dates = hoy, descansoHasta cleared', () => {
    const efectos = efectosTransicion(
      fila({ etapa: 'DESCANSO', ciclo: 2, descansoHasta: '2026-06-10' }),
      'ReinicioCadencia',
      HOY,
    );
    expect(efectos.ciclo).toBe(3);
    expect(efectos.enviosCiclo).toBe(1);
    expect(efectos.fechaCicloInicio).toBe(HOY);
    expect(efectos.fechaUltimoEnvio).toBe(HOY);
    expect(efectos.descansoHasta).toBeNull();
  });

  it('T14 stores the cooldown marker (hoy + 3 months) and the motivo mirror', () => {
    const efectos = efectosTransicion(
      fila({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO' }),
      'Rechazo',
      HOY,
      'Ya tiene proveedor',
    );
    expect(efectos.rechazadoHasta).toBe('2026-09-01');
    expect(efectos.motivoRechazo).toBe('Ya tiene proveedor');
    // Cadence counters are untouched by a rejection.
    expect(efectos.ciclo).toBe(1);
    expect(efectos.enviosCiclo).toBe(2);
    expect(efectos.descansoHasta).toBeNull();
  });
});

describe('efectosTransicion — unarmed NUEVO entries and passthrough rows', () => {
  it('T13 resets enviosCiclo to 0 (agotada SEGUIMIENTO fork into the unarmed door)', () => {
    const efectos = efectosTransicion(
      fila({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO', enviosCiclo: 3 }),
      'PasarAOutbound',
      HOY,
    );
    expect(efectos.enviosCiclo).toBe(0);
    expect(efectos.descansoHasta).toBeNull();
    expect(efectos.rechazadoHasta).toBeNull();
  });

  it('T15 clears the rejection markers and resets enviosCiclo; ciclo keeps its history', () => {
    const efectos = efectosTransicion(
      fila({ etapa: 'RECHAZADO', ciclo: 3, rechazadoHasta: '2026-05-01', motivoRechazo: 'Sin presupuesto', enviosCiclo: 2 }),
      'Reactivar',
      HOY,
    );
    expect(efectos.rechazadoHasta).toBeNull();
    expect(efectos.motivoRechazo).toBeNull();
    expect(efectos.enviosCiclo).toBe(0);
    expect(efectos.ciclo).toBe(3);
  });

  it('plain stage changes (T3/T4/T5/T10/T11) pass every counter through untouched', () => {
    // Each fixture matches its T-row's guard so the event resolves the
    // REAL row — notably T3 (PresentaciónEnviada from IN/SEGUIMIENTO)
    // must NOT arm, unlike its name-sharer T7.
    const casos: readonly [PipelineEmpresa, Parameters<typeof efectosTransicion>[1]][] = [
      [fila({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO' }), 'PresentaciónEnviada'],
      [fila({ flujo: 'INBOUND', etapa: 'PRESENTACION' }), 'ConfirmaciónPresentación'],
      [fila({ flujo: 'INBOUND', etapa: 'CONFIRMADA' }), 'HandoffRegistrado'],
      [fila(), 'AceptaciónOutbound'],
      [fila({ etapa: 'ACEPTADO' }), 'DatosSolicitados'],
    ];
    for (const [estado, evento] of casos) {
      const efectos = efectosTransicion(estado, evento, HOY);
      expect(efectos).toEqual({
        ciclo: 1,
        enviosCiclo: 2,
        fechaCicloInicio: '2026-02-01',
        fechaUltimoEnvio: '2026-03-10',
        descansoHasta: null,
        rechazadoHasta: null,
        motivoRechazo: null,
      });
    }
  });

  it('T3 does NOT arm the cadence even though it shares PresentaciónEnviada with T7', () => {
    const efectos = efectosTransicion(
      fila({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO', ciclo: 1, enviosCiclo: 2, fechaUltimoEnvio: '2026-03-10' }),
      'PresentaciónEnviada',
      HOY,
    );
    expect(efectos.enviosCiclo).toBe(2);
    expect(efectos.fechaUltimoEnvio).toBe('2026-03-10');
    expect(efectos.fechaCicloInicio).toBe('2026-02-01');
  });

  it('is pure — the stored pipeline row is never mutated', () => {
    const base = fila();
    const copia = structuredClone(base);
    efectosTransicion(base, 'EnviosAgotados', HOY);
    expect(base).toEqual(copia);
  });
});
