import { describe, expect, it } from 'vitest';

import type { Etapa } from '../entities';
import {
  TRANSICIONES,
  TransicionInvalidaError,
  estadoInicial,
  puedeTransicionar,
  transitar,
} from '../maquinaEstados';
import type { EstadoPipeline, TipoResultado } from '../maquinaEstados';

/**
 * Pure-domain contract for the pipeline state machine (design D3:
 * "two doors, one cadence engine"). Every T1–T16 row of the design's
 * transition table gets a happy-path case with its EXACT next state
 * and its emitted result event (bold rows only — design D4's catalog
 * of 6 events, NO AvanceDeEtapa); the guards get illegal-move cases
 * rejected with Spanish typed errors. No mocks — the machine is pure.
 */

const IN = (etapa: Etapa): EstadoPipeline => ({ flujo: 'INBOUND', etapa });
const OUT = (etapa: Etapa): EstadoPipeline => ({ flujo: 'OUTBOUND', etapa });

describe('maquinaEstados — TRANSICIONES table (design D3)', () => {
  it('has exactly the 16 design rows T1–T16, each id unique', () => {
    expect(TRANSICIONES).toHaveLength(16);
    const ids = TRANSICIONES.map((t) => t.id);
    expect(new Set(ids).size).toBe(16);
    expect([...ids].sort()).toEqual(
      ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16'].sort(),
    );
  });

  it('emits ONLY the design D4 result catalog — 6 events, never AvanceDeEtapa', () => {
    const catalogo: TipoResultado[] = [
      'CotizaciónEnviada',
      'PresentaciónEnviada',
      'AceptaciónOutbound',
      'ConfirmaciónPresentación',
      'HandoffRegistrado',
      'ConversiónProspectoACliente',
    ];
    const emitidos = TRANSICIONES.map((t) => t.resultado).filter((r): r is TipoResultado => r !== null);
    expect(new Set(emitidos)).toEqual(new Set(catalogo));
    expect(emitidos).not.toContain('AvanceDeEtapa');
    // Bold rows: T2, T3, T4, T5, T7, T10, T12, T16 — exactly 8 rows
    // emit a result event (T7 repeats PresentaciónEnviada, T12 repeats
    // CotizaciónEnviada).
    expect(emitidos).toHaveLength(8);
  });
});

describe('maquinaEstados — estadoInicial (creation rows T1/T6)', () => {
  it('T1 — an Inbound empresa starts at INBOUND/REGISTRADO', () => {
    expect(estadoInicial('Inbound')).toEqual({ flujo: 'INBOUND', etapa: 'REGISTRADO' });
  });

  it('T6 — an Outbound empresa starts at OUTBOUND/NUEVO', () => {
    expect(estadoInicial('Outbound')).toEqual({ flujo: 'OUTBOUND', etapa: 'NUEVO' });
  });
});

