import { describe, expect, it } from 'vitest';

import type { GrupoEmpresaImportado } from '../../domain/importar/validarImportacion';
import type { ErrorFilaImport } from '../../domain/importar/validarImportacion';
import { ImportacionExcedeLimiteError } from '../../domain/importar/limiteFilas';
import { MAXIMO_FILAS_IMPORTACION } from '../../domain/importar/limiteFilas';
import type { CrmImportadorPort, RegistroImportacion, ResultadoGrupoImport } from '../../domain/ports';
import type { FilaImportCrm } from '../../domain/importar/columnas';
import { EjecutarImportacionUseCase } from '../importar/ejecutarImportacion';

/**
 * Use-case contract for the import EXECUTION (tasks pr6/WU2, spec G2):
 * the server re-validates EVERYTHING it is shown (never trusts
 * client-parsed rows), executes one CRM transaction PER RUC group —
 * so one bad group never rolls back valid groups — and always writes
 * the CRM_Importaciones job record with the accumulated counters.
 * Tested against an in-memory fake of `CrmImportadorPort` (hexagonal:
 * the SQL Server adapter is proven separately in importadorCrm.test.ts).
 */

/** In-memory fake of the import port: records calls, fails on demand. */
class FakeCrmImportador implements CrmImportadorPort {
  llamadas: Array<{ grupo: GrupoEmpresaImportado; usuario: string }> = [];
  registros: RegistroImportacion[] = [];
  fallarRucs = new Set<string>();
  modoPorRuc = new Map<string, 'crear' | 'actualizar'>();
  advertenciasPorRuc = new Map<string, ErrorFilaImport[]>();

  async ejecutarGrupo(grupo: GrupoEmpresaImportado, usuario: string): Promise<ResultadoGrupoImport> {
    this.llamadas.push({ grupo, usuario });
    if (this.fallarRucs.has(grupo.ruc)) throw new Error('fallo inyectado');
    const advertencias = this.advertenciasPorRuc.get(grupo.ruc) ?? [];
    if (this.modoPorRuc.get(grupo.ruc) === 'actualizar') {
      return { modo: 'actualizar', contactosCreados: 0, contactosActualizados: grupo.contactos.length, advertencias };
    }
    return { modo: 'crear', contactosCreados: grupo.contactos.length, contactosActualizados: 0, advertencias };
  }

  async registrarImportacion(registro: RegistroImportacion): Promise<number> {
    this.registros.push(registro);
    return this.registros.length;
  }
}

/** A fully valid template row (empresa-level values constant per RUC). */
function filaValida(ruc: string, encargado: string): FilaImportCrm {
  return {
    empresa: 'Probe Import SA',
    ruc,
    tipo: 'Cliente',
    origen: 'Inbound',
    proyectoObra: '',
    destinoComun: '',
    responsable: '',
    notas: '',
    encargado,
    correos: `${encargado.toLowerCase().replace(/\s+/g, '.')}@x.com`,
    telefono: '',
    principal: '',
  };
}

const USUARIO = 'admin.test';

