import { describe, expect, it, vi } from 'vitest';

/**
 * Dashboard de captura (REQ-F1-11, ADR-5). Read model pinned here:
 *
 *  - `marcaciones` = the punches of the calendar date (naive Lima).
 *  - `alertas` = the DB's recent alerts MERGED with the synthetic
 *    WORKER_CAIADO entries the dashboard evaluates ON READ: a device
 *    whose ultimaSincronizacion is older than WORKER_CAIDO_SEG (read
 *    from dbo.parametros_sistema, seeded 600 fallback) is down. F1 has
 *    no scheduler — the read-side evaluation is the design (ADR-5).
 *  - The threshold comparison is STRICTLY older: a device exactly at
 *    the threshold is still alive.
 */
import { ListarDashboardUseCase, type VistaAlerta } from '../listarDashboard';
import type {
  IAlertaRepository,
  IDispositivoRepository,
  IMarcacionRepository,
  IParametroRepository,
} from '../../domain/ports';
import type { Alerta, MarcacionRaw } from '../../domain/entities';

// ---- Contract-faithful fakes ----

class FakeMarcaciones implements IMarcacionRepository {
  constructor(private readonly delDia: MarcacionRaw[]) {}
  readonly llamadas: string[] = [];
  async listarDelDia(fecha: string): Promise<MarcacionRaw[]> {
    this.llamadas.push(fecha);
    return this.delDia;
  }
  insertarLote = vi.fn(
    async (): Promise<{ insertados: number; userIdsDesconocidos: string[] }> => ({
      insertados: 0,
      userIdsDesconocidos: [],
    }),
  );
  buscar = vi.fn(async (): Promise<MarcacionRaw[]> => []);
  reasignarEmpleado = vi.fn(async (): Promise<number> => 0);
}

class FakeAlertas implements IAlertaRepository {
  constructor(private readonly bd: Alerta[]) {}
  readonly limites: number[] = [];
  async recientes(limite: number): Promise<Alerta[]> {
    this.limites.push(limite);
    return this.bd;
  }
  crear = vi.fn(async (): Promise<void> => undefined);
}

class FakeDispositivos implements IDispositivoRepository {
  constructor(
    private readonly lista: { id: number; codigo: string; ultimaSincronizacion: Date | null }[],
  ) {}
  async estados() {
    return this.lista;
  }
  porTokenHash = vi.fn(async (): Promise<null> => null);
  registrarHeartbeat = vi.fn(async (): Promise<Date> => new Date());
}

class FakeParametros implements IParametroRepository {
  constructor(private readonly valores: Record<string, string | null> = {}) {}
  async valor(clave: string): Promise<string | null> {
    return clave in this.valores ? (this.valores[clave] ?? null) : null;
  }
}

// ---- Fixtures ----

const AHORA = new Date('2026-09-02T08:30:00');

function makeMarcacion(id: number, userId: string): MarcacionRaw {
  return {
    id,
    dispositivoId: 1,
    userId,
    empleadoId: null,
    fechaHora: new Date(`2026-09-02T0${id}:0${id}:00`),
    punch: 0,
    tipoVerificacion: 'HUELLA',
    procesada: false,
    createdAt: new Date('2026-09-02T08:00:00'),
  };
}

function makeAlerta(id: number, tipo: string): Alerta {
  return {
    id,
    tipo,
    empleadoId: null,
    dispositivoId: null,
    detalle: `alerta ${id}`,
    fecha: new Date('2026-09-02T07:00:00'),
    atendida: false,
  };
}

function makeUseCase(opciones: {
  marcaciones?: MarcacionRaw[];
  alertas?: Alerta[];
  estados?: { id: number; codigo: string; ultimaSincronizacion: Date | null }[];
  parametros?: Record<string, string | null>;
} = {}) {
  const marcaciones = new FakeMarcaciones(opciones.marcaciones ?? []);
  const alertas = new FakeAlertas(opciones.alertas ?? []);
  const dispositivos = new FakeDispositivos(opciones.estados ?? []);
  const parametros = new FakeParametros(
    opciones.parametros ?? { WORKER_CAIDO_SEG: '600' },
  );
  const useCase = new ListarDashboardUseCase({ marcaciones, alertas, dispositivos, parametros });
  return { useCase, marcaciones, alertas, dispositivos, parametros };
}

function sinteticas(resultado: { alertas: VistaAlerta[] }): VistaAlerta[] {
  return resultado.alertas.filter((a) => a.tipo === 'WORKER_CAIADO');
}

// ---- Tests ----

