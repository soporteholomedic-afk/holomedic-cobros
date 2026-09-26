import { describe, expect, it } from 'vitest';

import { EVENTOS_PIPELINE, EVENTOS_RESULTADO } from '../../domain/maquinaEstados';
import type { Etapa } from '../../domain/entities';
import {
  ETIQUETA_ACCION_ASIGNACION,
  ETIQUETA_ETAPA,
  ETIQUETA_EVENTO,
  ETIQUETA_EVENTO_RESULTADO,
  ETIQUETA_FLUJO,
  formatearFecha,
  transicionesDisponibles,
} from '../etiquetas';
import type { AccionAsignacion } from '../../domain/entities';

describe('ETIQUETA_ETAPA / ETIQUETA_FLUJO (Spanish UI labels)', () => {
  it('covers every etapa of the machine with a non-empty Spanish label', () => {
    const etapas: Etapa[] = [
      'REGISTRADO',
      'SEGUIMIENTO',
      'PRESENTACION',
      'CONFIRMADA',
      'ENTREGADA',
      'NUEVO',
      'CADENCIA',
      'ACEPTADO',
      'DATOS',
      'DESCANSO',
      'RECHAZADO',
    ];
    for (const etapa of etapas) {
      expect(ETIQUETA_ETAPA[etapa], `falta etiqueta para ${etapa}`).toBeTruthy();
    }
    expect(ETIQUETA_ETAPA.REGISTRADO).toBe('Registrado');
    expect(ETIQUETA_ETAPA.PRESENTACION).toBe('Presentación');
    expect(ETIQUETA_ETAPA.RECHAZADO).toBe('Rechazado');
  });

  it('labels both flows', () => {
    expect(ETIQUETA_FLUJO.INBOUND).toBe('Inbound');
    expect(ETIQUETA_FLUJO.OUTBOUND).toBe('Outbound');
  });
});

describe('ETIQUETA_EVENTO', () => {
  it('covers every machine event with a non-empty Spanish label', () => {
    for (const evento of EVENTOS_PIPELINE) {
      expect(ETIQUETA_EVENTO[evento], `falta etiqueta para ${evento}`).toBeTruthy();
    }
    expect(ETIQUETA_EVENTO.Rechazo).toBe('Rechazar');
    expect(ETIQUETA_EVENTO.HandoffRegistrado).toBe('Registrar handoff');
  });
});

describe('transicionesDisponibles (puedeTransicionar over the event whitelist)', () => {
  it('offers CotizaciónEnviada and the rejection fork from INBOUND/REGISTRADO (T14 fires from any active stage)', () => {
    expect(transicionesDisponibles({ flujo: 'INBOUND', etapa: 'REGISTRADO' })).toEqual([
      'CotizaciónEnviada',
      'Rechazo',
    ]);
  });

  it('offers PresentaciónEnviada and the rejection fork from OUTBOUND/NUEVO (T7 + T14)', () => {
    expect(transicionesDisponibles({ flujo: 'OUTBOUND', etapa: 'NUEVO' })).toEqual([
      'PresentaciónEnviada',
      'Rechazo',
    ]);
  });

  it('offers ONLY Reactivar from RECHAZADO (T14 excluded, cooldown check is the use case\'s)', () => {
    expect(transicionesDisponibles({ flujo: 'INBOUND', etapa: 'RECHAZADO' })).toEqual([
      'Reactivar',
    ]);
  });

  it('offers NOTHING from the terminal ENTREGADA (T14 excluded, no other row fires)', () => {
    expect(transicionesDisponibles({ flujo: 'INBOUND', etapa: 'ENTREGADA' })).toEqual([]);
  });

  it('NEVER offers ConversiónProspectoACliente (T16 belongs to POST .../tipo — pr10 contract)', () => {
    for (const etapa of ['REGISTRADO', 'SEGUIMIENTO', 'NUEVO', 'CADENCIA', 'CONFIRMADA'] as Etapa[]) {
      const disponibles = transicionesDisponibles({ flujo: 'INBOUND', etapa });
      expect(disponibles).not.toContain('ConversiónProspectoACliente');
    }
  });
});

describe('formatearFecha', () => {
  it('formats a full ISO stamp as dd/mm/yyyy hh:mm', () => {
    expect(formatearFecha('2026-09-01T14:05:00.000Z')).toBe('01/09/2026 14:05');
  });

  it('formats a DATE-only string without a time part', () => {
    expect(formatearFecha('2026-12-25')).toBe('25/12/2026');
  });
});

describe('ETIQUETA_ACCION_ASIGNACION (spec G5 assignment history labels)', () => {
  it('covers the three assignment actions with Spanish labels', () => {
    const acciones: AccionAsignacion[] = ['ASIGNADO', 'REASIGNADO', 'DEVUELTO'];
    expect(acciones.map((a) => ETIQUETA_ACCION_ASIGNACION[a])).toEqual([
      'Asignado',
      'Reasignado',
      'Devuelto',
    ]);
  });
});

describe('ETIQUETA_EVENTO_RESULTADO (spec G6 productivity breakdown labels)', () => {
  it('labels every D4 result event in Spanish', () => {
    expect(ETIQUETA_EVENTO_RESULTADO).toEqual({
      CotizaciónEnviada: 'Cotización enviada',
      PresentaciónEnviada: 'Presentación enviada',
      AceptaciónOutbound: 'Aceptación outbound',
      ConfirmaciónPresentación: 'Confirmación de presentación',
      HandoffRegistrado: 'Handoff registrado',
      ConversiónProspectoACliente: 'Conversión a cliente',
    });
  });

  it('covers EXACTLY the runtime D4 catalog (no drift)', () => {
    expect(Object.keys(ETIQUETA_EVENTO_RESULTADO).sort()).toEqual([...EVENTOS_RESULTADO].sort());
  });
});
