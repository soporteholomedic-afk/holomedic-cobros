import { describe, expect, it, vi } from 'vitest';

/**
 * CompletarFicha use case (REQ-F1-10). Orchestration pinned here:
 *
 *  1. Validate the RRHH input (dni/apellidos/area/fechaIngreso required,
 *     fechaIngreso ISO calendar date) — a rejected input reaches NO port.
 *  2. `empleados.completar` writes the ficha and moves it to ACTIVO.
 *  3. `marcaciones.reasignarEmpleado` backfills the punches that arrived
 *     before the ficha existed (empleadoId NULL → the ficha's id) using
 *     the ficha's device userId.
 *  4. `auditoria.registrar` appends the dbo.auditoria row: UPDATE over
 *     empleados, with usuarioId = session sub (dbo.usuarios.idUsuario,
 *     NVARCHAR(50)) so RRHH mutations are attributable.
 */
import { CompletarFichaUseCase, FichaInvalidaError } from '../completarFicha';
import type {
  IAuditoriaRepository,
  IEmpleadoRepository,
  IMarcacionRepository,
} from '../../domain/ports';
import type { DatosFicha, Empleado, EntradaAuditoria } from '../../domain/entities';

// ---- Contract-faithful fakes ----

class FakeEmpleados implements IEmpleadoRepository {
  readonly completarLlamadas: { id: number; datos: DatosFicha }[] = [];
  constructor(private readonly ficha: Empleado | Error) {}

  async completar(id: number, datos: DatosFicha): Promise<Empleado> {
    this.completarLlamadas.push({ id, datos });
    if (this.ficha instanceof Error) throw this.ficha;
    return this.ficha;
  }

  upsertPendientes = vi.fn(async (): Promise<number> => 0);
  pendientes = vi.fn(async (): Promise<Empleado[]> => []);
}

class FakeMarcaciones implements IMarcacionRepository {
  readonly reasignarLlamadas: { userId: string; empleadoId: number }[] = [];
  constructor(private readonly reasignadas: number) {}

  async reasignarEmpleado(userId: string, empleadoId: number): Promise<number> {
    this.reasignarLlamadas.push({ userId, empleadoId });
    return this.reasignadas;
  }

  insertarLote = vi.fn(
    async (): Promise<{ insertados: number; userIdsDesconocidos: string[] }> => ({
      insertados: 0,
      userIdsDesconocidos: [],
    }),
  );
  listarDelDia = vi.fn(async (): Promise<never> => {
    throw new Error('no aplicable en este suite');
  });
  buscar = vi.fn(async (): Promise<never> => {
    throw new Error('no aplicable en este suite');
  });
}

class FakeAuditoria implements IAuditoriaRepository {
  readonly entradas: EntradaAuditoria[] = [];
  async registrar(entrada: EntradaAuditoria): Promise<void> {
    this.entradas.push(entrada);
  }
}

// ---- Fixtures ----

const USUARIO_SESION = 'b3f1c9a0-7d2e-4f6a-9b8c-1e0d5a7f3c21';

function makeFicha(): Empleado {
  return {
    id: 5,
    userId: 'U001',
    dni: '12345678',
    nombres: 'Juan',
    apellidos: 'Pérez',
    area: 'Enfermería',
    cargo: null,
    fechaIngreso: '2026-08-01',
    fechaBaja: null,
    estado: 'ACTIVO',
    modoExtras: 'PAGAR',
    createdAt: new Date('2026-09-01T08:00:00'),
    updatedAt: new Date('2026-09-01T08:05:00'),
  };
}

function makeDatos(overrides: Partial<DatosFicha> = {}): DatosFicha {
  return {
    dni: '12345678',
    apellidos: 'Pérez',
    area: 'Enfermería',
    fechaIngreso: '2026-08-01',
    ...overrides,
  };
}

function makeUseCase(opciones: { ficha?: Empleado | Error; reasignadas?: number } = {}) {
  const empleados = new FakeEmpleados(opciones.ficha ?? makeFicha());
  const marcaciones = new FakeMarcaciones(opciones.reasignadas ?? 0);
  const auditoria = new FakeAuditoria();
  const useCase = new CompletarFichaUseCase({ empleados, marcaciones, auditoria });
  return { useCase, empleados, marcaciones, auditoria };
}

// ---- Tests ----

