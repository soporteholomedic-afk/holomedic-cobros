import { describe, expect, it } from 'vitest';

import { EVENTOS_RESULTADO } from '../../domain/maquinaEstados';
import type { TipoResultado } from '../../domain/maquinaEstados';
import {
  agregarProductividad,
  type ConteoActividadUsuario,
  type ConteoResultadoUsuario,
} from '../listarProductividad';

/**
 * Productivity aggregation core (tasks pr16/WU1, spec G6
 * "Productivity = activities + results"). The aggregator is PURE: the
 * SQL adapters count rows per user in the period; these tests pin how
 * the two count streams merge into per-user summary rows.
 *
 * Spec scenarios pinned here:
 * - Period aggregation: "a user logged 10 activities and 3 result
 *   events in September → both counts appear for that user".
 * - Result attributed to the ACTING user: each CRM_Resultados row
 *   carries the usuario who performed the action; the breakdown never
 *   crosses users (the write-side attribution is proven by pr10's
 *   real-DB suite — T-rows and T16 both insert usuario = acting
 *   session user; this suite proves the READ side groups by it).
 * - Conversion (T16): a ConversiónProspectoACliente count lands under
 *   the user who executed the conversion.
 * - D4 catalog exactness: 6 events, `AvanceDeEtapa` deliberately
 *   absent (stage changes live in CRM_Transiciones — double-counting
 *   is forbidden by design D4).
 */

const TODOS_LOS_EVENTOS = [
  'CotizaciónEnviada',
  'PresentaciónEnviada',
  'AceptaciónOutbound',
  'ConfirmaciónPresentación',
  'HandoffRegistrado',
  'ConversiónProspectoACliente',
] as const satisfies readonly TipoResultado[];

function conteoActividades(usuario: string, total: number): ConteoActividadUsuario {
  return { usuario, total };
}

function conteoResultado(usuario: string, tipo: TipoResultado, total: number): ConteoResultadoUsuario {
  return { usuario, tipo, total };
}

describe('EVENTOS_RESULTADO — the D4 result-event catalog', () => {
  it('contains EXACTLY the 6 D4 events in catalog order', () => {
    expect([...EVENTOS_RESULTADO]).toEqual([...TODOS_LOS_EVENTOS]);
  });

  it('rejects AvanceDeEtapa — design D4 dropped it (stage changes live in CRM_Transiciones)', () => {
    expect(EVENTOS_RESULTADO).not.toContain('AvanceDeEtapa');
  });
});

describe('agregarProductividad — per-user merge of activities + results', () => {
  it('shows BOTH counts for the spec scenario: 10 activities + 3 results in the period', () => {
    const actividades = [conteoActividades('jperez', 10)];
    const resultados = [
      conteoResultado('jperez', 'CotizaciónEnviada', 1),
      conteoResultado('jperez', 'PresentaciónEnviada', 1),
      conteoResultado('jperez', 'ConversiónProspectoACliente', 1),
    ];

    const filas = agregarProductividad(actividades, resultados);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ usuario: 'jperez', actividades: 10, resultados: 3 });
  });

  it('breaks results down by event type with zeros for absent events', () => {
    const resultados = [
      conteoResultado('jperez', 'CotizaciónEnviada', 2),
      conteoResultado('jperez', 'ConversiónProspectoACliente', 1),
    ];

    const [fila] = agregarProductividad([conteoActividades('jperez', 5)], resultados);

    expect(fila?.porEvento).toEqual({
      CotizaciónEnviada: 2,
      PresentaciónEnviada: 0,
      AceptaciónOutbound: 0,
      ConfirmaciónPresentación: 0,
      HandoffRegistrado: 0,
      ConversiónProspectoACliente: 1,
    });
  });

  it('attributes each result to ITS acting user — users never cross', () => {
    const resultados = [
      conteoResultado('jperez', 'PresentaciónEnviada', 2),
      conteoResultado('mgarcia', 'ConfirmaciónPresentación', 1),
    ];

    const filas = agregarProductividad(
      [conteoActividades('jperez', 4), conteoActividades('mgarcia', 7)],
      resultados,
    );

    const jperez = filas.find((f) => f.usuario === 'jperez');
    const mgarcia = filas.find((f) => f.usuario === 'mgarcia');
    expect(jperez).toMatchObject({ actividades: 4, resultados: 2 });
    expect(mgarcia).toMatchObject({ actividades: 7, resultados: 1 });
    expect(jperez?.porEvento.ConfirmaciónPresentación).toBe(0);
    expect(mgarcia?.porEvento.PresentaciónEnviada).toBe(0);
  });

  it('lands the T16 conversion under the user who executed it (spec G6 conversion scenario)', () => {
    const resultados = [conteoResultado('jperez', 'ConversiónProspectoACliente', 1)];

    const [fila] = agregarProductividad([], resultados);

    expect(fila?.usuario).toBe('jperez');
    expect(fila?.resultados).toBe(1);
    expect(fila?.porEvento.ConversiónProspectoACliente).toBe(1);
  });

  it('includes a user with activities but no results (zero-filled breakdown)', () => {
    const filas = agregarProductividad([conteoActividades('jperez', 3)], []);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ usuario: 'jperez', actividades: 3, resultados: 0 });
    expect(Object.values(filas[0]?.porEvento ?? {}).every((n) => n === 0)).toBe(true);
  });

  it('includes a user with results but no activities in the period', () => {
    const filas = agregarProductividad([], [conteoResultado('mgarcia', 'HandoffRegistrado', 1)]);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ usuario: 'mgarcia', actividades: 0, resultados: 1 });
  });

  it('sorts rows by usuario ascending (deterministic for UI and the pr17 export)', () => {
    const filas = agregarProductividad(
      [conteoActividades('soporte', 1), conteoActividades('jperez', 1), conteoActividades('admin', 1)],
      [],
    );

    expect(filas.map((f) => f.usuario)).toEqual(['admin', 'jperez', 'soporte']);
  });

  it('returns an empty list when the period has no activity and no results at all', () => {
    expect(agregarProductividad([], [])).toEqual([]);
  });
});
