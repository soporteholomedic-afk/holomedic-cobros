import { describe, expect, it } from 'vitest';

import { calcularAlertas, HORAS_SIN_RESPONDER, resumenDeAlertas } from '../calcularAlertas';
import { HOY, NOW, empresa } from './fakeRepo';

const hAtras = (horas: number): string => new Date(Date.parse(NOW) - horas * 3_600_000).toISOString();

/** Two days overdue on a stage where follow-ups alert. */
const VENCIDA = empresa({
  etapa: 'contactado',
  medio: 'llamada',
  proximaAccion: { tipo: 'cotizar', detalle: 'Enviar precios OBRA', fecha: '2026-10-29' },
});

/** Due today, same stage. */
const HOY_MISMO = empresa({
  idEmpresa: 'e-2',
  razonSocial: 'Minera Cobre S.A.',
  etapa: 'en_seguimiento',
  medio: 'whatsapp',
  proximaAccion: { tipo: 'llamar', detalle: null, fecha: HOY },
});

/** Inbound waiting 50 h on the first-contact stage. */
const SIN_RESPONDER = empresa({
  idEmpresa: 'e-3',
  razonSocial: 'Transporte Río S.A.C.',
  etapa: 'por_contactar',
  faltaResponderDesde: hAtras(50),
});

describe('calcularAlertas — accion_vencida (S3)', () => {
  it('alerts a contactado empresa whose próxima acción is overdue, with whole days late', () => {
    const alertas = calcularAlertas([VENCIDA], HOY, new Date(NOW));
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      idEmpresa: 'e-1',
      razonSocial: 'Constructora Andina S.A.C.',
      clase: 'accion_vencida',
      etapa: 'contactado',
      tipoAccion: 'cotizar',
      detalle: 'Enviar precios OBRA',
      fecha: '2026-10-29',
      atraso: 2,
    });
  });

  it('alerts when the próxima acción is due today with atraso 0', () => {
    const alertas = calcularAlertas([HOY_MISMO], HOY, new Date(NOW));
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ idEmpresa: 'e-2', clase: 'accion_hoy', atraso: 0 });
  });

  it('ignores a future próxima acción', () => {
    const futura = empresa({ ...VENCIDA, proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } });
    expect(calcularAlertas([futura], HOY, new Date(NOW))).toHaveLength(0);
  });

  it('ignores stages outside the active pipeline (por_contactar, cliente, perdido)', () => {
    for (const etapa of ['por_contactar', 'cliente', 'perdido'] as const) {
      const e = empresa({ ...VENCIDA, etapa });
      expect(calcularAlertas([e], HOY, new Date(NOW))).toHaveLength(0);
    }
  });

  it('ignores an empresa with no próxima acción', () => {
    expect(calcularAlertas([empresa({ etapa: 'en_seguimiento' })], HOY, new Date(NOW))).toHaveLength(0);
  });
});

describe('calcularAlertas — sin_responder (S3)', () => {
  it(`alerts after ${HORAS_SIN_RESPONDER} h waiting, even on por_contactar, with whole hours`, () => {
    const alertas = calcularAlertas([SIN_RESPONDER], HOY, new Date(NOW));
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      idEmpresa: 'e-3',
      clase: 'sin_responder',
      etapa: 'por_contactar',
      tipoAccion: null,
      detalle: null,
      fecha: hAtras(50),
      atraso: 50,
    });
  });

  it('stays silent just under the 48 h threshold', () => {
    const borde = empresa({ ...SIN_RESPONDER, faltaResponderDesde: hAtras(47) });
    expect(calcularAlertas([borde], HOY, new Date(NOW))).toHaveLength(0);
  });

  it('never alerts a lost (perdido) empresa waiting for a reply', () => {
    const perdida = empresa({ ...SIN_RESPONDER, etapa: 'perdido', motivo: { categoria: 'sin_interes', detalle1: null, detalle2: null, notas: null } });
    expect(calcularAlertas([perdida], HOY, new Date(NOW))).toHaveLength(0);
  });

  it('ignores an empresa with no pending inbound reply', () => {
    expect(calcularAlertas([empresa({ faltaResponderDesde: null })], HOY, new Date(NOW))).toHaveLength(0);
  });
});

describe('calcularAlertas — combinaciones y orden (S3)', () => {
  it('emits both alerts when one empresa is overdue AND waiting for a reply', () => {
    const ambas = empresa({ ...VENCIDA, faltaResponderDesde: hAtras(50) });
    const alertas = calcularAlertas([ambas], HOY, new Date(NOW));
    expect(alertas.map((a) => a.clase)).toEqual(['accion_vencida', 'sin_responder']);
  });

  it('orders vencidas oldest first, hoy by name, sin_responder oldest waiting first', () => {
    const vieja = empresa({ ...VENCIDA, idEmpresa: 'e-old', razonSocial: 'A Vieja', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-10-25' } });
    const hoyOtra = empresa({ idEmpresa: 'e-4', razonSocial: 'A Todavía Hoy', etapa: 'contactado', medio: 'llamada', proximaAccion: { tipo: 'info', detalle: null, fecha: HOY } });
    const esperaLarga = empresa({ ...SIN_RESPONDER, idEmpresa: 'e-wait', faltaResponderDesde: hAtras(80) });
    const alertas = calcularAlertas([HOY_MISMO, hoyOtra, SIN_RESPONDER, esperaLarga, VENCIDA, vieja], HOY, new Date(NOW));
    expect(alertas.map((a) => a.idEmpresa)).toEqual(['e-old', 'e-1', 'e-4', 'e-2', 'e-wait', 'e-3']);
  });

  it('returns [] for an empty board', () => {
    expect(calcularAlertas([], HOY, new Date(NOW))).toEqual([]);
  });
});

describe('resumenDeAlertas (S3)', () => {
  it('counts each clase', () => {
    const resumen = resumenDeAlertas(calcularAlertas([VENCIDA, HOY_MISMO, SIN_RESPONDER], HOY, new Date(NOW)));
    expect(resumen).toEqual({ vencidas: 1, hoy: 1, sinResponder: 1 });
  });

  it('is all zeros with no alerts', () => {
    expect(resumenDeAlertas([])).toEqual({ vencidas: 0, hoy: 0, sinResponder: 0 });
  });
});
