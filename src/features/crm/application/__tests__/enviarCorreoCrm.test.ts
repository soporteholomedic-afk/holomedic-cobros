import { describe, expect, it } from 'vitest';

import type { PipelineEmpresa } from '../../domain/entities';
import type { EfectosDenormalizados } from '../../domain/efectosTransicion';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { PLANTILLAS_CORREO } from '../../domain/plantillasCorreo';
import type {
  Clock,
  CrmActividadesRepositoryPort,
  CrmEmpresaRepositoryPort,
  CrmEnviosCorreoRepositoryPort,
  CrmPipelineRepositoryPort,
  EnviadorCorreoCrmPort,
  EnvioCadenciaAPersistir,
  EnvioCrmCorreo,
  FilaEnvioCorreoAudit,
  PlantillaCrmKey,
  ResultadoEnvioCrm,
  TransicionAPersistir,
} from '../../domain/ports';
import { InMemoryCrmEmpresaRepository } from './inMemoryCrmEmpresaRepository';
import { EnviarCorreoCrmUseCase, FalloEnvioCorreoError } from '../enviarCorreoCrm';

/**
 * Use-case contract for the CRM email send (tasks 5.1/5.3, design D5,
 * spec EM-4/EM-6). Hexagonal: ports + in-memory fakes; the SMTP port
 * is a stub (NO live sends). Pinned: D5 ordering (SMTP → write → log);
 * SMTP failure → FALLIDO + NO machine write; retry advances EXACTLY
 * once; T7/T2/T15 via the transition path, weekly/T8/T9 via the
 * cadence path; illegal targets fail BEFORE dispatch.
 */

const HOY = '2026-06-01';
const reloj: Clock = () => new Date(2026, 5, 1, 9, 0, 0); // hoy local = 2026-06-01

/** Shared write-order journal — proves D5's SMTP → write → log sequence. */
type Paso = 'smtp' | 'transicion' | 'actividad' | 'log:ENVIADO' | 'log:FALLIDO';

class FakePipelineRepository implements CrmPipelineRepositoryPort {
  filas = new Map<number, PipelineEmpresa>();
  transiciones: TransicionAPersistir[] = [];

  constructor(private readonly orden: Paso[]) {}

  async obtenerPorEmpresaId(empresaId: number): Promise<PipelineEmpresa | null> {
    const fila = this.filas.get(empresaId);
    return fila ? structuredClone(fila) : null;
  }

  async registrarTransicion(datos: TransicionAPersistir): Promise<PipelineEmpresa> {
    this.orden.push('transicion');
    this.transiciones.push(structuredClone(datos));
    return this.aplicar(datos.empresaId, datos.estadoNuevo.flujo, datos.estadoNuevo.etapa, datos.efectos, datos.usuario);
  }

  async cambiarTipo(): Promise<void> {
    throw new Error('cambiarTipo no debe ser llamado por el envío de correo');
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

  /** Applies a persisted projection to the store, like the SQL adapter. */
  aplicar(
    empresaId: number,
    flujo: PipelineEmpresa['flujo'],
    etapa: PipelineEmpresa['etapa'],
    efectos: EfectosDenormalizados,
    usuario: string,
  ): PipelineEmpresa {
    const fila = this.filas.get(empresaId);
    if (!fila) throw new Error('fixture sin fila de pipeline');
    const actualizada: PipelineEmpresa = { ...fila, flujo, etapa, ...efectos, updatedBy: usuario };
    this.filas.set(empresaId, actualizada);
    return structuredClone(actualizada);
  }
}

class FakeActividadesRepository implements CrmActividadesRepositoryPort {
  llamadas: EnvioCadenciaAPersistir[] = [];

  constructor(
    private readonly pipelines: FakePipelineRepository,
    private readonly orden: Paso[],
  ) {}

