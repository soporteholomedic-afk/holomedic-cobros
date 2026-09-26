import { describe, expect, it } from 'vitest';

import type { PipelineEmpresa } from '../../domain/entities';
import { NotFoundError, ValidationError } from '../../domain/errors';
import type {
  CambiarTipoDatos,
  CrmPipelineRepositoryPort,
  TransicionAPersistir,
} from '../../domain/ports';
import { TransicionInvalidaError } from '../../domain/maquinaEstados';
import { RegistrarTransicionUseCase } from '../registrarTransicion';

/**
 * Use-case contract for applying a pipeline transition (tasks pr10/WU1,
 * spec G4). Hexagonal: the use case is exercised against the PORT with
 * an in-memory fake — the real SQL Server atomicity is proven by the
 * adapter suite (WU2). Pinned here:
 * - ONE port call carries the whole bundle (pipeline row + audit fields
 *   + optional result/handoff) — the use case never writes piecewise,
 *   so a port failure propagates with zero partial application.
 * - T14 requires a motivo (Spanish validation, repo untouched).
 * - T5 requires a handoff {area}.
 * - The pinned machine event names ride the bundle verbatim
 *   (CRM_Transiciones.evento).
 * - 'ConversiónProspectoACliente' is NOT applied here (the /tipo
 *   endpoint owns T16).
 */

const HOY = '2026-06-01';
const reloj = () => new Date(2026, 5, 1, 9, 0, 0); // hoy local = 2026-06-01

class FakePipelineRepository implements CrmPipelineRepositoryPort {
  filas = new Map<number, PipelineEmpresa>();
  llamadas: TransicionAPersistir[] = [];
  cambioTipo: (CambiarTipoDatos & { convertir: boolean })[] = [];
  falloEnRegistrar: Error | null = null;

  async obtenerPorEmpresaId(empresaId: number): Promise<PipelineEmpresa | null> {
    const fila = this.filas.get(empresaId);
    return fila ? structuredClone(fila) : null;
  }

  async registrarTransicion(datos: TransicionAPersistir): Promise<PipelineEmpresa> {
    this.llamadas.push(structuredClone(datos));
    if (this.falloEnRegistrar) throw this.falloEnRegistrar;
    const actualizada: PipelineEmpresa = {
      empresaId: datos.empresaId,
      flujo: datos.estadoNuevo.flujo,
      etapa: datos.estadoNuevo.etapa,
      ciclo: datos.efectos.ciclo,
      enviosCiclo: datos.efectos.enviosCiclo,
      fechaCicloInicio: datos.efectos.fechaCicloInicio,
      fechaUltimoEnvio: datos.efectos.fechaUltimoEnvio,
      descansoHasta: datos.efectos.descansoHasta,
      rechazadoHasta: datos.efectos.rechazadoHasta,
      motivoRechazo: datos.efectos.motivoRechazo,
      updatedBy: datos.usuario,
      updatedAt: '2026-06-01T12:00:00.000Z',
    };
    this.filas.set(datos.empresaId, actualizada);
    return structuredClone(actualizada);
  }

  async cambiarTipo(datos: CambiarTipoDatos): Promise<void> {
    this.cambioTipo.push({ ...datos });
  }

  async listarTransiciones(): Promise<never[]> {
    return [];
  }

  async listarHandoffs(): Promise<never[]> {
    return [];
  }

  async listarCandidatosCola(): Promise<never[]> {
    return [];
  }
}

function filaInbound(overrides: Partial<PipelineEmpresa> = {}): PipelineEmpresa {
  return {
    empresaId: 7,
    flujo: 'INBOUND',
    etapa: 'REGISTRADO',
    ciclo: 1,
    enviosCiclo: 0,
    fechaCicloInicio: null,
    fechaUltimoEnvio: null,
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-05-01T10:00:00.000Z',
    ...overrides,
  };
}

function useCaseCon(repo: FakePipelineRepository): RegistrarTransicionUseCase {
  return new RegistrarTransicionUseCase(repo, reloj);
}

