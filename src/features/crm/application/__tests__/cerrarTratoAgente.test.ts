import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ConversacionCrm,
  CrearMensajeInput,
  Empresa,
  MensajeCrm,
  PipelineEmpresa,
  SenalCierre,
  TipoCierreAgente,
} from '../../domain/entities';
import type {
  CambiarTipoDatos,
  Clock,
  CrmEmpresaRepositoryPort,
  CrmPipelineRepositoryPort,
  ConversacionCrmRepository,
  EnviadorWhatsappCrmPort,
  EnvioWhatsappCrm,
  MensajeCrmRepository,
  ResultadoEnvioWhatsapp,
  TransicionAPersistir,
} from '../../domain/ports';
import type { EstadoPipeline } from '../../domain/maquinaEstados';
import {
  CerrarTratoAgenteUseCase,
  TEXTO_CONFIRMACION_CIERRE,
  UMBRAL_CIERRE_MINIMO,
  USUARIO_AGENTE,
  cierresPosiblesDe,
} from '../cerrarTratoAgente';
import { crearConfigAgente, type ConfigAgente } from '../configAgente';

/**
 * E5·T9 — hybrid close: the LLM proposes a SenalCierre, this use case
 * is the deterministic validator + executor. Tested against the ports
 * with in-memory fakes; every rejection must leave the fakes untouched.
 */

const TELEFONO = '+51987654321';
const reloj: Clock = () => new Date(2026, 5, 1, 9, 0, 0);

// ---- Pure helper ----

describe('cierresPosiblesDe', () => {
  const est = (flujo: EstadoPipeline['flujo'], etapa: EstadoPipeline['etapa']): EstadoPipeline => ({
    flujo,
    etapa,
  });
  const tabla: Array<[string, EstadoPipeline | null, 'Prospecto' | 'Cliente', TipoCierreAgente[]]> = [
    ['null estado', null, 'Prospecto', []],
    ['null estado Cliente', null, 'Cliente', []],
    ['OUTBOUND/CADENCIA Prospecto', est('OUTBOUND', 'CADENCIA'), 'Prospecto', ['ACEPTACION', 'CONVERSION_CLIENTE']],
    ['OUTBOUND/CADENCIA Cliente', est('OUTBOUND', 'CADENCIA'), 'Cliente', ['ACEPTACION']],
    ['INBOUND/PRESENTACION Prospecto', est('INBOUND', 'PRESENTACION'), 'Prospecto', ['CONFIRMACION_PRESENTACION', 'CONVERSION_CLIENTE']],
    ['INBOUND/PRESENTACION Cliente', est('INBOUND', 'PRESENTACION'), 'Cliente', ['CONFIRMACION_PRESENTACION']],
    ['INBOUND/SEGUIMIENTO Prospecto', est('INBOUND', 'SEGUIMIENTO'), 'Prospecto', ['CONVERSION_CLIENTE']],
    ['INBOUND/SEGUIMIENTO Cliente', est('INBOUND', 'SEGUIMIENTO'), 'Cliente', []],
    ['OUTBOUND/NUEVO is not CADENCIA', est('OUTBOUND', 'NUEVO'), 'Cliente', []],
    ['INBOUND/CADENCIA is not OUTBOUND', est('INBOUND', 'CADENCIA'), 'Cliente', []],
    ['RECHAZADO Prospecto', est('INBOUND', 'RECHAZADO'), 'Prospecto', []],
    ['OUTBOUND/ACEPTADO Prospecto', est('OUTBOUND', 'ACEPTADO'), 'Prospecto', ['CONVERSION_CLIENTE']],
  ];

  it.each(tabla)('%s', (_nombre, estado, tipo, esperado) => {
    expect(cierresPosiblesDe(estado, tipo)).toEqual(esperado);
  });
});

// ---- Fakes ----

function empresaBase(tipo: Empresa['tipo']): Empresa {
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
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };
}

function pipelineBase(flujo: PipelineEmpresa['flujo'], etapa: PipelineEmpresa['etapa']): PipelineEmpresa {
  return {
    empresaId: 42,
    flujo,
    etapa,
    ciclo: 1,
    enviosCiclo: 1,
    fechaCicloInicio: null,
    fechaUltimoEnvio: null,
    descansoHasta: null,
    rechazadoHasta: null,
    motivoRechazo: null,
    updatedBy: null,
    updatedAt: '2026-05-01T10:00:00.000Z',
  };
}

