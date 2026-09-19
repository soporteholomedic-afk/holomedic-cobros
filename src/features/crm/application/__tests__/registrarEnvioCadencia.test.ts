import { describe, expect, it, vi } from 'vitest';

import type { PipelineEmpresa } from '../../domain/entities';
import { NotFoundError, ValidationError } from '../../domain/errors';
import type {
  CandidatoCola,
  CrmActividadesRepositoryPort,
  CrmPipelineRepositoryPort,
  EnvioCadenciaAPersistir,
} from '../../domain/ports';
import { RegistrarEnvioCadenciaUseCase } from '../registrarEnvioCadencia';

/**
 * Use-case contract for logging ONE cadence send (tasks pr13/WU1,
 * spec G4, design §3). Hexagonal: exercised against the PORTS with
 * in-memory fakes — the real SQL Server atomicity is proven by the
 * adapter suite. Pinned here:
 * - 404 when the empresa has no pipeline row (rows are born at
 *   creation — a pipeline-less empresa cannot log sends).
 * - A send that is not due propagates the domain ValidationError and
 *   writes NOTHING (the queue is the only surface offering the action).
 * - The whole write rides ONE port call (activity + counters + derived
 *   T8/T9 audit): the use case never persists piecewise.
 * - The default asunto is Spanish and derived from the resulting
 *   counters; a custom asunto/detail passes through trimmed.
 * - The injected clock decides `hoy` (no hidden Date.now).
 */

const HOY = '2026-06-01';
const reloj = () => new Date(2026, 5, 1, 9, 0, 0); // hoy local = 2026-06-01

class FakePipelineRepository implements CrmPipelineRepositoryPort {
  filas = new Map<number, PipelineEmpresa>();

  async obtenerPorEmpresaId(empresaId: number): Promise<PipelineEmpresa | null> {
    const fila = this.filas.get(empresaId);
    return fila ? structuredClone(fila) : null;
  }

  async registrarTransicion(): Promise<never> {
    throw new Error('registrarTransicion no debe ser llamado por el envío de cadencia');
  }

  async cambiarTipo(): Promise<void> {
    throw new Error('cambiarTipo no debe ser llamado por el envío de cadencia');
  }

  async listarTransiciones(): Promise<never[]> {
    return [];
  }

  async listarHandoffs(): Promise<never[]> {
    return [];
  }

  listarCandidatosCola = vi.fn(async (): Promise<CandidatoCola[]> => []);
}

class FakeActividadesRepository implements CrmActividadesRepositoryPort {
  llamadas: EnvioCadenciaAPersistir[] = [];
  respuesta: PipelineEmpresa | null = null;
  fallo: Error | null = null;

  async registrarEnvioCadencia(datos: EnvioCadenciaAPersistir): Promise<PipelineEmpresa> {
    this.llamadas.push(structuredClone(datos));
    if (this.fallo) throw this.fallo;
    if (!this.respuesta) throw new Error('fixture sin respuesta');
    return structuredClone(this.respuesta);
  }
}

function filaVencida(overrides: Partial<PipelineEmpresa> = {}): PipelineEmpresa {
  return {
    empresaId: 7,
    flujo: 'INBOUND',
    etapa: 'SEGUIMIENTO',
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: '2026-05-18',
    fechaUltimoEnvio: '2026-05-25',
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-05-25T10:00:00.000Z',
    ...overrides,
  };
}

function filaTrasEnvio(overrides: Partial<PipelineEmpresa> = {}): PipelineEmpresa {
  return filaVencida({ enviosCiclo: 2, fechaUltimoEnvio: HOY, updatedAt: '2026-06-01T12:00:00.000Z', ...overrides });
}

