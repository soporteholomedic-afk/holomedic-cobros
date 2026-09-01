import { describe, expect, it, vi } from 'vitest';

/**
 * Heartbeat use case (REQ-F1-03/09, ADR-1). Orchestration pinned here:
 *
 *  1. `registrarHeartbeat` stamps the device's ultimaSincronizacion and
 *     answers the server time.
 *  2. `drift_seg` greater than the seeded TARDANZA_ALARMA_RELOJ_SEG
 *     parameter raises ONE DRIFT_RELOJ alert (strictly greater — a drift
 *     equal to the threshold is tolerated). The threshold is READ from
 *     dbo.parametros_sistema, with the seeded 60 as documented fallback.
 *  3. The worker's user report rides the same heartbeat (ADR-1); the
 *     upsert creates ONLY missing fichas (R5) so a re-sync converges to
 *     zero new rows without errors.
 */
import { HeartbeatUseCase } from '../heartbeat';
import type {
  IAlertaRepository,
  IDispositivoRepository,
  IEmpleadoRepository,
  IParametroRepository,
} from '../../domain/ports';
import type { Alerta, Dispositivo, Empleado, UsuarioEquipo } from '../../domain/entities';

// ---- Contract-faithful fakes ----

class FakeDispositivos implements IDispositivoRepository {
  readonly llamadas: number[] = [];
  constructor(private readonly ahora: Date = new Date('2026-09-01T08:30:00')) {}

  async registrarHeartbeat(id: number): Promise<Date> {
    this.llamadas.push(id);
    return this.ahora;
  }

  porTokenHash = vi.fn(async (): Promise<Dispositivo | null> => null);
  estados = vi.fn(
    async (): Promise<{ id: number; codigo: string; ultimaSincronizacion: Date | null }[]> => [],
  );
}

class FakeAlertas implements IAlertaRepository {
  readonly creadas: { tipo: string; detalle: string; dispositivoId?: number }[] = [];

  async crear(tipo: string, detalle: string, dispositivoId?: number): Promise<void> {
    this.creadas.push({ tipo, detalle, dispositivoId });
  }

  recientes = vi.fn(async (): Promise<Alerta[]> => []);
}

class FakeEmpleados implements IEmpleadoRepository {
  private readonly existentes = new Set<string>([]);
  readonly llamadas: UsuarioEquipo[][] = [];

  async upsertPendientes(usuarios: UsuarioEquipo[]): Promise<number> {
    this.llamadas.push(usuarios);
    let creadas = 0;
    for (const u of usuarios) {
      if (this.existentes.has(u.userId)) continue;
      this.existentes.add(u.userId);
      creadas += 1;
    }
    return creadas;
  }

  pendientes = vi.fn(async (): Promise<Empleado[]> => []);
  completar = vi.fn(async (): Promise<Empleado> => {
    throw new Error('no aplicable en este suite');
  });
}

class FakeParametros implements IParametroRepository {
  constructor(private readonly valores: Record<string, string | null> = {}) {}
  async valor(clave: string): Promise<string | null> {
    return clave in this.valores ? (this.valores[clave] ?? null) : null;
  }
}

// ---- Fixtures ----

const HORA_SERVIDOR = new Date('2026-09-01T08:30:00');

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

function usuariosEquipo(n: number): UsuarioEquipo[] {
  return Array.from({ length: n }, (_, i) => ({ userId: `U${String(i + 1).padStart(3, '0')}`, nombre: `Usuario ${i + 1}` }));
}

function makeUseCase(opciones: { parametros?: Record<string, string | null> } = {}) {
  const dispositivos = new FakeDispositivos(HORA_SERVIDOR);
  const alertas = new FakeAlertas();
  const empleados = new FakeEmpleados();
  const parametros = new FakeParametros(
    opciones.parametros ?? { TARDANZA_ALARMA_RELOJ_SEG: '60' },
  );
  const useCase = new HeartbeatUseCase({ dispositivos, alertas, empleados, parametros });
  return { useCase, dispositivos, alertas, empleados, parametros };
}

// ---- Tests ----