function conversacionBase(overrides: Partial<ConversacionCrm> = {}): ConversacionCrm {
  return {
    id: 5,
    empresaId: 42,
    contactoId: 9,
    canal: 'WHATSAPP',
    telefono: TELEFONO,
    identificadorCanal: null,
    estado: 'ACTIVA_IA',
    asignadaA: null,
    modo: 'IA',
    ultimoMensajeEn: null,
    noLeidos: 0,
    creadoEn: '2026-05-01T00:00:00.000Z',
    actualizadoEn: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

interface Escenario {
  conversacion: ConversacionCrm | null;
  empresa: Empresa | null;
  pipeline: PipelineEmpresa | null;
  envio: ResultadoEnvioWhatsapp;
  config: ConfigAgente;
}

interface Mundo {
  useCase: CerrarTratoAgenteUseCase;
  eventos: string[];
  transiciones: TransicionAPersistir[];
  cambiosTipo: CambiarTipoDatos[];
  mensajesCreados: CrearMensajeInput[];
  actualizaciones: Array<{ id: number; estadoEnvio: string; wamid?: string | null }>;
  envios: EnvioWhatsappCrm[];
  enviarMock: ReturnType<typeof vi.fn>;
  actividad: Array<{ id: number; direccion?: 'IN' | 'OUT' }>;
  config: ConfigAgente;
  pipelineActual: () => PipelineEmpresa | null;
  fallar: {
    transicion: Error | null;
    crearMensaje: Error | null;
    actualizarEnvio: Error | null;
    actividad: Error | null;
  };
  setEnvio: (envio: ResultadoEnvioWhatsapp) => void;
}

function construirMundo(parcial: Partial<Escenario> = {}): Mundo {
  const escenario: Escenario = {
    conversacion: conversacionBase(),
    empresa: empresaBase('Prospecto'),
    pipeline: pipelineBase('OUTBOUND', 'CADENCIA'),
    envio: { ok: true, wamid: 'wamid.ABC' },
    config: crearConfigAgente({}),
    ...parcial,
  };
  const eventos: string[] = [];
  const transiciones: TransicionAPersistir[] = [];
  const cambiosTipo: CambiarTipoDatos[] = [];
  const mensajesCreados: CrearMensajeInput[] = [];
  const actualizaciones: Mundo['actualizaciones'] = [];
  const envios: EnvioWhatsappCrm[] = [];
  const actividad: Mundo['actividad'] = [];
  const fallar: Mundo['fallar'] = {
    transicion: null,
    crearMensaje: null,
    actualizarEnvio: null,
    actividad: null,
  };
  let envioActual = escenario.envio;
  let pipeline = escenario.pipeline ? structuredClone(escenario.pipeline) : null;
  const empresa = escenario.empresa ? structuredClone(escenario.empresa) : null;
  let seqMensaje = 100;

  const conversaciones = {
    obtenerPorId: vi.fn(async () => (escenario.conversacion ? structuredClone(escenario.conversacion) : null)),
    registrarActividad: vi.fn(async (id: number, direccion?: 'IN' | 'OUT') => {
      eventos.push('actividad');
      actividad.push({ id, direccion });
      if (fallar.actividad) throw fallar.actividad;
    }),
  } as unknown as ConversacionCrmRepository;

  const mensajes = {
    crear: vi.fn(async (datos: CrearMensajeInput) => {
      eventos.push('crearMensaje');
      mensajesCreados.push(structuredClone(datos));
      if (fallar.crearMensaje) throw fallar.crearMensaje;
      seqMensaje += 1;
      return { id: seqMensaje, ...datos } as unknown as MensajeCrm;
    }),
    actualizarEnvio: vi.fn(async (id: number, datos: { estadoEnvio: 'ENVIADO' | 'FALLIDO'; wamid?: string | null }) => {
      eventos.push(`actualizarEnvio:${datos.estadoEnvio}`);
      actualizaciones.push({ id, ...datos });
      if (fallar.actualizarEnvio) throw fallar.actualizarEnvio;
      return { id } as unknown as MensajeCrm;
    }),
  } as unknown as MensajeCrmRepository;

  const empresas = {
    obtenerPorId: vi.fn(async () => (empresa ? structuredClone(empresa) : null)),
  } as unknown as CrmEmpresaRepositoryPort;

  const pipelines = {
    obtenerPorEmpresaId: vi.fn(async () => (pipeline ? structuredClone(pipeline) : null)),
    registrarTransicion: vi.fn(async (datos: TransicionAPersistir) => {
      eventos.push('transicion');
      transiciones.push(structuredClone(datos));
      if (fallar.transicion) throw fallar.transicion;
      pipeline = {
        ...(pipeline as PipelineEmpresa),
        flujo: datos.estadoNuevo.flujo,
        etapa: datos.estadoNuevo.etapa,
        updatedBy: datos.usuario,
      };
      return structuredClone(pipeline);
    }),
    cambiarTipo: vi.fn(async (datos: CambiarTipoDatos) => {
      eventos.push('cambiarTipo');
      cambiosTipo.push({ ...datos });
      if (empresa) empresa.tipo = datos.nuevoTipo;
    }),
  } as unknown as CrmPipelineRepositoryPort;

  const enviarMock = vi.fn(async (datos: EnvioWhatsappCrm): Promise<ResultadoEnvioWhatsapp> => {
    eventos.push('enviar');
    envios.push({ ...datos });
    return envioActual;
  });
  const whatsapp: EnviadorWhatsappCrmPort = { enviar: enviarMock };

  return {
    useCase: new CerrarTratoAgenteUseCase({ conversaciones, mensajes, empresas, pipelines, whatsapp, clock: reloj }),
    eventos,
    transiciones,
    cambiosTipo,
    mensajesCreados,
    actualizaciones,
    envios,
    enviarMock,
    actividad,
    config: escenario.config,
    pipelineActual: () => pipeline,
    fallar,
    setEnvio: (envio) => {
      envioActual = envio;
    },
  };
}

function senal(tipo: TipoCierreAgente, confianza = 0.9): SenalCierre {
  return { tipo, confianza };
}

function sinEfectos(mundo: Mundo): void {
  expect(mundo.eventos).toEqual([]);
  expect(mundo.transiciones).toHaveLength(0);
  expect(mundo.cambiosTipo).toHaveLength(0);
  expect(mundo.mensajesCreados).toHaveLength(0);
  expect(mundo.envios).toHaveLength(0);
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  errorSpy.mockRestore();
});

// ---- Rejections: zero side effects ----

describe('CerrarTratoAgenteUseCase — rejections (no side effect at all)', () => {
  it('kill switch off ⇒ AGENTE_DESHABILITADO, even before reading anything', async () => {
    const mundo = construirMundo();
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION', 1),
      config: { ...mundo.config, habilitado: false },
    });
    expect(resultado).toEqual({ cerrado: false, motivo: 'AGENTE_DESHABILITADO' });
    sinEfectos(mundo);
  });

  it('confianza 0.79 ⇒ CONFIANZA_INSUFICIENTE; 0.8 passes (boundary inclusive)', async () => {
    const bajo = construirMundo();
    const rechazo = await bajo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION', 0.79),
      config: bajo.config,
    });
    expect(rechazo).toEqual({ cerrado: false, motivo: 'CONFIANZA_INSUFICIENTE' });
    sinEfectos(bajo);

    const justo = construirMundo();
    const ok = await justo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION', UMBRAL_CIERRE_MINIMO),
      config: justo.config,
    });
    expect(ok.cerrado).toBe(true);
  });

  it('a configured umbral of 0.95 raises the bar above the 0.8 minimum', async () => {
    const mundo = construirMundo();
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION', 0.9),
      config: { ...mundo.config, umbralConfianza: 0.95 },
    });
    expect(resultado).toEqual({ cerrado: false, motivo: 'CONFIANZA_INSUFICIENTE' });
    sinEfectos(mundo);
  });

  it('a low configured umbral (0.5) never lowers the 0.8 minimum', async () => {
    const mundo = construirMundo();
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION', 0.7),
      config: { ...mundo.config, umbralConfianza: 0.5 },
    });
    expect(resultado).toEqual({ cerrado: false, motivo: 'CONFIANZA_INSUFICIENTE' });
    sinEfectos(mundo);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'non-finite confianza %s ⇒ CONFIANZA_INSUFICIENTE',
    async (confianza) => {
      const mundo = construirMundo();
      const resultado = await mundo.useCase.execute({
        conversacionId: 5,
        senal: senal('ACEPTACION', confianza),
        config: mundo.config,
      });
      expect(resultado).toEqual({ cerrado: false, motivo: 'CONFIANZA_INSUFICIENTE' });
      sinEfectos(mundo);
    },
  );

  it('missing conversación ⇒ CONVERSACION_NO_ENCONTRADA', async () => {
    const mundo = construirMundo({ conversacion: null });
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION'),
      config: mundo.config,
    });
    expect(resultado).toEqual({ cerrado: false, motivo: 'CONVERSACION_NO_ENCONTRADA' });
    sinEfectos(mundo);
  });

  it.each(['REQUIERE_HUMANO', 'PENDIENTE_VINCULACION', 'CERRADA'] as const)(
    'estado %s ⇒ CONVERSACION_NO_ACTIVA_IA',
    async (estado) => {
      const mundo = construirMundo({ conversacion: conversacionBase({ estado }) });
      const resultado = await mundo.useCase.execute({
        conversacionId: 5,
        senal: senal('ACEPTACION'),
        config: mundo.config,
      });
      expect(resultado).toEqual({ cerrado: false, motivo: 'CONVERSACION_NO_ACTIVA_IA' });
      sinEfectos(mundo);
    },
  );

  it.each([
    ['empresaId null', { empresaId: null }],
    ['contactoId null', { contactoId: null }],
    ['telefono null', { telefono: null }],
  ] as const)('%s ⇒ CONTACTO_NO_VINCULADO', async (_nombre, parcial) => {
    const mundo = construirMundo({ conversacion: conversacionBase(parcial) });
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION'),
      config: mundo.config,
    });
    expect(resultado).toEqual({ cerrado: false, motivo: 'CONTACTO_NO_VINCULADO' });
    sinEfectos(mundo);
  });

  it('missing empresa ⇒ CIERRE_NO_APLICA', async () => {
    const mundo = construirMundo({ empresa: null });
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION'),
      config: mundo.config,
    });
    expect(resultado).toEqual({ cerrado: false, motivo: 'CIERRE_NO_APLICA' });
    sinEfectos(mundo);
  });

  it('missing pipeline ⇒ CIERRE_NO_APLICA', async () => {
    const mundo = construirMundo({ pipeline: null });
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION'),
      config: mundo.config,
    });
    expect(resultado).toEqual({ cerrado: false, motivo: 'CIERRE_NO_APLICA' });
    sinEfectos(mundo);
  });

  it('ACEPTACION from INBOUND/SEGUIMIENTO ⇒ CIERRE_NO_APLICA', async () => {
    const mundo = construirMundo({ pipeline: pipelineBase('INBOUND', 'SEGUIMIENTO') });
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION'),
      config: mundo.config,
    });
    expect(resultado).toEqual({ cerrado: false, motivo: 'CIERRE_NO_APLICA' });
    sinEfectos(mundo);
  });

  it('CONVERSION_CLIENTE on a Cliente ⇒ CIERRE_NO_APLICA', async () => {
    const mundo = construirMundo({ empresa: empresaBase('Cliente') });
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('CONVERSION_CLIENTE'),
      config: mundo.config,
    });
    expect(resultado).toEqual({ cerrado: false, motivo: 'CIERRE_NO_APLICA' });
    sinEfectos(mundo);
  });

  it('CONVERSION_CLIENTE on a RECHAZADO prospect ⇒ CIERRE_NO_APLICA', async () => {
    const mundo = construirMundo({ pipeline: pipelineBase('OUTBOUND', 'RECHAZADO') });
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('CONVERSION_CLIENTE'),
      config: mundo.config,
    });
    expect(resultado).toEqual({ cerrado: false, motivo: 'CIERRE_NO_APLICA' });
    sinEfectos(mundo);
  });
});