describe('RegistrarEnvioCadenciaUseCase — el envío registrado escribe UN solo bundle', () => {
  it('weekly send: ONE port call with the counter projection, activity fields and hoy', async () => {
    const pipelines = new FakePipelineRepository();
    pipelines.filas.set(7, filaVencida());
    const actividades = new FakeActividadesRepository();
    actividades.respuesta = filaTrasEnvio();

    const resultado = await new RegistrarEnvioCadenciaUseCase(pipelines, actividades, reloj).execute({
      empresaId: 7,
      usuario: 'jperez',
    });

    expect(actividades.llamadas).toHaveLength(1);
    const bundle = actividades.llamadas[0];
    expect(bundle?.empresaId).toBe(7);
    expect(bundle?.usuario).toBe('jperez');
    expect(bundle?.hoy).toBe(HOY);
    expect(bundle?.efectos).toEqual({
      ciclo: 1,
      enviosCiclo: 2,
      fechaCicloInicio: '2026-05-18',
      fechaUltimoEnvio: HOY,
      descansoHasta: null,
      rechazadoHasta: null,
      motivoRechazo: null,
    });
    expect(bundle?.transicion).toBeNull();
    expect(bundle?.estadoFinal).toEqual({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO' });
    expect(bundle?.actividad).toEqual({ asunto: 'Envío de cadencia (ciclo 1, envío 2)', detalle: null, contactoId: null });
    expect(resultado.transicion).toBeNull();
    expect(resultado.pipeline).toEqual(filaTrasEnvio());
  });

  it('3rd OUTBOUND send: the bundle carries the derived T8 (EnviosAgotados → DESCANSO)', async () => {
    const pipelines = new FakePipelineRepository();
    pipelines.filas.set(
      7,
      filaVencida({ flujo: 'OUTBOUND', etapa: 'CADENCIA', ciclo: 2, enviosCiclo: 2, fechaUltimoEnvio: '2026-05-25' }),
    );
    const actividades = new FakeActividadesRepository();
    actividades.respuesta = filaTrasEnvio({
      flujo: 'OUTBOUND',
      etapa: 'DESCANSO',
      ciclo: 2,
      enviosCiclo: 3,
      descansoHasta: '2026-09-01',
    });

    const resultado = await new RegistrarEnvioCadenciaUseCase(pipelines, actividades, reloj).execute({
      empresaId: 7,
      usuario: 'jperez',
    });

    expect(resultado.transicion).toBe('EnviosAgotados');
    const bundle = actividades.llamadas[0];
    expect(bundle?.transicion).toEqual({
      evento: 'EnviosAgotados',
      estadoPrevio: { flujo: 'OUTBOUND', etapa: 'CADENCIA' },
      estadoNuevo: { flujo: 'OUTBOUND', etapa: 'DESCANSO' },
    });
    expect(bundle?.estadoFinal).toEqual({ flujo: 'OUTBOUND', etapa: 'DESCANSO' });
    expect(bundle?.efectos.descansoHasta).toBe('2026-09-01');
    expect(bundle?.efectos.enviosCiclo).toBe(3);
  });

  it('send on an expired DESCANSO: the bundle carries the derived T9 (ReinicioCadencia, ciclo+1)', async () => {
    const pipelines = new FakePipelineRepository();
    pipelines.filas.set(
      7,
      filaVencida({
        flujo: 'OUTBOUND',
        etapa: 'DESCANSO',
        ciclo: 2,
        enviosCiclo: 3,
        fechaUltimoEnvio: '2026-03-16',
        descansoHasta: HOY,
      }),
    );
    const actividades = new FakeActividadesRepository();
    actividades.respuesta = filaTrasEnvio({ flujo: 'OUTBOUND', etapa: 'CADENCIA', ciclo: 3, enviosCiclo: 1 });

    const resultado = await new RegistrarEnvioCadenciaUseCase(pipelines, actividades, reloj).execute({
      empresaId: 7,
      usuario: 'jperez',
    });

    expect(resultado.transicion).toBe('ReinicioCadencia');
    const bundle = actividades.llamadas[0];
    expect(bundle?.transicion?.evento).toBe('ReinicioCadencia');
    expect(bundle?.efectos).toMatchObject({ ciclo: 3, enviosCiclo: 1, fechaUltimoEnvio: HOY, descansoHasta: null });
  });

  it('custom asunto/detail/contactoId pass through trimmed (contacto optional addressee)', async () => {
    const pipelines = new FakePipelineRepository();
    pipelines.filas.set(7, filaVencida());
    const actividades = new FakeActividadesRepository();
    actividades.respuesta = filaTrasEnvio();

    await new RegistrarEnvioCadenciaUseCase(pipelines, actividades, reloj).execute({
      empresaId: 7,
      usuario: 'jperez',
      asunto: '  Seguimiento semana 2  ',
      detalle: '  Enviada propuesta actualizada  ',
      contactoId: 11,
    });

    expect(actividades.llamadas[0]?.actividad).toEqual({
      asunto: 'Seguimiento semana 2',
      detalle: 'Enviada propuesta actualizada',
      contactoId: 11,
    });
  });
});

describe('RegistrarEnvioCadenciaUseCase — guardrails', () => {
  it('raises NotFoundError (no write) when the empresa has no pipeline row', async () => {
    const pipelines = new FakePipelineRepository();
    const actividades = new FakeActividadesRepository();

    await expect(
      new RegistrarEnvioCadenciaUseCase(pipelines, actividades, reloj).execute({
        empresaId: 99,
        usuario: 'jperez',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(actividades.llamadas).toHaveLength(0);
  });

  it('an early send raises ValidationError and writes NOTHING', async () => {
    const pipelines = new FakePipelineRepository();
    pipelines.filas.set(7, filaVencida({ fechaUltimoEnvio: HOY })); // proximo = hoy + 7d
    const actividades = new FakeActividadesRepository();

    await expect(
      new RegistrarEnvioCadenciaUseCase(pipelines, actividades, reloj).execute({
        empresaId: 7,
        usuario: 'jperez',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(actividades.llamadas).toHaveLength(0);
  });

  it('a blank custom asunto falls back to the Spanish default', async () => {
    const pipelines = new FakePipelineRepository();
    pipelines.filas.set(7, filaVencida());
    const actividades = new FakeActividadesRepository();
    actividades.respuesta = filaTrasEnvio();

    await new RegistrarEnvioCadenciaUseCase(pipelines, actividades, reloj).execute({
      empresaId: 7,
      usuario: 'jperez',
      asunto: '   ',
    });

    expect(actividades.llamadas[0]?.actividad.asunto).toBe('Envío de cadencia (ciclo 1, envío 2)');
  });

  it('a non-positive contactoId is a ValidationError (repo untouched)', async () => {
    const pipelines = new FakePipelineRepository();
    pipelines.filas.set(7, filaVencida());
    const actividades = new FakeActividadesRepository();

    await expect(
      new RegistrarEnvioCadenciaUseCase(pipelines, actividades, reloj).execute({
        empresaId: 7,
        usuario: 'jperez',
        contactoId: 0,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(actividades.llamadas).toHaveLength(0);
  });

  it('a port failure propagates (no swallowing, no retries)', async () => {
    const pipelines = new FakePipelineRepository();
    pipelines.filas.set(7, filaVencida());
    const actividades = new FakeActividadesRepository();
    actividades.respuesta = filaTrasEnvio();
    actividades.fallo = new Error('db down');

    await expect(
      new RegistrarEnvioCadenciaUseCase(pipelines, actividades, reloj).execute({
        empresaId: 7,
        usuario: 'jperez',
      }),
    ).rejects.toThrow('db down');
    expect(actividades.llamadas).toHaveLength(1);
  });

  it('the use case never calls the transition write path (the send is NOT a POST /transiciones)', async () => {
    const pipelines = new FakePipelineRepository();
    const registrarTransicion = vi.fn();
    Object.assign(pipelines, { registrarTransicion });
    pipelines.filas.set(7, filaVencida());
    const actividades = new FakeActividadesRepository();
    actividades.respuesta = filaTrasEnvio();

    await new RegistrarEnvioCadenciaUseCase(pipelines, actividades, reloj).execute({
      empresaId: 7,
      usuario: 'jperez',
    });

    expect(registrarTransicion).not.toHaveBeenCalled();
    expect(actividades.llamadas).toHaveLength(1);
  });
});
