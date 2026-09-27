import { describe, expect, it } from 'vitest';

import type { FilaPanelCrm } from '../../domain/ports';
import { derivarPanel, ETIQUETA_TIPO, filtrarFilas, TABS_PANEL } from '../panelDerivado';

/**
 * Pure client-side derivation contract (tasks 8.1, design D4, spec
 * OP-1..OP-3): ONE GET /api/crm/panel payload {hoy, filas} → derived
 * rows (estado + acciones + próximo paso) + KPI/tab counts. The KPI
 * counts and the tab counts share the SAME predicates, so each KPI
 * equals its tab count by construction (OP-2) — pinned here by
 * comparing conteos against filtrarFilas for every tab. Search matches
 * nombre/contacto/RUC/sector client-side (OP-3); "Sin interés" includes
 * en_pausa_3m rows (mock union).
 */

const HOY = '2026-09-15';

function fila(overrides: Partial<FilaPanelCrm> = {}): FilaPanelCrm {
  return {
    empresaId: 1,
    razonSocial: 'Constructora X',
    ruc: '20489561234',
    tipo: 'Prospecto',
    responsable: null,
    sector: 'Construcción',
    cantidadTrabajadores: 45,
    createdAt: '2026-09-01T00:00:00.000Z',
    flujo: 'OUTBOUND',
    etapa: 'CADENCIA',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-09-08',
    fechaUltimoEnvio: '2026-09-08',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    contactoNombre: 'Carlos Mendoza',
    contactoCargo: 'Recursos Humanos / Seguridad',
    contactoCorreo: 'carlos@constructora.com',
    ...overrides,
  };
}

function sinPipeline(overrides: Partial<FilaPanelCrm> = {}): Partial<FilaPanelCrm> {
  return {
    flujo: null,
    etapa: null,
    ciclo: null,
    enviosCiclo: null,
    fechaCicloInicio: null,
    fechaUltimoEnvio: null,
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    ...overrides,
  };
}

describe('derivarPanel — estado, acciones y próximo paso por fila', () => {
  it.each([
    {
      nombre: 'sin pipeline → sin_carta',
      fila: fila(sinPipeline({ empresaId: 10, razonSocial: 'Recién Anotada' })),
      estado: 'sin_carta',
      acciones: ['enviar_carta', 'ver_ficha'],
      proximo: 'Enviar carta hoy',
    },
    {
      nombre: 'carta enviada (CADENCIA envios 1)',
      fila: fila({ empresaId: 11 }),
      estado: 'carta_enviada',
      acciones: ['sumar_semana', 'registrar_respuesta', 'ver_ficha'],
      proximo: 'Toca Semana 1',
    },
    {
      nombre: 'seguimiento 3 (envios 3)',
      fila: fila({ empresaId: 12, enviosCiclo: 3 }),
      estado: 'seguimiento_2',
      acciones: ['sumar_semana', 'registrar_respuesta', 'ver_ficha'],
      proximo: 'Toca Semana 3 (Fin)',
    },
    {
      nombre: 'pausa 3m con fecha (DESCANSO)',
      fila: fila({ empresaId: 13, etapa: 'DESCANSO', enviosCiclo: 4, descansoHasta: '2026-12-31' }),
      estado: 'en_pausa_3m',
      acciones: ['reactivar', 'ver_ficha'],
      proximo: 'Se reactiva:',
      fechaReactivacion: '31/12/2026',
    },
    {
      nombre: 'respondió negativo (RECHAZADO en cooldown)',
      fila: fila({ empresaId: 14, etapa: 'RECHAZADO', rechazadoHasta: '2026-12-01', motivoRechazo: 'Sin presupuesto' }),
      estado: 'respondio_negativo',
      acciones: ['ver_ficha'],
      proximo: null,
    },
    {
      nombre: 'reactivado (NUEVO con fechaCicloInicio)',
      fila: fila({ empresaId: 15, etapa: 'NUEVO', enviosCiclo: 0, fechaCicloInicio: '2026-09-10' }),
      estado: 'reactivado',
      acciones: ['registrar_respuesta', 'ver_ficha'],
      proximo: 'Toca volver a contactar',
    },
    {
      nombre: 'avanzado con etiqueta de etapa (INBOUND CONFIRMADA)',
      fila: fila({ empresaId: 16, flujo: 'INBOUND', etapa: 'CONFIRMADA' }),
      estado: 'avanzado',
      acciones: ['ver_ficha'],
      proximo: 'Llamar o Cotizar',
      etiquetaEtapa: 'Confirmada',
    },
    {
      nombre: 'respondió positivo (ACEPTADO)',
      fila: fila({ empresaId: 17, etapa: 'ACEPTADO' }),
      estado: 'respondio_positivo',
      acciones: ['ver_ficha'],
      proximo: 'Llamar o Cotizar',
    },
  ])('$nombre', ({ fila: laFila, estado, acciones, proximo, fechaReactivacion, etiquetaEtapa }) => {
    const panel = derivarPanel({ hoy: HOY, filas: [laFila] });
    const derivada = panel.filas[0];
    expect(derivada.estado).toBe(estado);
    expect(derivada.acciones).toEqual(acciones);
    expect(derivada.proximo.principal).toBe(proximo);
    expect(derivada.fechaReactivacion ?? undefined).toBe(fechaReactivacion);
    expect(derivada.etiquetaEtapaAvanzada ?? undefined).toBe(etiquetaEtapa);
    // The original payload row rides along untouched (render reads it).
    expect(derivada.fila).toBe(laFila);
  });
});