// ---- Execution ----

describe('CerrarTratoAgenteUseCase — execution', () => {
  it('ACEPTACION: AceptaciónInbound as AGENTE, motivo audited, then the confirmation is sent', async () => {
    const mundo = construirMundo();
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION', 0.9),
      config: mundo.config,
    });

    expect(resultado).toEqual({ cerrado: true, tipo: 'ACEPTACION', confirmacion: 'ENVIADA', mensajeId: 101 });
    expect(mundo.transiciones).toHaveLength(1);
    const bundle = mundo.transiciones[0];
    expect(bundle?.evento).toBe('AceptaciónInbound');
    expect(bundle?.usuario).toBe(USUARIO_AGENTE);
    expect(USUARIO_AGENTE).toBe('La Guía (agente)');
    expect(bundle?.motivo).toBe('Cierre autónomo de La Guía: ACEPTACION (confianza 0.90)');
    expect(bundle?.estadoNuevo).toEqual({ flujo: 'OUTBOUND', etapa: 'ACEPTADO' });
    expect(bundle?.resultado).toBe('AceptaciónOutbound');
    expect(mundo.cambiosTipo).toHaveLength(0);
  });

  it('CONFIRMACION_PRESENTACION: ConfirmaciónPresentación (T4) with the same motivo style', async () => {
    const mundo = construirMundo({ pipeline: pipelineBase('INBOUND', 'PRESENTACION') });
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('CONFIRMACION_PRESENTACION', 0.85),
      config: mundo.config,
    });

    expect(resultado).toMatchObject({ cerrado: true, tipo: 'CONFIRMACION_PRESENTACION', confirmacion: 'ENVIADA' });
    const bundle = mundo.transiciones[0];
    expect(bundle?.evento).toBe('ConfirmaciónPresentación');
    expect(bundle?.usuario).toBe(USUARIO_AGENTE);
    expect(bundle?.motivo).toBe('Cierre autónomo de La Guía: CONFIRMACION_PRESENTACION (confianza 0.85)');
    expect(bundle?.estadoNuevo).toEqual({ flujo: 'INBOUND', etapa: 'CONFIRMADA' });
    expect(bundle?.resultado).toBe('ConfirmaciónPresentación');
    expect(bundle?.motivo?.length).toBeLessThanOrEqual(300);
  });

  it('CONVERSION_CLIENTE: Prospecto→Cliente via cambiarTipo, no stage change, emits the conversion', async () => {
    const mundo = construirMundo({ pipeline: pipelineBase('INBOUND', 'SEGUIMIENTO') });
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('CONVERSION_CLIENTE', 0.95),
      config: mundo.config,
    });

    expect(resultado).toMatchObject({ cerrado: true, tipo: 'CONVERSION_CLIENTE', confirmacion: 'ENVIADA' });
    expect(mundo.transiciones).toHaveLength(0);
    expect(mundo.cambiosTipo).toEqual([
      {
        empresaId: 42,
        nuevoTipo: 'Cliente',
        usuario: USUARIO_AGENTE,
        hoy: '2026-06-01',
        convertir: true,
      },
    ]);
    expect(mundo.pipelineActual()?.etapa).toBe('SEGUIMIENTO');
  });

  it('sends the deterministic confirmation text per tipo through the outbox-lite pattern', async () => {
    const casos: Array<[TipoCierreAgente, PipelineEmpresa]> = [
      ['ACEPTACION', pipelineBase('OUTBOUND', 'CADENCIA')],
      ['CONFIRMACION_PRESENTACION', pipelineBase('INBOUND', 'PRESENTACION')],
      ['CONVERSION_CLIENTE', pipelineBase('INBOUND', 'SEGUIMIENTO')],
    ];
    for (const [tipo, pipeline] of casos) {
      const mundo = construirMundo({ pipeline });
      await mundo.useCase.execute({ conversacionId: 5, senal: senal(tipo), config: mundo.config });

      expect(mundo.mensajesCreados).toEqual([
        {
          conversacionId: 5,
          direccion: 'OUT',
          emisor: 'IA',
          cuerpo: TEXTO_CONFIRMACION_CIERRE[tipo],
          tipo: 'TEXTO',
          canal: 'WHATSAPP',
          estadoEnvio: 'PENDIENTE',
          wamid: null,
          idempotenciaKey: null,
          fuentes: '[]',
          score: null,
          fidelidad: null,
          modelo: null,
          promptVersion: null,
        },
      ]);
      expect(mundo.envios).toEqual([{ telefonoE164: TELEFONO, cuerpo: TEXTO_CONFIRMACION_CIERRE[tipo] }]);
      expect(mundo.actualizaciones).toEqual([{ id: 101, estadoEnvio: 'ENVIADO', wamid: 'wamid.ABC' }]);
      expect(mundo.actividad).toEqual([{ id: 5, direccion: 'OUT' }]);
    }
  });

  it('confirmation texts are fixed Spanish copy without prices/dates promises', () => {
    expect(TEXTO_CONFIRMACION_CIERRE.ACEPTACION).toContain('asesor de Holomedic');
    for (const texto of Object.values(TEXTO_CONFIRMACION_CIERRE)) {
      expect(texto.length).toBeGreaterThan(20);
      expect(texto).not.toMatch(/S\/|\$|\d/);
    }
  });

  it('ordering: the state change is persisted BEFORE the message intent and the send', async () => {
    const mundo = construirMundo();
    await mundo.useCase.execute({ conversacionId: 5, senal: senal('ACEPTACION'), config: mundo.config });

    expect(mundo.eventos).toEqual([
      'transicion',
      'crearMensaje',
      'enviar',
      'actualizarEnvio:ENVIADO',
      'actividad',
    ]);
  });

  it('CONVERSION ordering: cambiarTipo before the send', async () => {
    const mundo = construirMundo({ pipeline: pipelineBase('INBOUND', 'SEGUIMIENTO') });
    await mundo.useCase.execute({ conversacionId: 5, senal: senal('CONVERSION_CLIENTE'), config: mundo.config });

    expect(mundo.eventos.slice(0, 3)).toEqual(['cambiarTipo', 'crearMensaje', 'enviar']);
  });

  it('a throwing transition propagates and nothing is sent or persisted as a message', async () => {
    const mundo = construirMundo();
    mundo.fallar.transicion = new Error('db down');

    await expect(
      mundo.useCase.execute({ conversacionId: 5, senal: senal('ACEPTACION'), config: mundo.config }),
    ).rejects.toThrow('db down');

    expect(mundo.mensajesCreados).toHaveLength(0);
    expect(mundo.envios).toHaveLength(0);
    expect(mundo.actividad).toHaveLength(0);
  });
});

