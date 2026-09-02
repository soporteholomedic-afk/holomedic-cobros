import { describe, expect, it, vi } from 'vitest';

/**
 * Ingest use case orchestration (REQ-F1-01/02/04): bulk-insert a punch
 * batch, raise USER_ID_DESCONOCIDO alerts — one per DISTINCT unknown
 * user_id, not per punch — then hand the device its claimed commands.
 *
 * The fakes are CONTRACT-FAITHFUL to `IMarcacionRepository` (see
 * ports.ts): empleadoId resolution includes fichas in ANY estado
 * (REQ-F1-02 — a PENDIENTE_FICHA ficha is a known user), and
 * `userIdsDesconocidos` lists only user_ids with NO ficha row at all.
 * The SQL-level half of that rule (the INSERT…SELECT join with no estado
 * filter) is pinned by the WU6 adapter suite; this suite pins that the
 * use case drives alerts strictly from the repository's unknown list.
 */
import { IngestarMarcacionesUseCase } from '../ingestarMarcaciones';
import type {
  IAlertaRepository,
  IComandoRepository,
  IMarcacionRepository,
  ResultadoConfirmacion,
} from '../../domain/ports';
import type { Comando, Dispositivo, MarcacionRaw, MarcacionWire } from '../../domain/entities';

// ---- Contract-faithful fakes ----

class FakeMarcaciones implements IMarcacionRepository {
  /** Persisted UNIQUE (userId, fechaHora, punch) keys — survives across calls. */
  private claves = new Set<string>();
  /** User_ids having a ficha row in ANY estado (REQ-F1-02). */
  private readonly userIdsConFicha: Set<string>;
  readonly llamadas: { dispositivoId: number; items: MarcacionWire[] }[] = [];

  constructor(userIdsConFicha: string[]) {
    this.userIdsConFicha = new Set(userIdsConFicha);
  }

  async insertarLote(
    dispositivoId: number,
    items: MarcacionWire[],
  ): Promise<{ insertados: number; userIdsDesconocidos: string[] }> {
    this.llamadas.push({ dispositivoId, items });
    const desconocidos = new Set<string>();
    let insertados = 0;
    for (const item of items) {
      const clave = `${item.user_id}|${item.fecha_hora}|${item.punch}`;
      if (this.claves.has(clave)) continue;
      this.claves.add(clave);
      insertados += 1;
      if (!this.userIdsConFicha.has(item.user_id)) desconocidos.add(item.user_id);
    }
    return { insertados, userIdsDesconocidos: [...desconocidos].sort() };
  }

  listarDelDia = vi.fn(async (): Promise<MarcacionRaw[]> => []);
  buscar = vi.fn(async (): Promise<MarcacionRaw[]> => []);
  reasignarEmpleado = vi.fn(async (): Promise<number> => 0);
}

function makeAlertas() {
  const creadas: { tipo: string; detalle: string; dispositivoId?: number }[] = [];
  const repo: IAlertaRepository = {
    crear: async (tipo: string, detalle: string, dispositivoId?: number) => {
      creadas.push({ tipo, detalle, dispositivoId });
    },
    recientes: vi.fn(async () => []),
  };
  return { repo, creadas };
}

function makeComandos(reclamados: Comando[]) {
  const llamadas: number[] = [];
  const repo: IComandoRepository = {
    pendientesYMarcarEnviados: async (dispositivoId: number) => {
      llamadas.push(dispositivoId);
      return reclamados;
    },
    confirmar: vi.fn(
      async (): Promise<ResultadoConfirmacion> => ({ estado: 'CONFIRMADO', confirmadoAt: null }),
    ),
  };
  return { repo, llamadas };
}

// ---- Fixtures ----

function makeDispositivo(): Dispositivo {
  return {
    id: 3,
    codigo: 'K20-SEDE-01',
    sede: 'Sede Central',
    ip: '192.168.10.44',
    activo: true,
    ultimaSincronizacion: null,
    createdAt: new Date('2026-09-01T08:00:00'),
    updatedAt: new Date('2026-09-01T08:00:00'),
  };
}

function marcacion(user_id: string, punch: number): MarcacionWire {
  return { user_id, fecha_hora: '2026-09-01T08:00:00', punch, tipo_verificacion: 'HUELLA' };
}

function lote(n: number, user_id = 'U001'): MarcacionWire[] {
  return Array.from({ length: n }, (_, i) => marcacion(user_id, i + 1));
}

function comandoReclamado(overrides: Partial<Comando> = {}): Comando {
  return {
    id: 11,
    dispositivoId: 3,
    tipo: 'SET_TIME',
    payload: '{"drift_seg":75}',
    estado: 'ENVIADO',
    createdAt: new Date('2026-09-01T08:00:00'),
    enviadoAt: new Date('2026-09-01T08:01:00'),
    confirmadoAt: null,
    ...overrides,
  };
}

function makeUseCase(opciones: {
  fichas?: string[];
  previas?: MarcacionWire[];
  reclamados?: Comando[];
}) {
  const marcaciones = new FakeMarcaciones(opciones.fichas ?? ['U001', 'U002']);
  for (const previa of opciones.previas ?? []) {
    // Seed persisted duplicates without going through the counting path.
    void marcaciones.insertarLote(3, [previa]);
    marcaciones.llamadas.length = 0;
  }
  const alertas = makeAlertas();
  const comandos = makeComandos(opciones.reclamados ?? []);
  const useCase = new IngestarMarcacionesUseCase({
    marcaciones,
    alertas: alertas.repo,
    comandos: comandos.repo,
  });
  return { useCase, marcaciones, alertas, comandos };
}

