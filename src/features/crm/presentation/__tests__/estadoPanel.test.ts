import { describe, expect, it } from 'vitest';

import {
  ACCIONES_POR_ESTADO,
  derivarEstadoPanel,
  enBucketEnEspera,
  enBucketSinInteres,
  fechaReactivacion,
  proximoPaso,
  type AccionFila,
  type EntradaEstadoPanel,
  type EstadoPanel,
} from '../estadoPanel';
import type { Etapa } from '../../domain/entities';

/**
 * Exhaustive derivation suite (tasks 6.1/6.2, design D1, spec SD-4):
 * the full independent cross-product flujo(2) × etapa(11) ×
 * enviosCiclo(0..4) × descansoHasta{null,past,future} ×
 * rechazadoHasta{null,past,future} × fechaCicloInicio{null,set} = 1,980
 * combos — a strict superset of the design's ≈660 estimate (the design
 * under-multiplied its own written axes). Every combo must yield
 * EXACTLY ONE status and exactly that status's action set.
 */

const HOY = '2026-09-15';
const PASADO = '2026-01-01';
const FUTURO = '2026-12-31';
const INICIO = '2026-06-01';

const FLUJOS = ['INBOUND', 'OUTBOUND'] as const;
const ETAPAS = [
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
] as const satisfies readonly Etapa[];
const ENVIOS = [0, 1, 2, 3, 4] as const;
const MARKERS = [null, PASADO, FUTURO] as const;
const INICIOS = [null, INICIO] as const;

function entrada(overrides: Partial<EntradaEstadoPanel> = {}): EntradaEstadoPanel {
  return {
    flujo: 'OUTBOUND',
    etapa: 'NUEVO',
    enviosCiclo: 0,
    ciclo: 1,
    fechaCicloInicio: null,
    descansoHasta: null,
    rechazadoHasta: null,
    hoy: HOY,
    ...overrides,
  };
}

// ---- Independent oracle: the D1 priority table, etapa-first ----

function estadoEsperado(e: EntradaEstadoPanel): EstadoPanel {
  if (e.flujo === null || e.etapa === null) return 'sin_carta';
  const enCurso = (n: number | null): EstadoPanel => {
    const envios = Math.max(n ?? 0, 1);
    if (envios >= 4) return 'seguimiento_3';
    if (envios === 3) return 'seguimiento_2';
    if (envios === 2) return 'seguimiento_1';
    return 'carta_enviada';
  };
  switch (e.etapa) {
    case 'ACEPTADO':
      return 'respondio_positivo';
    case 'RECHAZADO':
      return e.rechazadoHasta !== null && e.rechazadoHasta > e.hoy ? 'respondio_negativo' : 'en_pausa_3m';
    case 'DESCANSO':
      return 'en_pausa_3m';
    case 'PRESENTACION':
    case 'CONFIRMADA':
    case 'ENTREGADA':
    case 'DATOS':
      return 'avanzado';
    case 'NUEVO':
    case 'REGISTRADO':
      if ((e.enviosCiclo ?? 0) === 0) return e.fechaCicloInicio === null ? 'sin_carta' : 'reactivado';
      return enCurso(e.enviosCiclo);
    default:
      return enCurso(e.enviosCiclo);
  }
}

/** The design table's row-actions column, as test-owned literals. */
const ACCIONES_ESPERADAS: Record<EstadoPanel, AccionFila[]> = {
  sin_carta: ['enviar_carta', 'ver_ficha'],
  carta_enviada: ['sumar_semana', 'registrar_respuesta', 'ver_ficha'],
  seguimiento_1: ['sumar_semana', 'registrar_respuesta', 'ver_ficha'],
  seguimiento_2: ['sumar_semana', 'registrar_respuesta', 'ver_ficha'],
  seguimiento_3: ['registrar_respuesta', 'pausar_3m', 'ver_ficha'],
  respondio_positivo: ['ver_ficha'],
  en_pausa_3m: ['reactivar', 'ver_ficha'],
  reactivado: ['registrar_respuesta', 'ver_ficha'],
  respondio_negativo: ['ver_ficha'],
  avanzado: ['ver_ficha'],
};