describe('RegistrarTransicionUseCase — bundle application (spec G4)', () => {
  it('T2 applies the whole bundle in ONE port call: new state, audit fields, armed counters', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(7, filaInbound());

    const resultado = await useCaseCon(repo).execute({
      empresaId: 7,
      evento: 'CotizaciónEnviada',
      usuario: 'jperez',
    });

    expect(resultado.estado).toEqual({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO' });
    expect(resultado.resultado).toBe('CotizaciónEnviada');
    expect(repo.llamadas).toHaveLength(1);
    const bundle = repo.llamadas[0];
    expect(bundle?.empresaId).toBe(7);
    expect(bundle?.usuario).toBe('jperez');
    expect(bundle?.evento).toBe('CotizaciónEnviada');
    expect(bundle?.hoy).toBe(HOY);
    expect(bundle?.estadoPrevio).toEqual({ flujo: 'INBOUND', etapa: 'REGISTRADO' });
    expect(bundle?.estadoNuevo).toEqual({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO' });
    expect(bundle?.efectos).toEqual({
      ciclo: 1,
      enviosCiclo: 1,
      fechaCicloInicio: HOY,
      fechaUltimoEnvio: HOY,
      descansoHasta: null,
      rechazadoHasta: null,
      motivoRechazo: null,
    });
    expect(bundle?.motivo).toBeNull();
    expect(bundle?.handoff).toBeNull();
  });

  it('T12 flips the flow OUTBOUND→INBOUND and re-arms the cadence counters', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(
      7,
      filaInbound({ flujo: 'OUTBOUND', etapa: 'DATOS', ciclo: 2, enviosCiclo: 3, fechaUltimoEnvio: '2026-04-20' }),
    );

    const resultado = await useCaseCon(repo).execute({
      empresaId: 7,
      evento: 'CotizaciónEnviada',
      usuario: 'mgarcia',
    });

    expect(resultado.estado).toEqual({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO' });
    expect(resultado.resultado).toBe('CotizaciónEnviada');
    const bundle = repo.llamadas[0];
    expect(bundle?.estadoPrevio).toEqual({ flujo: 'OUTBOUND', etapa: 'DATOS' });
    expect(bundle?.estadoNuevo).toEqual({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO' });
    expect(bundle?.efectos.ciclo).toBe(1);
    expect(bundle?.efectos.enviosCiclo).toBe(1);
    expect(bundle?.efectos.fechaCicloInicio).toBe(HOY);
    expect(bundle?.efectos.fechaUltimoEnvio).toBe(HOY);
  });

  it('T14 stores the motivo and the 3-month cooldown; no result event is emitted', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(7, filaInbound({ etapa: 'SEGUIMIENTO', enviosCiclo: 1 }));

    const resultado = await useCaseCon(repo).execute({
      empresaId: 7,
      evento: 'Rechazo',
      motivo: '  Ya tiene proveedor  ',
      usuario: 'jperez',
    });

    expect(resultado.estado).toEqual({ flujo: 'INBOUND', etapa: 'RECHAZADO' });
    expect(resultado.resultado).toBeNull();
    const bundle = repo.llamadas[0];
    expect(bundle?.motivo).toBe('Ya tiene proveedor');
    expect(bundle?.efectos.rechazadoHasta).toBe('2026-09-01');
    expect(bundle?.efectos.motivoRechazo).toBe('Ya tiene proveedor');
  });

  it('T14 without a motivo is a Spanish validation error and the repo is never called', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(7, filaInbound({ etapa: 'SEGUIMIENTO' }));

    await expect(
      useCaseCon(repo).execute({ empresaId: 7, evento: 'Rechazo', motivo: '   ', usuario: 'jperez' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCaseCon(repo).execute({ empresaId: 7, evento: 'Rechazo', usuario: 'jperez' }),
    ).rejects.toThrow(/motivo/i);
    expect(repo.llamadas).toHaveLength(0);
  });

  it('T14 rejects a motivo longer than the NV(300) audit column', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(7, filaInbound({ etapa: 'SEGUIMIENTO' }));

    await expect(
      useCaseCon(repo).execute({
        empresaId: 7,
        evento: 'Rechazo',
        motivo: 'x'.repeat(301),
        usuario: 'jperez',
      }),
    ).rejects.toThrow(/300/);
    expect(repo.llamadas).toHaveLength(0);
  });

  it('T5 rides the handoff payload through the bundle and emits HandoffRegistrado', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(7, filaInbound({ etapa: 'CONFIRMADA' }));

    const resultado = await useCaseCon(repo).execute({
      empresaId: 7,
      evento: 'HandoffRegistrado',
      handoff: { area: 'Operaciones', nota: 'Coordinar entrega' },
      usuario: 'jperez',
    });

    expect(resultado.estado).toEqual({ flujo: 'INBOUND', etapa: 'ENTREGADA' });
    expect(resultado.resultado).toBe('HandoffRegistrado');
    expect(repo.llamadas[0]?.handoff).toEqual({ area: 'Operaciones', nota: 'Coordinar entrega' });
  });

  it('T5 without a handoff (or with a blank area) is a Spanish validation error', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(7, filaInbound({ etapa: 'CONFIRMADA' }));
    const useCase = useCaseCon(repo);

    await expect(
      useCase.execute({ empresaId: 7, evento: 'HandoffRegistrado', usuario: 'jperez' }),
    ).rejects.toThrow(/área/i);
    await expect(
      useCase.execute({
        empresaId: 7,
        evento: 'HandoffRegistrado',
        handoff: { area: '   ' },
        usuario: 'jperez',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.llamadas).toHaveLength(0);
  });

  it('T8 persists the 3-month rest derived from the STORED last send (3rd envío, no result event)', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(
      7,
      filaInbound({ flujo: 'OUTBOUND', etapa: 'CADENCIA', enviosCiclo: 3, fechaUltimoEnvio: '2026-03-10' }),
    );

    const resultado = await useCaseCon(repo).execute({
      empresaId: 7,
      evento: 'EnviosAgotados',
      usuario: 'jperez',
    });

    expect(resultado.estado).toEqual({ flujo: 'OUTBOUND', etapa: 'DESCANSO' });
    const bundle = repo.llamadas[0];
    expect(bundle?.efectos.descansoHasta).toBe('2026-06-10');
    expect(bundle?.efectos.enviosCiclo).toBe(3);
    expect(bundle?.resultado).toBeNull();
  });

  it('returns the new pipeline row from the port so the API answers with fresh counters', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(7, filaInbound());

    const resultado = await useCaseCon(repo).execute({
      empresaId: 7,
      evento: 'CotizaciónEnviada',
      usuario: 'jperez',
    });

    expect(resultado.pipeline.etapa).toBe('SEGUIMIENTO');
    expect(resultado.pipeline.enviosCiclo).toBe(1);
    expect(resultado.pipeline.updatedBy).toBe('jperez');
  });
});

describe('RegistrarTransicionUseCase — guards (nothing is written on rejection)', () => {
  it('404s when the empresa has no pipeline row', async () => {
    const repo = new FakePipelineRepository();

    await expect(
      useCaseCon(repo).execute({ empresaId: 99, evento: 'CotizaciónEnviada', usuario: 'jperez' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.llamadas).toHaveLength(0);
  });

  it('propagates the machine guard (TransicionInvalidaError) without any write', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(7, filaInbound({ etapa: 'REGISTRADO' }));

    await expect(
      useCaseCon(repo).execute({ empresaId: 7, evento: 'PresentaciónEnviada', usuario: 'jperez' }),
    ).rejects.toBeInstanceOf(TransicionInvalidaError);
    expect(repo.llamadas).toHaveLength(0);
    expect(repo.filas.get(7)?.etapa).toBe('REGISTRADO');
  });

  it('rejects ConversiónProspectoACliente — T16 belongs to the tipo endpoint', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(7, filaInbound());

    await expect(
      useCaseCon(repo).execute({
        empresaId: 7,
        evento: 'ConversiónProspectoACliente',
        usuario: 'jperez',
      }),
    ).rejects.toThrow(/tipo/i);
    expect(repo.llamadas).toHaveLength(0);
  });

  it('a port failure mid-transaction propagates — exactly ONE bundle call was made, never piecewise writes', async () => {
    const repo = new FakePipelineRepository();
    repo.filas.set(7, filaInbound());
    repo.falloEnRegistrar = new Error('boom inside the transaction');

    await expect(
      useCaseCon(repo).execute({ empresaId: 7, evento: 'CotizaciónEnviada', usuario: 'jperez' }),
    ).rejects.toThrow('boom inside the transaction');

    // The whole bundle went through the single atomic port call; the
    // use case attempted no compensating or partial writes afterwards.
    expect(repo.llamadas).toHaveLength(1);
  });
});