// ---- Tests ----

describe('IngestarMarcacionesUseCase', () => {
  it('lote nuevo: 120 recibidos / 120 insertados / 0 duplicados', async () => {
    const { useCase, marcaciones } = makeUseCase({});
    const items = lote(120, 'U001');
    const resultado = await useCase.execute(makeDispositivo(), items);
    expect(resultado.recibidos).toBe(120);
    expect(resultado.insertados).toBe(120);
    expect(resultado.duplicados).toBe(0);
    expect(marcaciones.llamadas).toEqual([{ dispositivoId: 3, items }]);
  });

  it('lote mixto: 118 nuevas + 2 ya persistidas → insertados 118, duplicados 2', async () => {
    const repetidaA = marcacion('U001', 500);
    const repetidaB = marcacion('U002', 501);
    const { useCase } = makeUseCase({ previas: [repetidaA, repetidaB] });
    const items = [...lote(118, 'U001'), repetidaA, repetidaB];
    const resultado = await useCase.execute(makeDispositivo(), items);
    expect(resultado.recibidos).toBe(120);
    expect(resultado.insertados).toBe(118);
    expect(resultado.duplicados).toBe(2);
  });

  it('reenvío idempotente: el mismo lote dos veces → la segunda 0 insertados / 120 duplicados', async () => {
    const { useCase } = makeUseCase({});
    const items = lote(120, 'U001');
    const primera = await useCase.execute(makeDispositivo(), items);
    expect(primera.insertados).toBe(120);
    const segunda = await useCase.execute(makeDispositivo(), items);
    expect(segunda.recibidos).toBe(120);
    expect(segunda.insertados).toBe(0);
    expect(segunda.duplicados).toBe(120);
  });

  it('alertas USER_ID_DESCONOCIDO: una por user_id DISTINTO (3+2 marcaciones → 2 alertas), con el dispositivo', async () => {
    const { useCase, alertas } = makeUseCase({
      fichas: ['U001'], // only U001 has a ficha; U404-A/U404-B are unknown
    });
    const items = [
      ...lote(3, 'U404-A'),
      ...lote(2, 'U404-B'),
      ...lote(1, 'U001'),
    ];
    const resultado = await useCase.execute(makeDispositivo(), items);
    expect(resultado.insertados).toBe(6);
    expect(alertas.creadas).toHaveLength(2);
    expect(alertas.creadas.map((a) => a.tipo)).toEqual([
      'USER_ID_DESCONOCIDO',
      'USER_ID_DESCONOCIDO',
    ]);
    const detalles = alertas.creadas.map((a) => a.detalle).join(' | ');
    expect(detalles).toContain('U404-A');
    expect(detalles).toContain('U404-B');
    for (const alerta of alertas.creadas) {
      expect(alerta.dispositivoId).toBe(3);
    }
  });

  it('REQ-F1-02: ficha PENDIENTE_FICHA TAMBIÉN es usuario conocido — cero alertas para ella', async () => {
    const { useCase, alertas } = makeUseCase({
      // PENDIENTE_FICHA fichas exist for both users (any estado = known).
      fichas: ['U001', 'U002'],
    });
    const items = [...lote(5, 'U001'), ...lote(5, 'U002')];
    const resultado = await useCase.execute(makeDispositivo(), items);
    expect(resultado.insertados).toBe(10);
    expect(alertas.creadas).toHaveLength(0);
  });

  it('user_id sin NINGUNA ficha sí genera su alerta (solo entonces es desconocido)', async () => {
    const { useCase, alertas } = makeUseCase({
      fichas: [], // no fichas at all
    });
    const resultado = await useCase.execute(makeDispositivo(), lote(2, 'U999'));
    expect(resultado.insertados).toBe(2);
    expect(alertas.creadas).toHaveLength(1);
    expect(alertas.creadas[0]?.tipo).toBe('USER_ID_DESCONOCIDO');
    expect(alertas.creadas[0]?.detalle).toContain('U999');
  });

  it('comandos: reclama PENDIENTE→ENVIADO una sola vez y los entrega en la respuesta', async () => {
    const reclamados = [
      comandoReclamado({ id: 11, tipo: 'SET_TIME' }),
      comandoReclamado({ id: 12, tipo: 'DESACTIVAR_USER', payload: '{"user_id":"U777"}' }),
    ];
    const { useCase, comandos } = makeUseCase({ reclamados });
    const resultado = await useCase.execute(makeDispositivo(), lote(1));
    expect(comandos.llamadas).toEqual([3]);
    expect(resultado.comandos).toHaveLength(2);
    expect(resultado.comandos[0]?.id).toBe(11);
    expect(resultado.comandos[0]?.tipo).toBe('SET_TIME');
    expect(resultado.comandos[1]?.id).toBe(12);
    expect(resultado.comandos[1]?.payload).toBe('{"user_id":"U777"}');
    for (const comando of resultado.comandos) {
      expect(comando.estado).toBe('ENVIADO');
    }
  });

  it('entrega: los CONFIRMADO no se reenvían (el reclamo solo toca PENDIENTE y ocurre una vez)', async () => {
    const { useCase, comandos } = makeUseCase({
      reclamados: [comandoReclamado({ estado: 'CONFIRMADO', confirmadoAt: new Date() })],
    });
    await useCase.execute(makeDispositivo(), lote(2));
    expect(comandos.llamadas).toHaveLength(1);
  });
});