// ---- Failure tolerance after the close is registered ----

describe('CerrarTratoAgenteUseCase — send failures never undo the close', () => {
  it('send failure ⇒ cerrado true + FALLIDA, message marked FALLIDO, close not undone', async () => {
    const mundo = construirMundo({
      envio: { ok: false, error: 'KAPSO_ERROR', detalle: 'detalle con +51987654321' },
    });
    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION'),
      config: mundo.config,
    });

    expect(resultado).toEqual({ cerrado: true, tipo: 'ACEPTACION', confirmacion: 'FALLIDA', mensajeId: 101 });
    expect(mundo.actualizaciones).toEqual([{ id: 101, estadoEnvio: 'FALLIDO' }]);
    expect(mundo.pipelineActual()?.etapa).toBe('ACEPTADO');
  });

  it('send failure + failing FALLIDO mark still returns FALLIDA (best-effort)', async () => {
    const mundo = construirMundo({ envio: { ok: false, error: 'KAPSO_TIMEOUT', detalle: 'x' } });
    mundo.fallar.actualizarEnvio = new Error('mark failed');

    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION'),
      config: mundo.config,
    });

    expect(resultado).toMatchObject({ cerrado: true, confirmacion: 'FALLIDA', mensajeId: 101 });
  });

  it('whatsapp.enviar throwing ⇒ cerrado true + FALLIDA and the row is marked FALLIDO', async () => {
    const mundo = construirMundo();
    mundo.enviarMock.mockRejectedValueOnce(new Error('network'));

    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION'),
      config: mundo.config,
    });

    expect(resultado).toMatchObject({ cerrado: true, confirmacion: 'FALLIDA', mensajeId: 101 });
    expect(mundo.actualizaciones).toEqual([{ id: 101, estadoEnvio: 'FALLIDO' }]);
  });

  it('mensajes.crear throwing ⇒ cerrado true + FALLIDA with mensajeId null, nothing sent', async () => {
    const mundo = construirMundo();
    mundo.fallar.crearMensaje = new Error('insert failed');

    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION'),
      config: mundo.config,
    });

    expect(resultado).toEqual({ cerrado: true, tipo: 'ACEPTACION', confirmacion: 'FALLIDA', mensajeId: null });
    expect(mundo.envios).toHaveLength(0);
    expect(mundo.transiciones).toHaveLength(1);
  });

  it('a failing post-send confirmation or activity tick keeps ENVIADA (the message went out)', async () => {
    const mundo = construirMundo();
    mundo.fallar.actualizarEnvio = new Error('confirm failed');
    mundo.fallar.actividad = new Error('tick failed');

    const resultado = await mundo.useCase.execute({
      conversacionId: 5,
      senal: senal('ACEPTACION'),
      config: mundo.config,
    });

    expect(resultado).toEqual({ cerrado: true, tipo: 'ACEPTACION', confirmacion: 'ENVIADA', mensajeId: 101 });
    expect(mundo.envios).toHaveLength(1);
  });

  it('logs only ids/codes — never the phone number nor the body', async () => {
    const mundo = construirMundo({
      envio: { ok: false, error: 'KAPSO_ERROR', detalle: `fallo enviando a ${TELEFONO}` },
    });
    mundo.fallar.actualizarEnvio = new Error(`mark failed ${TELEFONO}`);
    mundo.fallar.actividad = new Error(`tick failed ${TELEFONO}`);
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await mundo.useCase.execute({ conversacionId: 5, senal: senal('ACEPTACION'), config: mundo.config });

    const volcado = JSON.stringify([...errorSpy.mock.calls, ...aviso.mock.calls]);
    expect(errorSpy).toHaveBeenCalled();
    expect(volcado).not.toContain('51987654321');
    expect(volcado).not.toContain(TEXTO_CONFIRMACION_CIERRE.ACEPTACION);
    expect(volcado).not.toContain('Gracias');
    aviso.mockRestore();
  });

  it('logs the failed intent persist without leaking the phone', async () => {
    const mundo = construirMundo();
    mundo.fallar.crearMensaje = new Error(`insert failed ${TELEFONO}`);

    await mundo.useCase.execute({ conversacionId: 5, senal: senal('ACEPTACION'), config: mundo.config });

    expect(errorSpy).toHaveBeenCalled();
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('51987654321');
  });
});

