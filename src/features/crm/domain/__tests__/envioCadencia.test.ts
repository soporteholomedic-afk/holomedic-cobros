import { describe, expect, it } from 'vitest';

import type { PipelineEmpresa } from '../entities';
import { ValidationError } from '../errors';
import { agregarMeses } from '../cadence';
import { aplicarEnvioCadencia } from '../envioCadencia';

/**
 * Pure domain contract for logging ONE cadence send (tasks pr13/WU1,
 * design §3, spec G4). The user logs the ENVIO_CADENCIA activity by
 * hand (no auto-send); the send's counter projection composes:
 * - the weekly increment (enviosCiclo+1, fechaUltimoEnvio = hoy) —
 *   the denormalization the queue scans, so the next proximo is
 *   exactly hoy + 7d;
 * - the pr10 machine effects when the send DERIVES a transition:
 *   the 3rd OUTBOUND/CADENCIA send auto-fires T8 (EnviosAgotados →
 *   DESCANSO, descansoHasta set) and a send logged on an expired
 *   DESCANSO fires T9 (ReinicioCadencia → CADENCIA, ciclo+1) — both
 *   through `efectosTransicion` keyed on the resolved T-row, never on
 *   the event name.
 * INBOUND's 3-strike deliberately stays transition-free (T13/T14 fork
 * is a USER decision — the pr12 spec asymmetry, test-locked here).
 * Zero mocks: pure functions over an injected `hoy`.
 */

const HOY = '2026-06-01';