describe('HeartbeatUseCase', () => {
  it('stamps ultimaSincronizacion: registrarHeartbeat con el id del dispositivo, responde su hora', async () => {
    const { useCase, dispositivos, alertas, empleados } = makeUseCase();
    const resultado = await useCase.execute(makeDispositivo(), {});
    expect(dispositivos.llamadas).toEqual([3]);
    expect(resultado.horaServidor).toBe(HORA_SERVIDOR);
    expect(alertas.creadas).toHaveLength(0);
    expect(empleados.llamadas).toHaveLength(0);
  });

  it('drift 75s > umbral 60s → UNA alerta DRIFT_RELOJ con el dispositivo', async () => {
    const { useCase, alertas } = makeUseCase();
    await useCase.execute(makeDispositivo(), { drift_seg: 75 });
    expect(alertas.creadas).toHaveLength(1);
    expect(alertas.creadas[0]?.tipo).toBe('DRIFT_RELOJ');
    expect(alertas.creadas[0]?.detalle).toContain('75');
    expect(alertas.creadas[0]?.dispositivoId).toBe(3);
  });

  it('drift 45s ≤ umbral → sin alerta', async () => {
    const { useCase, alertas } = makeUseCase();
    await useCase.execute(makeDispositivo(), { drift_seg: 45 });
    expect(alertas.creadas).toHaveLength(0);
  });

  it('drift 60s == umbral → sin alerta (solo el exceso estricto alarma)', async () => {
    const { useCase, alertas } = makeUseCase();
    await useCase.execute(makeDispositivo(), { drift_seg: 60 });
    expect(alertas.creadas).toHaveLength(0);
  });

  it('umbral leído de TARDANZA_ALARMA_RELOJ_SEG (no hardcodeado): umbral 30 → drift 45 alarma', async () => {
    const { useCase, alertas } = makeUseCase({ parametros: { TARDANZA_ALARMA_RELOJ_SEG: '30' } });
    await useCase.execute(makeDispositivo(), { drift_seg: 45 });
    expect(alertas.creadas).toHaveLength(1);
    expect(alertas.creadas[0]?.detalle).toContain('30');
  });

  it('parámetro ausente → usa el 60 sembrado por defecto (drift 75 alarma)', async () => {
    const { useCase, alertas } = makeUseCase({ parametros: {} });
    await useCase.execute(makeDispositivo(), { drift_seg: 75 });
    expect(alertas.creadas).toHaveLength(1);
    expect(alertas.creadas[0]?.tipo).toBe('DRIFT_RELOJ');
  });

  it('35 usuarios reportados → 1 upsert con los 35 {userId, nombre} (fichas PENDIENTE_FICHA vía repo)', async () => {
    const { useCase, empleados } = makeUseCase();
    const usuarios = usuariosEquipo(35);
    const resultado = await useCase.execute(makeDispositivo(), { usuarios });
    expect(empleados.llamadas).toEqual([usuarios]);
    for (const u of empleados.llamadas[0] ?? []) {
      expect(typeof u.userId).toBe('string');
      expect(u.nombre).toContain('Usuario');
    }
    expect(resultado.horaServidor).toBe(HORA_SERVIDOR);
  });

  it('re-sync de los mismos 35 usuarios → 0 fichas nuevas y sin errores', async () => {
    const { useCase, empleados } = makeUseCase();
    const usuarios = usuariosEquipo(35);
    await useCase.execute(makeDispositivo(), { usuarios });
    await useCase.execute(makeDispositivo(), { usuarios });
    expect(empleados.llamadas).toHaveLength(2);
    // The second pass found every ficha already present — nothing new.
    const creadasSegunda = await empleados.upsertPendientes(usuarios);
    expect(creadasSegunda).toBe(0);
  });

  it('heartbeat combinado (ADR-1): drift + usuarios en UN solo latido (un solo registrarHeartbeat)', async () => {
    const { useCase, dispositivos, alertas, empleados } = makeUseCase();
    await useCase.execute(makeDispositivo(), { drift_seg: 90, usuarios: usuariosEquipo(2) });
    expect(dispositivos.llamadas).toEqual([3]);
    expect(alertas.creadas).toHaveLength(1);
    expect(empleados.llamadas).toHaveLength(1);
  });

  it('usuarios vacío → no llama upsert', async () => {
    const { useCase, empleados } = makeUseCase();
    await useCase.execute(makeDispositivo(), { usuarios: [] });
    expect(empleados.llamadas).toHaveLength(0);
  });
});