// ---- Idempotency ----

describe('CerrarTratoAgenteUseCase — idempotency', () => {
  it('repeating the same signal after success ⇒ CIERRE_NO_APLICA and ONE message only', async () => {
    const mundo = construirMundo();
    const entrada = { conversacionId: 5, senal: senal('ACEPTACION'), config: mundo.config };

    const primero = await mundo.useCase.execute(entrada);
    const segundo = await mundo.useCase.execute(entrada);

    expect(primero.cerrado).toBe(true);
    expect(segundo).toEqual({ cerrado: false, motivo: 'CIERRE_NO_APLICA' });
    expect(mundo.transiciones).toHaveLength(1);
    expect(mundo.mensajesCreados).toHaveLength(1);
    expect(mundo.envios).toHaveLength(1);
  });

  it('repeating CONVERSION_CLIENTE after success is a no-op (already Cliente)', async () => {
    const mundo = construirMundo({ pipeline: pipelineBase('INBOUND', 'SEGUIMIENTO') });
    const entrada = { conversacionId: 5, senal: senal('CONVERSION_CLIENTE'), config: mundo.config };

    await mundo.useCase.execute(entrada);
    const segundo = await mundo.useCase.execute(entrada);

    expect(segundo).toEqual({ cerrado: false, motivo: 'CIERRE_NO_APLICA' });
    expect(mundo.cambiosTipo).toHaveLength(1);
    expect(mundo.mensajesCreados).toHaveLength(1);
  });
});