describe('CompletarFichaUseCase', () => {
  it('válido → empleado ACTIVO y la secuencia exacta completar → reasignar → auditar', async () => {
    const eventos: string[] = [];
    const { useCase, empleados, marcaciones, auditoria } = makeUseCase();
    empleados.completar = async () => {
      eventos.push('completar');
      return makeFicha();
    };
    marcaciones.reasignarEmpleado = async (userId) => {
      eventos.push(`reasignar:${userId}`);
      return 0;
    };
    auditoria.registrar = async () => {
      eventos.push('auditar');
    };

    const resultado = await useCase.execute(5, makeDatos(), USUARIO_SESION);

    expect(resultado.empleado.estado).toBe('ACTIVO');
    expect(resultado.empleado.id).toBe(5);
    expect(eventos).toEqual(['completar', 'reasignar:U001', 'auditar']);
  });

  it('backfill: reasignarEmpleado(userId de la ficha, id) y el conteo fluye al resultado', async () => {
    const { useCase, marcaciones } = makeUseCase({ reasignadas: 10 });
    const resultado = await useCase.execute(5, makeDatos(), USUARIO_SESION);
    expect(marcaciones.reasignarLlamadas).toEqual([{ userId: 'U001', empleadoId: 5 }]);
    expect(resultado.marcacionesReasignadas).toBe(10);
  });

  it('auditoría: UPDATE sobre empleados con registroId, datosNuevos JSON (estado ACTIVO) y usuarioId de sesión (NVARCHAR(50))', async () => {
    const { useCase, auditoria } = makeUseCase();
    await useCase.execute(5, makeDatos(), USUARIO_SESION);
    expect(auditoria.entradas).toHaveLength(1);
    const entrada = auditoria.entradas[0];
    expect(entrada.tabla).toBe('empleados');
    expect(entrada.registroId).toBe(5);
    expect(entrada.accion).toBe('UPDATE');
    expect(entrada.usuarioId).toBe(USUARIO_SESION);
    const nuevos = JSON.parse(entrada.datosNuevos ?? '{}') as { estado?: string; id?: number };
    expect(nuevos.estado).toBe('ACTIVO');
    expect(nuevos.id).toBe(5);
  });

  it('sin DNI → FichaInvalidaError y NINGUNA llamada a los puertos', async () => {
    const { useCase, empleados, marcaciones, auditoria } = makeUseCase();
    await expect(useCase.execute(5, makeDatos({ dni: '' }), USUARIO_SESION)).rejects.toBeInstanceOf(
      FichaInvalidaError,
    );
    expect(empleados.completarLlamadas).toHaveLength(0);
    expect(marcaciones.reasignarLlamadas).toHaveLength(0);
    expect(auditoria.entradas).toHaveLength(0);
  });

  it('fechaIngreso fuera del formato YYYY-MM-DD → FichaInvalidaError sin tocar puertos', async () => {
    const { useCase, empleados } = makeUseCase();
    await expect(
      useCase.execute(5, makeDatos({ fechaIngreso: '01/08/2026' }), USUARIO_SESION),
    ).rejects.toBeInstanceOf(FichaInvalidaError);
    expect(empleados.completarLlamadas).toHaveLength(0);
  });

  it('espacios en los campos se recortan antes de persistir', async () => {
    const { useCase, empleados } = makeUseCase();
    await useCase.execute(5, makeDatos({ dni: ' 12345678 ', apellidos: ' Pérez ' }), USUARIO_SESION);
    const llamada = empleados.completarLlamadas[0];
    expect(llamada?.id).toBe(5);
    expect(llamada?.datos.dni).toBe('12345678');
    expect(llamada?.datos.apellidos).toBe('Pérez');
  });

  it('ficha inexistente (completar falla) → el error propaga y NO se audita ni reasigna', async () => {
    const { useCase, marcaciones, auditoria } = makeUseCase({
      ficha: new Error('la ficha 99 no existe en dbo.empleados'),
    });
    await expect(useCase.execute(99, makeDatos(), USUARIO_SESION)).rejects.toThrow('no existe');
    expect(marcaciones.reasignarLlamadas).toHaveLength(0);
    expect(auditoria.entradas).toHaveLength(0);
  });

  it('opcionales nombres/cargo presentes se recortan y viajan en los datos', async () => {
    const { useCase, empleados } = makeUseCase();
    await useCase.execute(
      5,
      makeDatos({ nombres: ' Juan Carlos ', cargo: ' Enfermero ' }),
      USUARIO_SESION,
    );
    const llamada = empleados.completarLlamadas[0];
    expect(llamada?.datos.nombres).toBe('Juan Carlos');
    expect(llamada?.datos.cargo).toBe('Enfermero');
  });
});
