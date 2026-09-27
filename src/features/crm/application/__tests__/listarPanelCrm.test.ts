import { describe, expect, it, vi } from 'vitest';

import { ListarPanelCrmUseCase } from '../listarPanelCrm';
import type { CrmPanelRepositoryPort, FilaPanelCrm } from '../../domain/ports';

/**
 * ListarPanelCrmUseCase (rediseno-crm-panel task 7.2, design D4) — the
 * panel read model: ONE repository fetch passed through verbatim plus
 * the injected business date. Derivation, KPIs, tab counts and search
 * are CLIENT-SIDE concerns (estadoPanel.ts + the panel components) —
 * the use case deliberately adds no classification of its own.
 */

const filaConPipeline: FilaPanelCrm = {
  empresaId: 10,
  razonSocial: 'Constructora Andes SA',
  ruc: '1792345678001',
  tipo: 'Prospecto',
  responsable: 'jperez',
  sector: 'Construcción',
  cantidadTrabajadores: 45,
  createdAt: '2026-05-01T00:00:00.000Z',
  flujo: 'OUTBOUND',
  etapa: 'CADENCIA',
  ciclo: 1,
  enviosCiclo: 2,
  fechaCicloInicio: '2026-05-18',
  fechaUltimoEnvio: '2026-05-25',
  descansoHasta: null,
  rechazadoHasta: null,
  motivoRechazo: null,
  contactoNombre: 'Ana Ruiz',
  contactoCargo: 'Recursos Humanos / Seguridad',
  contactoCorreo: 'ana@andes.com',
};

const filaSinPipeline: FilaPanelCrm = {
  empresaId: 20,
  razonSocial: 'Minera Sur SA',
  ruc: '1891234567001',
  tipo: 'Cliente',
  responsable: null,
  sector: null,
  cantidadTrabajadores: null,
  createdAt: '2026-05-20T00:00:00.000Z',
  flujo: null,
  etapa: null,
  ciclo: null,
  enviosCiclo: null,
  fechaCicloInicio: null,
  fechaUltimoEnvio: null,
  descansoHasta: null,
  rechazadoHasta: null,
  motivoRechazo: null,
  contactoNombre: null,
  contactoCargo: null,
  contactoCorreo: null,
};

function makePanel(overrides: Partial<CrmPanelRepositoryPort> = {}): CrmPanelRepositoryPort {
  return {
    listarEmpresasPanel: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('ListarPanelCrmUseCase', () => {
  it('returns the repository rows VERBATIM (order preserved — no sorting, no classification)', async () => {
    const filas = [filaConPipeline, filaSinPipeline];
    const listarEmpresasPanel = vi.fn().mockResolvedValue(filas);

    const panel = await new ListarPanelCrmUseCase(makePanel({ listarEmpresasPanel }), () =>
      new Date('2026-06-01T12:00:00'),
    ).execute();

    expect(panel).toEqual({ hoy: '2026-06-01', filas });
    expect(panel.filas[0]?.empresaId).toBe(10);
    expect(panel.filas[1]?.empresaId).toBe(20);
    expect(listarEmpresasPanel).toHaveBeenCalledTimes(1);
    expect(listarEmpresasPanel).toHaveBeenCalledWith();
  });

  it('returns an empty filas list when there are no empresas yet (fresh install)', async () => {
    const panel = await new ListarPanelCrmUseCase(makePanel(), () => new Date('2026-06-01T12:00:00')).execute();

    expect(panel).toEqual({ hoy: '2026-06-01', filas: [] });
  });
});
