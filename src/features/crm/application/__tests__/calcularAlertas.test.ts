import { describe, expect, it } from 'vitest';

import { calcularAlertas, HORAS_SIN_RESPONDER, resumenDeAlertas } from '../calcularAlertas';
import { HOY, NOW, empresa, makeFakeRepo, oportunidad } from './fakeRepo';

const hAtras = (horas: number): string => new Date(Date.parse(NOW) - horas * 3_600_000).toISOString();

const EMPRESAS = [
  empresa(), // e-1 · Constructora Andina S.A.C.
  empresa({ idEmpresa: 'e-2', razonSocial: 'Minera Cobre S.A.' }),
  empresa({ idEmpresa: 'e-3', razonSocial: 'Transporte Río S.A.C.' }),
];

/** Two days overdue on a stage where follow-ups alert. */
const VENCIDA = oportunidad({
  etapa: 'contactado',
  medio: 'llamada',
  proximaAccion: { tipo: 'cotizar', detalle: 'Enviar precios OBRA', fecha: '2026-10-29' },
});

/** Due today, same stage, another empresa. */
const HOY_MISMO = oportunidad({
  idOportunidad: 'o-2',
  idEmpresa: 'e-2',
  nombre: 'Monitoreo cardiacos',
  etapa: 'en_seguimiento',
  medio: 'whatsapp',
  proximaAccion: { tipo: 'llamar', detalle: null, fecha: HOY },
});

/** A cotizado deal is still open: its follow-up alerts. */
const COTIZADA = oportunidad({
  idOportunidad: 'o-4',
  idEmpresa: 'e-2',
  nombre: 'Cotización pendiente',
  etapa: 'cotizado',
  proximaAccion: { tipo: 'info', detalle: null, fecha: '2026-10-28' },
});

/** Inbound waiting 50 h on the first-contact stage. */
const SIN_RESPONDER = oportunidad({
  idOportunidad: 'o-3',
  idEmpresa: 'e-3',
  nombre: 'Exámenes de ingreso',
  etapa: 'por_contactar',
  faltaResponderDesde: hAtras(50),
});

describe('calcularAlertas — accion_vencida / accion_hoy (por oportunidad)', () => {
  it('alerts an overdue próxima acción on an open deal, naming both deal and empresa', () => {
    const repo = makeFakeRepo(EMPRESAS, [], [VENCIDA]);
    const alerta = calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW));
    expect(alerta).toHaveLength(1);
    expect(alerta[0]).toMatchObject({
      idOportunidad: 'o-1',
      nombreOportunidad: 'Exámenes ocupacionales 2026',
      idEmpresa: 'e-1',
      nombreEmpresa: 'Constructora Andina S.A.C.',
      clase: 'accion_vencida',
      etapa: 'contactado',
      tipoAccion: 'cotizar',
      detalle: 'Enviar precios OBRA',
      fecha: '2026-10-29',
      atraso: 2,
    });
  });

  it('alerts when the próxima acción is due today with atraso 0', () => {
    const repo = makeFakeRepo(EMPRESAS, [], [HOY_MISMO]);
    const alerta = calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW));
    expect(alerta).toHaveLength(1);
    expect(alerta[0]).toMatchObject({ idOportunidad: 'o-2', nombreEmpresa: 'Minera Cobre S.A.', clase: 'accion_hoy', atraso: 0 });
  });

  it('Cotizado is an open stage: its follow-up alerts too', () => {
    const repo = makeFakeRepo(EMPRESAS, [], [COTIZADA]);
    const alerta = calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW));
    expect(alerta.map((a) => a.clase)).toEqual(['accion_vencida']);
    expect(alerta[0]).toMatchObject({ etapa: 'cotizado', atraso: 3 });
  });

  it('ignores a future próxima acción', () => {
    const futura = oportunidad({ ...VENCIDA, proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-03' } });
    const repo = makeFakeRepo(EMPRESAS, [], [futura]);
    expect(calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW))).toHaveLength(0);
  });

  it('ignores closed deals and Por contactar, whatever their próxima acción', () => {
    for (const etapa of ['por_contactar', 'ganada', 'perdida'] as const) {
      const cerrada = oportunidad({ ...VENCIDA, etapa });
      const repo = makeFakeRepo(EMPRESAS, [], [cerrada]);
      expect(calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW))).toHaveLength(0);
    }
  });

  it('ignores a deal with no próxima acción', () => {
    const repo = makeFakeRepo(EMPRESAS, [], [oportunidad({ etapa: 'en_seguimiento' })]);
    expect(calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW))).toHaveLength(0);
  });
});