describe('maquinaEstados — transitar: every design row happy path', () => {
  it('T2 — CotizaciónEnviada: IN/REGISTRADO → IN/SEGUIMIENTO, emits CotizaciónEnviada', () => {
    const r = transitar(IN('REGISTRADO'), 'CotizaciónEnviada');
    expect(r.estado).toEqual(IN('SEGUIMIENTO'));
    expect(r.resultado).toBe('CotizaciónEnviada');
  });

  it('T3 — PresentaciónEnviada: IN/SEGUIMIENTO → IN/PRESENTACION, emits PresentaciónEnviada', () => {
    const r = transitar(IN('SEGUIMIENTO'), 'PresentaciónEnviada');
    expect(r.estado).toEqual(IN('PRESENTACION'));
    expect(r.resultado).toBe('PresentaciónEnviada');
  });

  it('T4 — ConfirmaciónPresentación: IN/PRESENTACION → IN/CONFIRMADA, emits ConfirmaciónPresentación', () => {
    const r = transitar(IN('PRESENTACION'), 'ConfirmaciónPresentación');
    expect(r.estado).toEqual(IN('CONFIRMADA'));
    expect(r.resultado).toBe('ConfirmaciónPresentación');
  });

  it('T5 — HandoffRegistrado: IN/CONFIRMADA → IN/ENTREGADA, emits HandoffRegistrado', () => {
    const r = transitar(IN('CONFIRMADA'), 'HandoffRegistrado');
    expect(r.estado).toEqual(IN('ENTREGADA'));
    expect(r.resultado).toBe('HandoffRegistrado');
  });

  it('T7 — PresentaciónEnviada: OUT/NUEVO → OUT/CADENCIA, emits PresentaciónEnviada', () => {
    const r = transitar(OUT('NUEVO'), 'PresentaciónEnviada');
    expect(r.estado).toEqual(OUT('CADENCIA'));
    expect(r.resultado).toBe('PresentaciónEnviada');
  });

  it('T8 — EnviosAgotados: OUT/CADENCIA → OUT/DESCANSO, emits NOTHING', () => {
    const r = transitar(OUT('CADENCIA'), 'EnviosAgotados');
    expect(r.estado).toEqual(OUT('DESCANSO'));
    expect(r.resultado).toBeNull();
  });

  it('T9 — ReinicioCadencia: OUT/DESCANSO → OUT/CADENCIA, emits NOTHING', () => {
    const r = transitar(OUT('DESCANSO'), 'ReinicioCadencia');
    expect(r.estado).toEqual(OUT('CADENCIA'));
    expect(r.resultado).toBeNull();
  });

  it('T10 — AceptaciónOutbound: OUT/CADENCIA → OUT/ACEPTADO, emits AceptaciónOutbound', () => {
    const r = transitar(OUT('CADENCIA'), 'AceptaciónOutbound');
    expect(r.estado).toEqual(OUT('ACEPTADO'));
    expect(r.resultado).toBe('AceptaciónOutbound');
  });

  it('T11 — DatosSolicitados: OUT/ACEPTADO → OUT/DATOS, emits NOTHING (plain stage change)', () => {
    const r = transitar(OUT('ACEPTADO'), 'DatosSolicitados');
    expect(r.estado).toEqual(OUT('DATOS'));
    expect(r.resultado).toBeNull();
  });

  it('T12 — CotizaciónEnviada: OUT/DATOS flips the flow to IN/SEGUIMIENTO, emits CotizaciónEnviada', () => {
    const r = transitar(OUT('DATOS'), 'CotizaciónEnviada');
    expect(r.estado).toEqual(IN('SEGUIMIENTO'));
    expect(r.resultado).toBe('CotizaciónEnviada');
  });

  it('T13 — PasarAOutbound: IN/SEGUIMIENTO → OUT/NUEVO (user fork), emits NOTHING', () => {
    const r = transitar(IN('SEGUIMIENTO'), 'PasarAOutbound');
    expect(r.estado).toEqual(OUT('NUEVO'));
    expect(r.resultado).toBeNull();
  });

  it('T14 — Rechazo: any ACTIVE stage → RECHAZADO keeping the flujo, emits NOTHING', () => {
    const inbound = transitar(IN('SEGUIMIENTO'), 'Rechazo');
    expect(inbound.estado).toEqual(IN('RECHAZADO'));
    expect(inbound.resultado).toBeNull();

    const outbound = transitar(OUT('CADENCIA'), 'Rechazo');
    expect(outbound.estado).toEqual(OUT('RECHAZADO'));
    expect(outbound.resultado).toBeNull();
  });

  it('T15 — Reactivar: RECHAZADO → {flujo kept}/NUEVO (user action, not auto), emits NOTHING', () => {
    const inbound = transitar(IN('RECHAZADO'), 'Reactivar');
    expect(inbound.estado).toEqual(IN('NUEVO'));
    expect(inbound.resultado).toBeNull();

    const outbound = transitar(OUT('RECHAZADO'), 'Reactivar');
    expect(outbound.estado).toEqual(OUT('NUEVO'));
    expect(outbound.resultado).toBeNull();
  });

  it('T16 — ConversiónProspectoACliente: ANY state keeps its stage, emits ConversiónProspectoACliente', () => {
    for (const estado of [IN('SEGUIMIENTO'), OUT('CADENCIA'), IN('ENTREGADA'), IN('RECHAZADO')]) {
      const r = transitar(estado, 'ConversiónProspectoACliente');
      expect(r.estado).toEqual(estado);
      expect(r.resultado).toBe('ConversiónProspectoACliente');
    }
  });

  it('is pure — transitar returns a NEW state and never mutates its input', () => {
    const estado = IN('REGISTRADO');
    const r = transitar(estado, 'CotizaciónEnviada');
    expect(r.estado).not.toBe(estado);
    expect(estado).toEqual(IN('REGISTRADO'));
  });
});

describe('maquinaEstados — guards reject illegal moves (Spanish typed errors)', () => {
  const rechazar = (estado: EstadoPipeline, evento: Parameters<typeof transitar>[1]) => {
    expect(() => transitar(estado, evento)).toThrow(TransicionInvalidaError);
    expect(() => transitar(estado, evento)).toThrow(/Transición no válida/);
    expect(() => transitar(estado, evento)).toThrow(new RegExp(evento));
  };

  it('T3 guard — PresentaciónEnviada requires SEGUIMIENTO first (not REGISTRADO)', () => {
    rechazar(IN('REGISTRADO'), 'PresentaciónEnviada');
  });

  it('T2 guard — CotizaciónEnviada is inbound-only: OUT/NUEVO starts with PresentaciónEnviada', () => {
    rechazar(OUT('NUEVO'), 'CotizaciónEnviada');
  });

  it('T5 guard — HandoffRegistrado requires CONFIRMADA (presentation must be confirmed first)', () => {
    rechazar(IN('PRESENTACION'), 'HandoffRegistrado');
  });

  it('T10 guard — AceptaciónOutbound is outbound-only (IN/SEGUIMIENTO rejects it)', () => {
    rechazar(IN('SEGUIMIENTO'), 'AceptaciónOutbound');
  });

  it('T11 guard — DatosSolicitados only from ACEPTADO (not from CADENCIA)', () => {
    rechazar(OUT('CADENCIA'), 'DatosSolicitados');
  });

  it('T13 guard — PasarAOutbound only from the agotada IN/SEGUIMIENTO fork (not from OUT/NUEVO)', () => {
    rechazar(OUT('NUEVO'), 'PasarAOutbound');
  });

  it('T14 guard — Rechazo rejected from terminal ENTREGADA (only ACTIVE stages)', () => {
    rechazar(IN('ENTREGADA'), 'Rechazo');
  });

  it('T14 guard — Rechazo rejected from RECHAZADO itself (already rejected)', () => {
    rechazar(OUT('RECHAZADO'), 'Rechazo');
  });

  it('T15 guard — Reactivar only from RECHAZADO (not from REGISTRADO)', () => {
    rechazar(IN('REGISTRADO'), 'Reactivar');
  });

  it('T8/T9 guards — EnviosAgotados/ReinicioCadencia only on their outbound rest states', () => {
    rechazar(IN('SEGUIMIENTO'), 'EnviosAgotados');
    rechazar(OUT('NUEVO'), 'ReinicioCadencia');
  });

  it('the error message names the evento AND the estado (flujo/etapa)', () => {
    expect(() => transitar(IN('ENTREGADA'), 'Rechazo')).toThrow(
      'Transición no válida: el evento "Rechazo" no aplica desde INBOUND/ENTREGADA',
    );
  });
});