describe('derivarEstadoPanel — exhaustive cross-product', () => {
  it.each(
    FLUJOS.flatMap((flujo) =>
      ETAPAS.flatMap((etapa) =>
        ENVIOS.flatMap((enviosCiclo) =>
          MARKERS.flatMap((descansoHasta) =>
            MARKERS.flatMap((rechazadoHasta) =>
              INICIOS.map((fechaCicloInicio) => ({
                flujo,
                etapa,
                enviosCiclo,
                descansoHasta,
                rechazadoHasta,
                fechaCicloInicio,
              })),
            ),
          ),
        ),
      ),
    ),
  )('$flujo/$etapa envios=$enviosCiclo descanso=$descansoHasta rechazo=$rechazadoHasta inicio=$fechaCicloInicio', (c) => {
    const e = entrada(c);
    const resultado = derivarEstadoPanel(e);
    expect(resultado).toBe(estadoEsperado(e));
    expect([...ACCIONES_POR_ESTADO[resultado]]).toEqual(ACCIONES_ESPERADAS[resultado]);
  });
});

describe('derivarEstadoPanel — semantic anchors (spec crm-status-derivation)', () => {
  it('maps every combination to a VALID status and every status to a NON-EMPTY action set', () => {
    expect(FLUJOS.length * ETAPAS.length * ENVIOS.length * MARKERS.length * MARKERS.length * INICIOS.length).toBe(1980);
    for (const estado of Object.keys(ACCIONES_POR_ESTADO) as EstadoPanel[]) {
      expect(ACCIONES_POR_ESTADO[estado].length).toBeGreaterThan(0);
      expect(ACCIONES_POR_ESTADO[estado]).toContain('ver_ficha');
    }
  });

  it('is pure: the same input derives the same status twice and is never mutated', () => {
    const e = Object.freeze(entrada({ etapa: 'CADENCIA', enviosCiclo: 2, fechaCicloInicio: INICIO }));
    expect(derivarEstadoPanel(e)).toBe('seguimiento_1');
    expect(derivarEstadoPanel(e)).toBe('seguimiento_1');
  });

  it('derives a pipeline-less empresa as sin_carta with the Enviar carta action', () => {
    const e = entrada({ flujo: null, etapa: null, enviosCiclo: null, ciclo: null, fechaCicloInicio: null });
    expect(derivarEstadoPanel(e)).toBe('sin_carta');
    expect([...ACCIONES_POR_ESTADO.sin_carta]).toEqual(['enviar_carta', 'ver_ficha']);
  });

  it('cadencia with enviosCiclo=3 derives seguimiento_2 with the +1 Sem actions', () => {
    const e = entrada({ etapa: 'CADENCIA', enviosCiclo: 3, fechaCicloInicio: INICIO });
    expect(derivarEstadoPanel(e)).toBe('seguimiento_2');
    expect([...ACCIONES_POR_ESTADO.seguimiento_2]).toEqual(['sumar_semana', 'registrar_respuesta', 'ver_ficha']);
  });

  it('a completed 4-send cycle (T8 → DESCANSO) derives en_pausa_3m with Reactivar ya', () => {
    const e = entrada({ etapa: 'DESCANSO', enviosCiclo: 4, descansoHasta: FUTURO });
    expect(derivarEstadoPanel(e)).toBe('en_pausa_3m');
    expect([...ACCIONES_POR_ESTADO.en_pausa_3m]).toEqual(['reactivar', 'ver_ficha']);
  });

  it('RECHAZADO with a FUTURE cooldown derives respondio_negativo; expired derives en_pausa_3m', () => {
    expect(derivarEstadoPanel(entrada({ etapa: 'RECHAZADO', rechazadoHasta: FUTURO }))).toBe('respondio_negativo');
    expect(derivarEstadoPanel(entrada({ etapa: 'RECHAZADO', rechazadoHasta: PASADO }))).toBe('en_pausa_3m');
    expect(derivarEstadoPanel(entrada({ etapa: 'RECHAZADO', rechazadoHasta: null }))).toBe('en_pausa_3m');
  });

  it('fechaCicloInicio is THE reactivated discriminator on unarmed NUEVO/REGISTRADO rows', () => {
    expect(derivarEstadoPanel(entrada({ etapa: 'NUEVO', enviosCiclo: 0, fechaCicloInicio: null }))).toBe('sin_carta');
    expect(derivarEstadoPanel(entrada({ etapa: 'NUEVO', enviosCiclo: 0, fechaCicloInicio: INICIO }))).toBe('reactivado');
    expect(derivarEstadoPanel(entrada({ etapa: 'REGISTRADO', enviosCiclo: 0, fechaCicloInicio: INICIO }))).toBe('reactivado');
    expect([...ACCIONES_POR_ESTADO.reactivado]).toEqual(['registrar_respuesta', 'ver_ficha']);
  });
});