describe('derivarPanel — conteos KPI (OP-2)', () => {
  const filas = [
    fila(sinPipeline({ empresaId: 1, tipo: 'Cliente' })), // falta carta
    fila(sinPipeline({ empresaId: 2, tipo: 'Cliente' })), // falta carta
    fila({ empresaId: 3 }), // carta enviada → en espera
    fila({ empresaId: 4, enviosCiclo: 2 }), // seguimiento 1 → en espera
    fila({ empresaId: 5, etapa: 'ACEPTADO' }), // positivo
    fila({ empresaId: 6, etapa: 'DESCANSO', enviosCiclo: 4, descansoHasta: '2026-12-31' }), // pausa
    fila({ empresaId: 7, etapa: 'DESCANSO', enviosCiclo: 4, descansoHasta: '2026-12-31' }), // pausa
    fila({ empresaId: 8, etapa: 'RECHAZADO', rechazadoHasta: '2026-12-01' }), // negativo
    fila({ empresaId: 9, etapa: 'NUEVO', enviosCiclo: 0, fechaCicloInicio: '2026-09-10' }), // reactivado
    fila({ empresaId: 10, flujo: 'INBOUND', etapa: 'PRESENTACION' }), // avanzado → en espera
  ];

  it('counts each KPI per its mock definition', () => {
    const panel = derivarPanel({ hoy: HOY, filas });
    expect(panel.conteos).toEqual({
      todas: 10,
      enEspera: 3, // carta_enviada (3) + seguimiento_1 (4) + avanzado (10)
      positivos: 1,
      pausa3m: 2,
      reactivados: 1,
      sinInteres: 3, // negativo (1) ∪ pausa (2) — mock union
      faltaCarta: 2,
      clientes: 2,
      posibles: 8,
    });
  });

  it('every KPI equals its tab count — ONE derivation source (OP-2)', () => {
    const panel = derivarPanel({ hoy: HOY, filas });
    expect(TABS_PANEL).toHaveLength(7);
    const CONTEO_POR_TAB = {
      todas: 'todas',
      en_espera: 'enEspera',
      positivos: 'positivos',
      pausa_3m: 'pausa3m',
      reactivados: 'reactivados',
      sin_interes: 'sinInteres',
      falta_carta: 'faltaCarta',
    } as const;
    for (const { clave } of TABS_PANEL) {
      expect(filtrarFilas(panel.filas, clave, '')).toHaveLength(panel.conteos[CONTEO_POR_TAB[clave]]);
    }
  });

  it('splits "N clientes / M posibles" by tipo (spec scenario)', () => {
    const panel = derivarPanel({
      hoy: HOY,
      filas: [fila({ empresaId: 1, tipo: 'Cliente' }), fila({ empresaId: 2, tipo: 'Cliente' }), fila({ empresaId: 3 })],
    });
    expect(panel.conteos.todas).toBe(3);
    expect(panel.conteos.clientes).toBe(2);
    expect(panel.conteos.posibles).toBe(1);
  });

  it('is pure — frozen payload, identical result on a second run', () => {
    const payload = Object.freeze({ hoy: HOY, filas: Object.freeze([fila()]) });
    const primera = derivarPanel(payload);
    const segunda = derivarPanel(payload);
    expect(segunda).toEqual(primera);
    expect(segunda.filas[0].estado).toBe('carta_enviada');
  });
});

