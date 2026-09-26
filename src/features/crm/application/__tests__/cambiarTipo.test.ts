import { describe, expect, it, vi } from 'vitest';

import type { Empresa } from '../../domain/entities';
import { NotFoundError, ValidationError } from '../../domain/errors';
import type { Clock, CrmPipelineRepositoryPort } from '../../domain/ports';
import { CambiarTipoUseCase } from '../cambiarTipo';

/**
 * T16 (design D3/D4) — the tipo change is NOT a pipeline transition:
 * it updates CRM_Empresas.tipo and emits the ConversiónProspectoACliente
 * result ONLY on the Prospecto→Cliente direction (spec G6 scenario).
 * The adapter writes tipo + optional result row in ONE transaction;
 * this use case owns the direction decision and the no-op guard.
 */

const reloj: Clock = () => new Date(2026, 5, 1, 9, 0, 0); // hoy = 2026-06-01

function empresaCon(tipo: Empresa['tipo']): Empresa {
  return {
    id: 42,
    ruc: '900123456',
    rucNormalizado: '900123456',
    razonSocial: 'Constructora X',
    tipo,
    origen: null,
    proyectoObra: null,
    destinoComun: null,
    notas: null,
    responsable: null,
    contactos: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function makeFakePipeline(): CrmPipelineRepositoryPort & { cambiarTipo: ReturnType<typeof vi.fn> } {
  const obtenerPorEmpresaId = vi.fn().mockResolvedValue(null);
  const registrarTransicion = vi.fn();
  const cambiarTipo = vi.fn().mockResolvedValue(undefined);
  return { obtenerPorEmpresaId, registrarTransicion, cambiarTipo } as never;
}

describe('CambiarTipoUseCase — T16 (spec G6)', () => {
  it('Prospecto→Cliente sets convertir: true (conversion event rides the transaction)', async () => {
    const pipelines = makeFakePipeline();
    const empresas = { obtenerPorId: vi.fn().mockResolvedValue(empresaCon('Prospecto')) };

    const resultado = await new CambiarTipoUseCase(empresas as never, pipelines, reloj).execute({
      empresaId: 42,
      nuevoTipo: 'Cliente',
      usuario: 'mgarcia',
    });

    expect(resultado).toEqual({ tipo: 'Cliente', conversion: true });
    expect(pipelines.cambiarTipo).toHaveBeenCalledWith({
      empresaId: 42,
      nuevoTipo: 'Cliente',
      usuario: 'mgarcia',
      hoy: '2026-06-01',
      convertir: true,
    });
  });

  it('Cliente→Prospecto sets convertir: false (no result event exists for a demotion)', async () => {
    const pipelines = makeFakePipeline();
    const empresas = { obtenerPorId: vi.fn().mockResolvedValue(empresaCon('Cliente')) };

    const resultado = await new CambiarTipoUseCase(empresas as never, pipelines, reloj).execute({
      empresaId: 42,
      nuevoTipo: 'Prospecto',
      usuario: 'mgarcia',
    });

    expect(resultado).toEqual({ tipo: 'Prospecto', conversion: false });
    expect(pipelines.cambiarTipo).toHaveBeenCalledWith(
      expect.objectContaining({ nuevoTipo: 'Prospecto', convertir: false }),
    );
  });

  it('rejects a no-op change with a Spanish validation error and never touches the port', async () => {
    const pipelines = makeFakePipeline();
    const empresas = { obtenerPorId: vi.fn().mockResolvedValue(empresaCon('Cliente')) };

    await expect(
      new CambiarTipoUseCase(empresas as never, pipelines, reloj).execute({
        empresaId: 42,
        nuevoTipo: 'Cliente',
        usuario: 'mgarcia',
      }),
    ).rejects.toThrow(/ya es Cliente/);
    expect(pipelines.cambiarTipo).not.toHaveBeenCalled();
  });

  it('rejects an invalid tipo value before any read', async () => {
    const pipelines = makeFakePipeline();
    const empresas = { obtenerPorId: vi.fn() };

    await expect(
      new CambiarTipoUseCase(empresas as never, pipelines, reloj).execute({
        empresaId: 42,
        nuevoTipo: 'Lead' as never,
        usuario: 'mgarcia',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(empresas.obtenerPorId).not.toHaveBeenCalled();
  });

  it('404s when the empresa does not exist and never touches the port', async () => {
    const pipelines = makeFakePipeline();
    const empresas = { obtenerPorId: vi.fn().mockResolvedValue(null) };

    await expect(
      new CambiarTipoUseCase(empresas as never, pipelines, reloj).execute({
        empresaId: 99,
        nuevoTipo: 'Cliente',
        usuario: 'mgarcia',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(pipelines.cambiarTipo).not.toHaveBeenCalled();
  });
});
