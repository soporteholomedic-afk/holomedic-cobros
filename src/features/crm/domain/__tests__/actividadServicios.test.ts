import { describe, expect, it } from 'vitest';

import { estadoActividadServicios } from '../actividadServicios';

/** Fixed anchor so month math is deterministic: 2026-10-31 (Lima irrelevant here, UTC math). */
const HOY = new Date('2026-10-31T00:00:00Z');

describe('estadoActividadServicios', () => {
  it('sin_informacion when the empresa has no RUC (nothing to look up, never "inactive" — S6.7)', () => {
    expect(
      estadoActividadServicios('cliente', { ruc: null, ultimaAtencion: null }, HOY),
    ).toBe('sin_informacion');
  });

  it('sin_informacion for prospectos even when they have attention data', () => {
    expect(
      estadoActividadServicios('prospecto', { ruc: '20512345678', ultimaAtencion: '2026-10-01' }, HOY),
    ).toBe('sin_informacion');
  });

  it('pendiente_primera for a cliente whose RUC has NO attention in SIGLA (S6.7/S5.3)', () => {
    expect(
      estadoActividadServicios('cliente', { ruc: '20512345678', ultimaAtencion: null }, HOY),
    ).toBe('pendiente_primera');
  });

  it('reciente within the 4-month window, counting whole months (S6.6)', () => {
    expect(
      estadoActividadServicios('cliente', { ruc: '2', ultimaAtencion: '2026-08-01' }, HOY),
    ).toBe('reciente');
    // 2026-06-30 → 2026-10-31 is 4 whole months + 1 day → inactivo.
    expect(
      estadoActividadServicios('cliente', { ruc: '2', ultimaAtencion: '2026-06-30' }, HOY),
    ).toBe('sin_actividad');
    // 2026-07-01 → 2026-10-31 is exactly 3 whole months + 30 days → still reciente.
    expect(
      estadoActividadServicios('cliente', { ruc: '2', ultimaAtencion: '2026-07-01' }, HOY),
    ).toBe('reciente');
  });

  it('sin_actividad strictly at 4 whole months (S6.6)', () => {
    expect(
      estadoActividadServicios('cliente', { ruc: '2', ultimaAtencion: '2025-10-31' }, HOY),
    ).toBe('sin_actividad');
  });

  it('a call or email can never clear the signal — the state only reads attention data (S6.6)', () => {
    // The function has no inputs that a call/email could change: same answer
    // whatever the commercial history says.
    const r = estadoActividadServicios('cliente', { ruc: '2', ultimaAtencion: '2026-01-15' }, HOY);
    expect(r).toBe('sin_actividad');
  });
});