describe('filtrarFilas — tabs + búsqueda (OP-3)', () => {
  const panel = derivarPanel({
    hoy: HOY,
    filas: [
      fila({ empresaId: 1, razonSocial: 'Constructora Los Andes', ruc: '20512345678', etapa: 'DESCANSO', enviosCiclo: 4, descansoHasta: '2026-12-31' }),
      fila({ empresaId: 2, razonSocial: 'Minera Sur', etapa: 'DESCANSO', enviosCiclo: 4, descansoHasta: '2026-11-30' }),
      fila({ empresaId: 3, razonSocial: 'Textiles del Norte', etapa: 'RECHAZADO', rechazadoHasta: '2026-12-01', sector: 'Fábrica y Producción' }),
      fila(sinPipeline({ empresaId: 4, razonSocial: 'Recién Mía', contactoNombre: 'María González' })),
      fila({ empresaId: 5, razonSocial: 'Pesquera Pacífico', sector: 'Transporte y Almacén' }),
    ],
  });

  it('"Sin interés" includes en_pausa_3m rows (mock union — spec scenario)', () => {
    const filas = filtrarFilas(panel.filas, 'sin_interes', '');
    expect(filas.map((f) => f.fila.empresaId).sort()).toEqual([1, 2, 3]);
  });

  it('filters by every tab', () => {
    expect(filtrarFilas(panel.filas, 'todas', '')).toHaveLength(5);
    expect(filtrarFilas(panel.filas, 'pausa_3m', '').map((f) => f.fila.empresaId).sort()).toEqual([1, 2]);
    expect(filtrarFilas(panel.filas, 'falta_carta', '').map((f) => f.fila.empresaId)).toEqual([4]);
    expect(filtrarFilas(panel.filas, 'en_espera', '').map((f) => f.fila.empresaId)).toEqual([5]);
  });

  it('search matches empresa name, contacto, RUC and sector, case-insensitive', () => {
    expect(filtrarFilas(panel.filas, 'todas', 'andes').map((f) => f.fila.empresaId)).toEqual([1]);
    expect(filtrarFilas(panel.filas, 'todas', 'maría gonzález').map((f) => f.fila.empresaId)).toEqual([4]);
    expect(filtrarFilas(panel.filas, 'todas', '20489561234').map((f) => f.fila.empresaId)).not.toContain(1);
    expect(filtrarFilas(panel.filas, 'todas', '20512345678').map((f) => f.fila.empresaId)).toEqual([1]);
    expect(filtrarFilas(panel.filas, 'todas', 'transporte').map((f) => f.fila.empresaId)).toEqual([5]);
  });

  it('tab + search compose; a match outside the tab does not leak', () => {
    // "María González" matches row 4 (falta carta) — under Sin interés → empty.
    expect(filtrarFilas(panel.filas, 'sin_interes', 'maría')).toEqual([]);
  });
});

describe('ETIQUETA_TIPO — display-only vocabulary (OP-4)', () => {
  it('maps domain tipos to the mock labels', () => {
    expect(ETIQUETA_TIPO.Cliente).toBe('Cliente Nuevo');
    expect(ETIQUETA_TIPO.Prospecto).toBe('Posible Cliente');
  });
});