describe('maquinaEstados — puedeTransicionar mirrors transitar', () => {
  it('allows exactly the legal (estado, evento) pairs', () => {
    expect(puedeTransicionar(IN('REGISTRADO'), 'CotizaciónEnviada')).toBe(true);
    expect(puedeTransicionar(IN('SEGUIMIENTO'), 'PresentaciónEnviada')).toBe(true);
    expect(puedeTransicionar(IN('PRESENTACION'), 'ConfirmaciónPresentación')).toBe(true);
    expect(puedeTransicionar(IN('CONFIRMADA'), 'HandoffRegistrado')).toBe(true);
    expect(puedeTransicionar(OUT('NUEVO'), 'PresentaciónEnviada')).toBe(true);
    expect(puedeTransicionar(OUT('CADENCIA'), 'EnviosAgotados')).toBe(true);
    expect(puedeTransicionar(OUT('DESCANSO'), 'ReinicioCadencia')).toBe(true);
    expect(puedeTransicionar(OUT('CADENCIA'), 'AceptaciónOutbound')).toBe(true);
    expect(puedeTransicionar(OUT('ACEPTADO'), 'DatosSolicitados')).toBe(true);
    expect(puedeTransicionar(OUT('DATOS'), 'CotizaciónEnviada')).toBe(true);
    expect(puedeTransicionar(IN('SEGUIMIENTO'), 'PasarAOutbound')).toBe(true);
    expect(puedeTransicionar(IN('SEGUIMIENTO'), 'Rechazo')).toBe(true);
    expect(puedeTransicionar(OUT('RECHAZADO'), 'Reactivar')).toBe(true);
    expect(puedeTransicionar(IN('ENTREGADA'), 'ConversiónProspectoACliente')).toBe(true);
  });

  it('rejects exactly the illegal pairs (same guard table as transitar)', () => {
    expect(puedeTransicionar(IN('REGISTRADO'), 'PresentaciónEnviada')).toBe(false);
    expect(puedeTransicionar(OUT('NUEVO'), 'CotizaciónEnviada')).toBe(false);
    expect(puedeTransicionar(IN('PRESENTACION'), 'HandoffRegistrado')).toBe(false);
    expect(puedeTransicionar(IN('ENTREGADA'), 'Rechazo')).toBe(false);
    expect(puedeTransicionar(IN('RECHAZADO'), 'Rechazo')).toBe(false);
    expect(puedeTransicionar(IN('REGISTRADO'), 'Reactivar')).toBe(false);
    expect(puedeTransicionar(OUT('CADENCIA'), 'ConfirmaciónPresentación')).toBe(false);
  });

  it('rejects every evento from the OUT/DESCANSO resting state except the T9 re-entry', () => {
    for (const evento of [
      'CotizaciónEnviada',
      'PresentaciónEnviada',
      'ConfirmaciónPresentación',
      'HandoffRegistrado',
      'AceptaciónOutbound',
      'DatosSolicitados',
      'EnviosAgotados',
      'PasarAOutbound',
    ] as const) {
      expect(puedeTransicionar(OUT('DESCANSO'), evento), `T9: ${evento} must not fire from DESCANSO`).toBe(false);
    }
    expect(puedeTransicionar(OUT('DESCANSO'), 'ReinicioCadencia')).toBe(true);
    expect(puedeTransicionar(OUT('DESCANSO'), 'ConversiónProspectoACliente')).toBe(true);
    // T14 "any active" = every non-terminal, non-rejected state —
    // DESCANSO included (otherwise a resting empresa could never be
    // rejected without riding out the 3-month rest).
    expect(puedeTransicionar(OUT('DESCANSO'), 'Rechazo')).toBe(true);
    expect(transitar(OUT('DESCANSO'), 'Rechazo').estado).toEqual(OUT('RECHAZADO'));
  });
});