describe('fechaReactivacion — "Se reactiva:" date (rows 3/4 only, dd/mm/yyyy)', () => {
  it.each([
    ['DESCANSO with descansoHasta', entrada({ etapa: 'DESCANSO', descansoHasta: FUTURO }), '31/12/2026'],
    ['RECHAZADO expired (row 3)', entrada({ etapa: 'RECHAZADO', rechazadoHasta: PASADO }), '01/01/2026'],
  ])('%s → its marker formatted', (_n, e, esperado) => {
    expect(fechaReactivacion(e)).toBe(esperado);
  });

  it.each([
    ['respondio_negativo (cooldown still running)', entrada({ etapa: 'RECHAZADO', rechazadoHasta: FUTURO })],
    ['sin pipeline', entrada({ flujo: null, etapa: null, enviosCiclo: null, ciclo: null })],
  ])('%s → null', (_n, e) => {
    expect(fechaReactivacion(e)).toBeNull();
  });
});

describe('proximoPaso — mock-verbatim labels (design D1 / spec OP-4)', () => {
  it.each([
    ['sin_carta', { flujo: null, etapa: null, enviosCiclo: null, ciclo: null }, 'Enviar carta hoy', null],
    ['carta_enviada', { etapa: 'CADENCIA', enviosCiclo: 1, fechaCicloInicio: INICIO }, 'Toca Semana 1', 'Si no responde en 7 días'],
    ['seguimiento_1', { etapa: 'CADENCIA', enviosCiclo: 2, fechaCicloInicio: INICIO }, 'Toca Semana 2', 'Si no responde en 7 días'],
    ['seguimiento_2', { etapa: 'CADENCIA', enviosCiclo: 3, fechaCicloInicio: INICIO }, 'Toca Semana 3 (Fin)', 'Si no responde en 7 días'],
    ['seguimiento_3', { etapa: 'CADENCIA', enviosCiclo: 4, fechaCicloInicio: INICIO }, 'Cumplió 3 semanas (Pausa)', 'Si no responde en 7 días'],
    ['respondio_positivo', { etapa: 'ACEPTADO' }, 'Llamar o Cotizar', 'Cliente esperando'],
    [
      'en_pausa_3m',
      { etapa: 'DESCANSO', descansoHasta: FUTURO },
      'Se reactiva:',
      '31/12/2026',
    ],
    ['reactivado', { etapa: 'NUEVO', enviosCiclo: 0, fechaCicloInicio: INICIO }, 'Toca volver a contactar', 'Pasaron los 3 meses'],
    ['respondio_negativo', { etapa: 'RECHAZADO', rechazadoHasta: FUTURO }, null, null],
    ['avanzado', { etapa: 'CONFIRMADA' }, 'Llamar o Cotizar', 'Cliente esperando'],
  ] as const)('%s → %j', (estado, overrides, principal, secundario) => {
    expect(proximoPaso(entrada(overrides))).toEqual({ principal, secundario });
    expect(derivarEstadoPanel(entrada(overrides))).toBe(estado);
  });

  it('en_pausa_3m without any marker falls back to the mock\'s "En 3 meses"', () => {
    expect(proximoPaso(entrada({ etapa: 'DESCANSO', descansoHasta: null }))).toEqual({
      principal: 'Se reactiva:',
      secundario: 'En 3 meses',
    });
  });
});

describe('bucket helpers — En espera / Sin interés (design D1, spec OP-3)', () => {
  const EN_ESPERA: EstadoPanel[] = ['avanzado', 'carta_enviada', 'seguimiento_1', 'seguimiento_2', 'seguimiento_3'];
  const SIN_INTERES: EstadoPanel[] = ['respondio_negativo', 'en_pausa_3m'];
  const UNO_A_UNO: EstadoPanel[] = ['respondio_positivo', 'reactivado', 'sin_carta'];

  it.each([
    ...EN_ESPERA.map((e) => [e, true] as const),
    ...SIN_INTERES.map((e) => [e, false] as const),
    ...UNO_A_UNO.map((e) => [e, false] as const),
  ])('enBucketEnEspera(%s) → %j', (estado, esperado) => {
    expect(enBucketEnEspera(estado)).toBe(esperado);
  });

  it.each([
    ...SIN_INTERES.map((e) => [e, true] as const),
    ...[...EN_ESPERA, ...UNO_A_UNO].map((e) => [e, false] as const),
  ])('enBucketSinInteres(%s) → %j', (estado, esperado) => {
    expect(enBucketSinInteres(estado)).toBe(esperado);
  });

  it('every status lands in at least one tab (no invisible states)', () => {
    const estados = Object.keys(ACCIONES_POR_ESTADO) as EstadoPanel[];
    for (const estado of estados) {
      const visible = estado === 'respondio_positivo' || estado === 'reactivado' || estado === 'sin_carta'
        || enBucketEnEspera(estado) || enBucketSinInteres(estado);
      expect(visible).toBe(true);
    }
  });
});