describe('ListarDashboardUseCase', () => {
  it('entrega las marcas del día (consultadas con la fecha naive de hoy) y las alertas recientes de la BD', async () => {
    const marcas = [makeMarcacion(1, 'U001'), makeMarcacion(2, 'U002'), makeMarcacion(3, 'U003')];
    const alertasBd = [makeAlerta(9, 'USER_ID_DESCONOCIDO'), makeAlerta(8, 'DRIFT_RELOJ')];
    const { useCase, marcaciones, alertas } = makeUseCase({
      marcaciones: marcas,
      alertas: alertasBd,
      estados: [{ id: 1, codigo: 'K20-SEDE-01', ultimaSincronizacion: new Date('2026-09-02T08:29:00') }],
    });

    const resultado = await useCase.execute(AHORA);

    expect(marcaciones.llamadas).toEqual(['2026-09-02']);
    expect(resultado.fecha).toBe('2026-09-02');
    expect(resultado.marcaciones).toHaveLength(3);
    const bd = resultado.alertas.filter((a) => a.tipo !== 'WORKER_CAIADO');
    expect(bd).toHaveLength(2);
    expect(bd[0]?.tipo).toBe('USER_ID_DESCONOCIDO');
    expect(alertas.limites).toEqual([50]);
  });

  it('ultimaSincronizacion con antigüedad 753s > WORKER_CAIDO_SEG 600 → UNA WORKER_CAIADO sintética con el código del dispositivo', async () => {
    // 08:17:27 → 08:30:00 = 753s de antigüedad
    const { useCase } = makeUseCase({
      estados: [{ id: 1, codigo: 'K20-SEDE-01', ultimaSincronizacion: new Date('2026-09-02T08:17:27') }],
    });
    const resultado = await useCase.execute(AHORA);
    const sintetica = sinteticas(resultado);
    expect(sintetica).toHaveLength(1);
    expect(sintetica[0]?.tipo).toBe('WORKER_CAIADO');
    expect(sintetica[0]?.detalle).toContain('K20-SEDE-01');
    expect(sintetica[0]?.dispositivoId).toBe(1);
  });

  it('dispositivo fresco (45s < umbral) → sin WORKER_CAIADO', async () => {
    const { useCase } = makeUseCase({
      estados: [{ id: 1, codigo: 'K20-SEDE-01', ultimaSincronizacion: new Date('2026-09-02T08:29:15') }],
    });
    const resultado = await useCase.execute(AHORA);
    expect(sinteticas(resultado)).toHaveLength(0);
    expect(resultado.alertas).toHaveLength(0);
  });

  it('antigüedad EXACTAMENTE en el umbral (600s) → sin alerta (solo el exceso estricto)', async () => {
    const { useCase } = makeUseCase({
      estados: [{ id: 1, codigo: 'K20-SEDE-01', ultimaSincronizacion: new Date('2026-09-02T08:20:00') }],
    });
    const resultado = await useCase.execute(AHORA);
    expect(sinteticas(resultado)).toHaveLength(0);
  });

  it('el umbral se lee del parámetro WORKER_CAIDO_SEG (no hardcodeado): umbral 60 → antigüedad 75 alarma', async () => {
    const { useCase } = makeUseCase({
      parametros: { WORKER_CAIDO_SEG: '60' },
      estados: [{ id: 1, codigo: 'K20-SEDE-01', ultimaSincronizacion: new Date('2026-09-02T08:28:45') }],
    });
    const resultado = await useCase.execute(AHORA);
    expect(sinteticas(resultado)).toHaveLength(1);
  });

  it('parámetro ausente → usa el 600 sembrado por defecto (antigüedad 753 alarma)', async () => {
    const { useCase } = makeUseCase({
      parametros: {},
      estados: [{ id: 1, codigo: 'K20-SEDE-01', ultimaSincronizacion: new Date('2026-09-02T08:17:27') }],
    });
    const resultado = await useCase.execute(AHORA);
    expect(sinteticas(resultado)).toHaveLength(1);
  });

  it('dispositivo que nunca sincronizó (NULL) → WORKER_CAIADO "sin sincronización registrada"', async () => {
    const { useCase } = makeUseCase({
      estados: [{ id: 2, codigo: 'K20-SEDE-02', ultimaSincronizacion: null }],
    });
    const resultado = await useCase.execute(AHORA);
    const sintetica = sinteticas(resultado);
    expect(sintetica).toHaveLength(1);
    expect(sintetica[0]?.detalle).toContain('K20-SEDE-02');
    expect(sintetica[0]?.detalle).toContain('nunca');
  });

  it('flota mixta: caído + fresco → solo el caído se marca; las alertas BD y las sintéticas conviven', async () => {
    const { useCase } = makeUseCase({
      alertas: [makeAlerta(9, 'USER_ID_DESCONOCIDO')],
      estados: [
        { id: 1, codigo: 'K20-SEDE-01', ultimaSincronizacion: new Date('2026-09-02T08:17:27') },
        { id: 2, codigo: 'K20-SEDE-02', ultimaSincronizacion: new Date('2026-09-02T08:30:00') },
      ],
    });
    const resultado = await useCase.execute(AHORA);
    expect(resultado.alertas).toHaveLength(2);
    expect(sinteticas(resultado).map((a) => a.dispositivoId)).toEqual([1]);
    expect(resultado.alertas.some((a) => a.tipo === 'USER_ID_DESCONOCIDO')).toBe(true);
  });
});