describe('EjecutarImportacionUseCase', () => {
  it('executes one transaction per RUC group in order, aggregates the job counters and writes the CRM_Importaciones record', async () => {
    const fake = new FakeCrmImportador();
    const useCase = new EjecutarImportacionUseCase(fake);
    fake.modoPorRuc.set('20100047219', 'actualizar');
    fake.advertenciasPorRuc.set('20100047218', [
      { fila: 2, columna: 'Correos', mensaje: 'Posible contacto duplicado: el correo "ana@x.com" ya pertenece a otro contacto de esta empresa; se crea como contacto nuevo' },
    ]);

    const resultado = await useCase.execute({
      filas: [
        filaValida('20100047218', 'Ana'),
        filaValida('20100047218', 'Luis'),
        filaValida('20100047219', 'Marta'),
      ],
      archivoNombre: 'clientes.xlsx',
      usuario: USUARIO,
    });

    // One transaction per group, RUC first-appearance order, actor passed through.
    expect(fake.llamadas.map((c) => c.grupo.ruc)).toEqual(['20100047218', '20100047219']);
    expect(fake.llamadas[0]?.grupo.contactos.map((c) => c.nombre)).toEqual(['Ana', 'Luis']);
    expect(fake.llamadas[1]?.grupo.contactos.map((c) => c.nombre)).toEqual(['Marta']);
    expect(fake.llamadas.every((c) => c.usuario === USUARIO)).toBe(true);

    // Aggregated counters from the group results.
    expect(resultado.empresasCreadas).toBe(1);
    expect(resultado.empresasActualizadas).toBe(1);
    expect(resultado.contactosCreados).toBe(2);
    expect(resultado.contactosActualizados).toBe(1);
    expect(resultado.totalFilas).toBe(3);
    expect(resultado.filasValidas).toBe(3);
    expect(resultado.errores).toEqual([]);
    expect(resultado.fallos).toEqual([]);
    expect(resultado.advertencias).toHaveLength(1);

    // The job record was written once with the counters + the report rows.
    expect(fake.registros).toHaveLength(1);
    const registro = fake.registros[0];
    expect(registro?.archivoNombre).toBe('clientes.xlsx');
    expect(registro?.ejecutadoPor).toBe(USUARIO);
    expect(registro?.totalFilas).toBe(3);
    expect(registro?.filasValidas).toBe(3);
    expect(registro?.empresasCreadas).toBe(1);
    expect(registro?.empresasActualizadas).toBe(1);
    expect(registro?.contactosCreados).toBe(2);
    expect(registro?.contactosActualizados).toBe(1);
    expect(JSON.parse(registro?.erroresJson ?? '[]')).toEqual(resultado.advertencias);
    expect(resultado.importacionId).toBe(1);
  });

  it('a failing group NEVER rolls back valid groups: the failure is reported and the job record is still written', async () => {
    const fake = new FakeCrmImportador();
    const useCase = new EjecutarImportacionUseCase(fake);
    fake.fallarRucs.add('20100047219');

    const resultado = await useCase.execute({
      filas: [
        filaValida('20100047218', 'Ana'),
        filaValida('20100047219', 'Rómula'), // row 3 — this group's tx throws
        filaValida('20100047220', 'Marta'),
      ],
      archivoNombre: 'con-fallo.xlsx',
      usuario: USUARIO,
    });

    // Every group was attempted IN ORDER — the 2nd threw inside its
    // transaction and the 3rd still ran after it (isolation proof).
    expect(fake.llamadas.map((c) => c.grupo.ruc)).toEqual(['20100047218', '20100047219', '20100047220']);

    // The failure is a structured report row anchored at the group's fila.
    expect(resultado.fallos).toHaveLength(1);
    expect(resultado.fallos[0]?.fila).toBe(3);
    expect(resultado.fallos[0]?.columna).toBe('RUC');
    expect(resultado.fallos[0]?.mensaje).toContain('No se pudo importar la empresa');
    expect(resultado.fallos[0]?.mensaje).toContain('Probe Import SA');

    // Counters reflect ONLY the successful groups.
    expect(resultado.empresasCreadas).toBe(2);
    expect(resultado.contactosCreados).toBe(2);

    // The job record is written anyway, carrying the failure row.
    expect(fake.registros).toHaveLength(1);
    expect(JSON.parse(fake.registros[0]?.erroresJson ?? '[]')).toEqual(resultado.fallos);
  });

  it('a file with zero valid rows executes nothing but still writes the job record with the validation errors', async () => {
    const fake = new FakeCrmImportador();
    const useCase = new EjecutarImportacionUseCase(fake);
    const filaRota = { ...filaValida('20100047218', ''), correos: '' };

    const resultado = await useCase.execute({
      filas: [filaRota],
      archivoNombre: 'vacio.xlsx',
      usuario: USUARIO,
    });

    expect(fake.llamadas).toHaveLength(0);
    expect(resultado.filasValidas).toBe(0);
    expect(resultado.empresasCreadas).toBe(0);
    expect(resultado.errores.length).toBeGreaterThan(0);
    expect(resultado.errores[0]?.fila).toBe(2);
    expect(resultado.errores[0]?.columna).toBe('Encargado');
    expect(fake.registros).toHaveLength(1);
    expect(fake.registros[0]?.filasValidas).toBe(0);
    expect(JSON.parse(fake.registros[0]?.erroresJson ?? '[]')).toEqual(resultado.errores);
  });

  it(`rejects a file over the ${MAXIMO_FILAS_IMPORTACION}-row cap with a typed Spanish error BEFORE any write`, async () => {
    const fake = new FakeCrmImportador();
    const useCase = new EjecutarImportacionUseCase(fake);
    const filas = Array.from({ length: MAXIMO_FILAS_IMPORTACION + 1 }, (_, i) =>
      filaValida('20100047218', `Contacto ${i}`),
    );

    await expect(useCase.execute({ filas, archivoNombre: 'grande.xlsx', usuario: USUARIO })).rejects.toBeInstanceOf(
      ImportacionExcedeLimiteError,
    );
    await expect(
      useCase.execute({ filas, archivoNombre: 'grande.xlsx', usuario: USUARIO }),
    ).rejects.toThrow('2000');
    expect(fake.llamadas).toHaveLength(0);
    expect(fake.registros).toHaveLength(0);
  });

  it('accepts a file at exactly the row cap', async () => {
    const fake = new FakeCrmImportador();
    const useCase = new EjecutarImportacionUseCase(fake);
    const filas = Array.from({ length: MAXIMO_FILAS_IMPORTACION }, (_, i) =>
      filaValida('20100047218', `Contacto ${i}`),
    );

    const resultado = await useCase.execute({ filas, archivoNombre: 'borde.xlsx', usuario: USUARIO });

    expect(fake.llamadas).toHaveLength(1);
    expect(resultado.totalFilas).toBe(MAXIMO_FILAS_IMPORTACION);
    expect(resultado.filasValidas).toBe(MAXIMO_FILAS_IMPORTACION);
    expect(resultado.importacionId).toBe(1);
  });
});