describe('calcularAlertas — sin_responder (por oportunidad)', () => {
  it(`alerts after ${HORAS_SIN_RESPONDER} h waiting, even on por_contactar, with whole hours`, () => {
    const repo = makeFakeRepo(EMPRESAS, [], [SIN_RESPONDER]);
    const alerta = calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW));
    expect(alerta).toHaveLength(1);
    expect(alerta[0]).toMatchObject({
      idOportunidad: 'o-3',
      nombreEmpresa: 'Transporte Río S.A.C.',
      clase: 'sin_responder',
      etapa: 'por_contactar',
      tipoAccion: null,
      detalle: null,
      fecha: hAtras(50),
      atraso: 50,
    });
  });

  it('stays silent just under the 48 h threshold', () => {
    const borde = oportunidad({ ...SIN_RESPONDER, faltaResponderDesde: hAtras(47) });
    const repo = makeFakeRepo(EMPRESAS, [], [borde]);
    expect(calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW))).toHaveLength(0);
  });

  it('never alerts a closed deal waiting for a reply', () => {
    for (const etapa of ['ganada', 'perdida'] as const) {
      const cerrada = oportunidad({ ...SIN_RESPONDER, etapa });
      const repo = makeFakeRepo(EMPRESAS, [], [cerrada]);
      expect(calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW))).toHaveLength(0);
    }
  });

  it('ignores a deal with no pending inbound reply', () => {
    const repo = makeFakeRepo(EMPRESAS, [], [oportunidad({ faltaResponderDesde: null })]);
    expect(calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW))).toHaveLength(0);
  });
});

describe('calcularAlertas — join con empresas, combinaciones y orden', () => {
  it('drops an alert whose empresa is missing from the list (it could not be linked)', () => {
    const huerfana = oportunidad({ idEmpresa: 'e-fantasma', etapa: 'contactado', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-10-29' } });
    expect(calcularAlertas([huerfana], EMPRESAS, HOY, new Date(NOW))).toHaveLength(0);
  });

  it('emits both alerts when one deal is overdue AND waiting for a reply', () => {
    const ambas = oportunidad({ ...VENCIDA, faltaResponderDesde: hAtras(50) });
    const repo = makeFakeRepo(EMPRESAS, [], [ambas]);
    const alerta = calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW));
    expect(alerta.map((a) => a.clase)).toEqual(['accion_vencida', 'sin_responder']);
  });

  it('orders vencidas oldest first, hoy by empresa name, sin_responder longest wait first', () => {
    const masEmpresas = [
      ...EMPRESAS,
      empresa({ idEmpresa: 'e-old', razonSocial: 'A Vieja S.A.C.' }),
      empresa({ idEmpresa: 'e-4', razonSocial: 'A Todavía Hoy S.A.' }),
      empresa({ idEmpresa: 'e-wait', razonSocial: 'Z Espera Larga S.A.C.' }),
    ];
    const vieja = oportunidad({ ...VENCIDA, idOportunidad: 'o-old', idEmpresa: 'e-old', nombre: 'Vieja', proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-10-25' } });
    const hoyOtra = oportunidad({ idOportunidad: 'o-5', idEmpresa: 'e-4', nombre: 'Hoy Todavía', etapa: 'contactado', medio: 'llamada', proximaAccion: { tipo: 'info', detalle: null, fecha: HOY } });
    const esperaLarga = oportunidad({ ...SIN_RESPONDER, idOportunidad: 'o-wait', idEmpresa: 'e-wait', faltaResponderDesde: hAtras(80) });
    const alerta = calcularAlertas([HOY_MISMO, hoyOtra, SIN_RESPONDER, esperaLarga, VENCIDA, vieja], masEmpresas, HOY, new Date(NOW));
    expect(alerta.map((a) => a.idOportunidad)).toEqual(['o-old', 'o-1', 'o-5', 'o-2', 'o-wait', 'o-3']);
  });

  it('returns [] for an empty board', () => {
    expect(calcularAlertas([], [], HOY, new Date(NOW))).toEqual([]);
  });
});

describe('resumenDeAlertas — counts by oportunidad', () => {
  it('counts each clase, one entry per deal in trouble', () => {
    const repo = makeFakeRepo(EMPRESAS, [], [VENCIDA, HOY_MISMO, SIN_RESPONDER]);
    const resumen = resumenDeAlertas(calcularAlertas(repo.oportunidades, repo.rows, HOY, new Date(NOW)));
    expect(resumen).toEqual({ vencidas: 1, hoy: 1, sinResponder: 1 });
  });

  it('is all zeros with no alerts', () => {
    expect(resumenDeAlertas([])).toEqual({ vencidas: 0, hoy: 0, sinResponder: 0 });
  });
});