  async registrarEnvioCadencia(datos: EnvioCadenciaAPersistir): Promise<PipelineEmpresa> {
    this.orden.push('actividad');
    this.llamadas.push(structuredClone(datos));
    return this.pipelines.aplicar(
      datos.empresaId,
      datos.estadoFinal.flujo,
      datos.estadoFinal.etapa,
      datos.efectos,
      datos.usuario,
    );
  }

  async contarActividadesPorUsuario(): Promise<never[]> {
    return [];
  }
}

class FakeEnviosRepository implements CrmEnviosCorreoRepositoryPort {
  filas: FilaEnvioCorreoAudit[] = [];

  constructor(private readonly orden: Paso[]) {}

  async registrar(fila: FilaEnvioCorreoAudit): Promise<number> {
    this.orden.push(`log:${fila.estado}`);
    this.filas.push(structuredClone(fila));
    return this.filas.length;
  }

  async listarPorEmpresa(): Promise<never[]> {
    return [];
  }
}

class FakeCorreoPort implements EnviadorCorreoCrmPort {
  llamadas: EnvioCrmCorreo[] = [];
  respuesta: ResultadoEnvioCrm = { ok: true, messageId: 'msg-1' };

  constructor(private readonly orden: Paso[]) {}

  async enviar(datos: EnvioCrmCorreo): Promise<ResultadoEnvioCrm> {
    this.orden.push('smtp');
    this.llamadas.push(structuredClone(datos));
    return this.respuesta;
  }
}

interface Escenario {
  pipelines: FakePipelineRepository;
  actividades: FakeActividadesRepository;
  envios: FakeEnviosRepository;
  correo: FakeCorreoPort;
  orden: Paso[];
  empresaId: number;
  execute: (plantilla: PlantillaCrmKey) => ReturnType<EnviarCorreoCrmUseCase['execute']>;
}

async function escenario(fila: PipelineEmpresa): Promise<Escenario> {
  const orden: Paso[] = [];
  const empresas: CrmEmpresaRepositoryPort = new InMemoryCrmEmpresaRepository();
  const empresa = await empresas.crear({
    ruc: '1792345678001',
    razonSocial: 'Constructora Andes SA',
    tipo: 'Prospecto',
    origen: 'Outbound',
    sector: 'Construcción',
    cantidadTrabajadores: 45,
    contactos: [{ nombre: 'Ana Ruiz', esPrincipal: true, correos: ['ana@andes.com'] }],
  });
  const pipelines = new FakePipelineRepository(orden);
  pipelines.filas.set(empresa.id, fila);
  const actividades = new FakeActividadesRepository(pipelines, orden);
  const envios = new FakeEnviosRepository(orden);
  const correo = new FakeCorreoPort(orden);
  const useCase = new EnviarCorreoCrmUseCase({ empresas, pipelines, actividades, envios, correo, clock: reloj });
  return {
    pipelines,
    actividades,
    envios,
    correo,
    orden,
    empresaId: empresa.id,
    execute: (plantilla) => useCase.execute({ empresaId: empresa.id, plantilla, usuario: 'jperez' }),
  };
}

function fila(overrides: Partial<PipelineEmpresa> = {}): PipelineEmpresa {
  return {
    empresaId: 1,
    flujo: 'OUTBOUND',
    etapa: 'NUEVO',
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

describe('EnviarCorreoCrmUseCase — orden D5: SMTP primero, escrita de máquina segundo, log ENVIADO último', () => {
  it('carta on OUTBOUND/NUEVO: T7 arms the cadence and the whole D5 sequence holds', async () => {
    const e = await escenario(fila());

    const resultado = await e.execute('carta_presentacion');

    expect(e.orden).toEqual(['smtp', 'transicion', 'log:ENVIADO']);
    expect(e.correo.llamadas[0]).toEqual({
      destinatario: 'ana@andes.com',
      plantilla: 'carta_presentacion',
      empresa: 'Constructora Andes SA',
      contacto: 'Ana Ruiz',
      sector: 'Construcción',
      trabajadores: 45,
    });
    expect(e.pipelines.transiciones).toHaveLength(1);
    expect(e.pipelines.transiciones[0]).toMatchObject({
      empresaId: e.empresaId,
      evento: 'PresentaciónEnviada',
      estadoPrevio: { flujo: 'OUTBOUND', etapa: 'NUEVO' },
      estadoNuevo: { flujo: 'OUTBOUND', etapa: 'CADENCIA' },
      usuario: 'jperez',
    });
    expect(e.pipelines.filas.get(e.empresaId)).toMatchObject({ etapa: 'CADENCIA', enviosCiclo: 1 });
    expect(e.envios.filas).toHaveLength(1);
    expect(e.envios.filas[0]).toMatchObject({
      empresaId: e.empresaId,
      plantilla: 'carta_presentacion',
      destinatario: 'ana@andes.com',
      estado: 'ENVIADO',
      messageId: 'msg-1',
      errorInfo: null,
      usuario: 'jperez',
    });
    expect(e.envios.filas[0]?.contactoId).toBeGreaterThan(0);
    expect(resultado).toMatchObject({ envioId: 1, plantilla: 'carta_presentacion', destinatario: 'ana@andes.com' });
    expect(resultado.pipeline).toMatchObject({ etapa: 'CADENCIA', enviosCiclo: 1 });
  });

  it('carta on INBOUND/REGISTRADO arms T2 (CotizaciónEnviada → SEGUIMIENTO)', async () => {
    const e = await escenario(fila({ flujo: 'INBOUND', etapa: 'REGISTRADO', ciclo: 1 }));

    const resultado = await e.execute('carta_presentacion');

    expect(e.pipelines.transiciones[0]).toMatchObject({
      evento: 'CotizaciónEnviada',
      estadoPrevio: { flujo: 'INBOUND', etapa: 'REGISTRADO' },
      estadoNuevo: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' },
    });
    expect(resultado.pipeline).toMatchObject({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO', enviosCiclo: 1 });
  });
});

describe('EnviarCorreoCrmUseCase — seguimientos y reactivaciones cabalgan los use cases EXISTENTES', () => {
  it('seguimiento due (+1 Sem) rides the cadence path with the template as subject label', async () => {
    const e = await escenario(fila({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO', enviosCiclo: 1, fechaCicloInicio: '2026-05-18', fechaUltimoEnvio: '2026-05-25' }));

    const resultado = await e.execute('seguimiento_1');

    expect(e.orden).toEqual(['smtp', 'actividad', 'log:ENVIADO']);
    expect(e.pipelines.transiciones).toHaveLength(0); // NOT the transition path
    expect(e.actividades.llamadas).toHaveLength(1);
    expect(e.actividades.llamadas[0]?.actividad).toMatchObject({
      asunto: PLANTILLAS_CORREO.seguimiento_1.titulo,
      contactoId: e.actividades.llamadas[0]?.actividad.contactoId,
    });
    expect(resultado.pipeline).toMatchObject({ etapa: 'SEGUIMIENTO', enviosCiclo: 2, fechaUltimoEnvio: HOY });
  });

  it('4th OUTBOUND send auto-fires T8 through the cadence path (DESCANSO + 3m)', async () => {
    const e = await escenario(fila({ flujo: 'OUTBOUND', etapa: 'CADENCIA', ciclo: 2, enviosCiclo: 3, fechaCicloInicio: '2026-05-04', fechaUltimoEnvio: '2026-05-25' }));

    const resultado = await e.execute('seguimiento_2');

    expect(resultado.pipeline).toMatchObject({ flujo: 'OUTBOUND', etapa: 'DESCANSO', enviosCiclo: 4, descansoHasta: '2026-09-01' });
    expect(e.actividades.llamadas[0]?.transicion?.evento).toBe('EnviosAgotados');
    expect(e.orden).toEqual(['smtp', 'actividad', 'log:ENVIADO']);
  });

  it('reactivacion on an expired DESCANSO re-enters the cadence (T9) through the cadence path', async () => {
    const e = await escenario(fila({ flujo: 'OUTBOUND', etapa: 'DESCANSO', ciclo: 2, enviosCiclo: 4, fechaCicloInicio: '2026-03-16', fechaUltimoEnvio: '2026-03-16', descansoHasta: HOY }));

    const resultado = await e.execute('reactivacion_3m');

    expect(resultado.pipeline).toMatchObject({ flujo: 'OUTBOUND', etapa: 'CADENCIA', ciclo: 3, enviosCiclo: 1, descansoHasta: null });
    expect(e.actividades.llamadas[0]?.transicion?.evento).toBe('ReinicioCadencia');
  });

  it('reactivacion on RECHAZADO fires T15 (Reactivar → NUEVO) through the transition path', async () => {
    const e = await escenario(fila({ flujo: 'INBOUND', etapa: 'RECHAZADO', rechazadoHasta: '2026-05-01', motivoRechazo: 'sin presupuesto' }));

    const resultado = await e.execute('reactivacion_3m');

    expect(e.pipelines.transiciones[0]).toMatchObject({
      evento: 'Reactivar',
      estadoPrevio: { flujo: 'INBOUND', etapa: 'RECHAZADO' },
      estadoNuevo: { flujo: 'INBOUND', etapa: 'NUEVO' },
    });
    expect(e.actividades.llamadas).toHaveLength(0);
    expect(resultado.pipeline).toMatchObject({ flujo: 'INBOUND', etapa: 'NUEVO', rechazadoHasta: null });
  });
});

describe('EnviarCorreoCrmUseCase — fallo SMTP: FALLIDO + máquina intacta (D5 core)', () => {
  it('SMTP failure logs FALLIDO, writes NO machine state and throws the typed error', async () => {
    const e = await escenario(fila());
    e.correo.respuesta = { ok: false, error: 'SMTP_TIMEOUT', detalle: 'greeting timeout' };

    await expect(e.execute('carta_presentacion')).rejects.toBeInstanceOf(FalloEnvioCorreoError);

    expect(e.orden).toEqual(['smtp', 'log:FALLIDO']);
    expect(e.envios.filas).toHaveLength(1);
    expect(e.envios.filas[0]).toMatchObject({
      estado: 'FALLIDO',
      messageId: null,
      plantilla: 'carta_presentacion',
      destinatario: 'ana@andes.com',
      usuario: 'jperez',
    });
    expect(e.envios.filas[0]?.errorInfo).toContain('SMTP_TIMEOUT');
    expect(e.envios.filas[0]?.errorInfo).toContain('greeting timeout');
    expect(e.pipelines.transiciones).toHaveLength(0);
    expect(e.actividades.llamadas).toHaveLength(0);
    expect(e.pipelines.filas.get(e.empresaId)).toStrictEqual(fila());
  });

  it('the retry after a failure advances the counter EXACTLY once (no double-count)', async () => {
    const e = await escenario(fila({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO', enviosCiclo: 1, fechaCicloInicio: '2026-05-18', fechaUltimoEnvio: '2026-05-25' }));
    e.correo.respuesta = { ok: false, error: 'SMTP_ERROR', detalle: 'dns' };
    await expect(e.execute('seguimiento_1')).rejects.toBeInstanceOf(FalloEnvioCorreoError);

    e.correo.respuesta = { ok: true, messageId: 'msg-2' };
    const resultado = await e.execute('seguimiento_1');

    expect(e.actividades.llamadas).toHaveLength(1); // exactly ONE machine write across both attempts
    expect(resultado.pipeline.enviosCiclo).toBe(2);
    expect(e.envios.filas.map((f) => f.estado)).toEqual(['FALLIDO', 'ENVIADO']);
    expect(e.envios.filas[1]?.messageId).toBe('msg-2');
  });
});

describe('EnviarCorreoCrmUseCase — guardrails: nada se despacha ni se escribe fuera de regla', () => {
  it('carta on an armed CADENCIA is a ValidationError BEFORE dispatch (no SMTP, no log)', async () => {
    const e = await escenario(fila({ flujo: 'OUTBOUND', etapa: 'CADENCIA', enviosCiclo: 1, fechaCicloInicio: HOY, fechaUltimoEnvio: HOY }));

    await expect(e.execute('carta_presentacion')).rejects.toBeInstanceOf(ValidationError);

    expect(e.correo.llamadas).toHaveLength(0);
    expect(e.envios.filas).toHaveLength(0);
    expect(e.pipelines.transiciones).toHaveLength(0);
  });

  it('reactivacion on a DESCANSO still running fails BEFORE dispatch', async () => {
    const e = await escenario(fila({ flujo: 'OUTBOUND', etapa: 'DESCANSO', enviosCiclo: 4, descansoHasta: '2026-09-01' }));

    await expect(e.execute('reactivacion_3m')).rejects.toThrow('descanso');

    expect(e.correo.llamadas).toHaveLength(0);
    expect(e.envios.filas).toHaveLength(0);
  });

  it('a weekly send that is not due fails BEFORE dispatch (aplicarEnvioCadencia guard)', async () => {
    const e = await escenario(fila({ flujo: 'INBOUND', etapa: 'SEGUIMIENTO', enviosCiclo: 1, fechaUltimoEnvio: HOY }));

    await expect(e.execute('seguimiento_1')).rejects.toBeInstanceOf(ValidationError);

    expect(e.correo.llamadas).toHaveLength(0);
    expect(e.envios.filas).toHaveLength(0);
    expect(e.actividades.llamadas).toHaveLength(0);
  });

  it('an empresa without contactos fails before dispatch (correo resolution)', async () => {
    const orden: Paso[] = [];
    const empresas: CrmEmpresaRepositoryPort = new InMemoryCrmEmpresaRepository();
    const empresa = await empresas.crear({
      ruc: '1799999999001',
      razonSocial: 'Sin Contactos SA',
      tipo: 'Prospecto',
      origen: 'Outbound',
      contactos: [],
    });
    const pipelines = new FakePipelineRepository(orden);
    pipelines.filas.set(empresa.id, fila({ empresaId: empresa.id }));
    const useCase = new EnviarCorreoCrmUseCase({
      empresas,
      pipelines,
      actividades: new FakeActividadesRepository(pipelines, orden),
      envios: new FakeEnviosRepository(orden),
      correo: new FakeCorreoPort(orden),
      clock: reloj,
    });

    await expect(useCase.execute({ empresaId: empresa.id, plantilla: 'carta_presentacion', usuario: 'jperez' }))
      .rejects.toBeInstanceOf(ValidationError);
    expect(orden).toEqual([]);
  });

  it('an unknown empresa is a NotFoundError with nothing written', async () => {
    const e = await escenario(fila());

    await expect(
      new EnviarCorreoCrmUseCase({
        empresas: { obtenerPorId: async () => null } as unknown as CrmEmpresaRepositoryPort,
        pipelines: e.pipelines,
        actividades: e.actividades,
        envios: e.envios,
        correo: e.correo,
        clock: reloj,
      }).execute({ empresaId: 999, plantilla: 'carta_presentacion', usuario: 'jperez' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(e.envios.filas).toHaveLength(0);
  });

  it('an empresa without a pipeline row is a NotFoundError (machine write impossible)', async () => {
    const e = await escenario(fila());
    e.pipelines.filas.clear();

    await expect(e.execute('carta_presentacion')).rejects.toBeInstanceOf(NotFoundError);
    expect(e.correo.llamadas).toHaveLength(0);
  });
});