function fila(overrides: Partial<PipelineEmpresa>): PipelineEmpresa {
  return {
    empresaId: 42,
    flujo: 'INBOUND',
    etapa: 'SEGUIMIENTO',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-05-11',
    fechaUltimoEnvio: '2026-05-25',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-05-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('aplicarEnvioCadencia — weekly due send (plain counter projection)', () => {
  it('projects enviosCiclo+1 and fechaUltimoEnvio = hoy with NO machine transition', () => {
    const resultado = aplicarEnvioCadencia(fila({ enviosCiclo: 1, fechaUltimoEnvio: '2026-05-25' }), HOY);

    expect(resultado.transicion).toBeNull();
    expect(resultado.efectos).toEqual({
      ciclo: 1,
      enviosCiclo: 2,
      fechaCicloInicio: '2026-05-11',
      fechaUltimoEnvio: HOY,
      descansoHasta: null,
      rechazadoHasta: null,
      motivoRechazo: null,
    });
  });

  it('rejects an early send: proximo = fechaUltimoEnvio + 7d exact, hoy-6 is NOT due', () => {
    expect(() => aplicarEnvioCadencia(fila({ fechaUltimoEnvio: '2026-05-26' }), HOY)).toThrow(
      ValidationError,
    );
  });

  it('accepts the send exactly on proximo (fechaUltimoEnvio = hoy - 7d, month boundary included)', () => {
    // 2026-05-04 + 7d = 2026-05-11... two week-steps land on 2026-05-25;
    // a cross-month step: last send 2026-05-25 + 7d = 2026-06-01 = HOY.
    const resultado = aplicarEnvioCadencia(fila({ enviosCiclo: 2, fechaUltimoEnvio: '2026-05-25' }), HOY);
    expect(resultado.efectos.fechaUltimoEnvio).toBe(HOY);
    expect(resultado.efectos.enviosCiclo).toBe(3);
  });
});

describe('aplicarEnvioCadencia — 3rd send on OUTBOUND/CADENCIA auto-fires T8', () => {
  it('derives EnviosAgotados via the machine: DESCANSO + descansoHasta = hoy + 3 months', () => {
    const resultado = aplicarEnvioCadencia(
      fila({
        flujo: 'OUTBOUND',
        etapa: 'CADENCIA',
        ciclo: 2,
        enviosCiclo: 2,
        fechaCicloInicio: '2026-05-11',
        fechaUltimoEnvio: '2026-05-25',
      }),
      HOY,
    );

    expect(resultado.transicion).toEqual({
      evento: 'EnviosAgotados',
      estadoPrevio: { flujo: 'OUTBOUND', etapa: 'CADENCIA' },
      estadoNuevo: { flujo: 'OUTBOUND', etapa: 'DESCANSO' },
    });
    // T8's descansoHasta derives from the JUST-LOGGED send date (hoy),
    // and the send counter stays at 3 — the effects read the row AFTER
    // the weekly increment.
    expect(resultado.efectos).toEqual({
      ciclo: 2,
      enviosCiclo: 3,
      fechaCicloInicio: '2026-05-11',
      fechaUltimoEnvio: HOY,
      descansoHasta: agregarMeses(HOY, 3),
      rechazadoHasta: null,
      motivoRechazo: null,
    });
  });

  it('does NOT fire T8 before the 3rd send (2nd send stays a plain projection)', () => {
    const resultado = aplicarEnvioCadencia(
      fila({
        flujo: 'OUTBOUND',
        etapa: 'CADENCIA',
        ciclo: 2,
        enviosCiclo: 1,
        fechaUltimoEnvio: '2026-05-25',
      }),
      HOY,
    );

    expect(resultado.transicion).toBeNull();
    expect(resultado.efectos.enviosCiclo).toBe(2);
    expect(resultado.efectos.descansoHasta).toBeNull();
  });

  it('does NOT fire T8 on the INBOUND 3-strike: the fork stays a user decision (T13/T14)', () => {
    const resultado = aplicarEnvioCadencia(
      fila({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO', enviosCiclo: 2, fechaUltimoEnvio: '2026-05-25' }),
      HOY,
    );

    expect(resultado.transicion).toBeNull();
    expect(resultado.efectos.enviosCiclo).toBe(3);
    expect(resultado.efectos.descansoHasta).toBeNull();
  });
});

describe('aplicarEnvioCadencia — send logged on an expired DESCANSO fires T9', () => {
  it('derives ReinicioCadencia via the machine: back to CADENCIA, ciclo+1, envios=1, descanso cleared', () => {
    const resultado = aplicarEnvioCadencia(
      fila({
        flujo: 'OUTBOUND',
        etapa: 'DESCANSO',
        ciclo: 2,
        enviosCiclo: 3,
        fechaCicloInicio: '2026-03-02',
        fechaUltimoEnvio: '2026-03-16',
        descansoHasta: HOY,
      }),
      HOY,
    );

    expect(resultado.transicion).toEqual({
      evento: 'ReinicioCadencia',
      estadoPrevio: { flujo: 'OUTBOUND', etapa: 'DESCANSO' },
      estadoNuevo: { flujo: 'OUTBOUND', etapa: 'CADENCIA' },
    });
    expect(resultado.efectos).toEqual({
      ciclo: 3,
      enviosCiclo: 1,
      fechaCicloInicio: HOY,
      fechaUltimoEnvio: HOY,
      descansoHasta: null,
      rechazadoHasta: null,
      motivoRechazo: null,
    });
  });

  it('rejects the send while the 3-month rest is still running (descansoHasta > hoy)', () => {
    expect(() =>
      aplicarEnvioCadencia(
        fila({ flujo: 'OUTBOUND', etapa: 'DESCANSO', descansoHasta: '2026-06-02' }),
        HOY,
      ),
    ).toThrow(ValidationError);
  });
});

describe('aplicarEnvioCadencia — sends outside the cadence are validation errors', () => {
  it('rejects a send for an agotada INBOUND/SEGUIMIENTO (decision queue owns it, not the send)', () => {
    expect(() =>
      aplicarEnvioCadencia(fila({ enviosCiclo: 3, fechaUltimoEnvio: '2026-05-25' }), HOY),
    ).toThrow(ValidationError);
  });

  it('rejects a send from an unarmed NUEVO stage (never armed, no fechaUltimoEnvio)', () => {
    expect(() =>
      aplicarEnvioCadencia(
        fila({ flujo: 'OUTBOUND', etapa: 'NUEVO', enviosCiclo: 0, fechaCicloInicio: null, fechaUltimoEnvio: null }),
        HOY,
      ),
    ).toThrow(ValidationError);
  });

  it('rejects a send from RECHAZADO (cooldown — reactivation is T15, a user action)', () => {
    expect(() =>
      aplicarEnvioCadencia(
        fila({ etapa: 'RECHAZADO', rechazadoHasta: '2026-09-01', motivoRechazo: 'Ya tiene proveedor' }),
        HOY,
      ),
    ).toThrow(ValidationError);
  });

  it('rejects a send from a disarmed stage (PRESENTACION — the cadence ended)', () => {
    expect(() => aplicarEnvioCadencia(fila({ etapa: 'PRESENTACION' }), HOY)).toThrow(ValidationError);
  });
});
