import { describe, expect, it } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerCrmEmpresaRepository } from '../sqlServerCrmEmpresaRepository';
import {
  EmpresaNotFoundError,
  RucDuplicadoError,
  SectorDuplicadoError,
} from '../../../domain/errors';
import type { DatosEmpresa, NuevaEmpresa } from '../../../domain/entities';

interface Consulta {
  sql: string;
  inputs: Record<string, unknown>;
}

type Respuesta = { recordset?: unknown[]; recordsets?: unknown[][]; rowsAffected?: number[] };

/** Fake pool: records every query and answers with `responder(sql, n)`. */
function makeFakePool(responder: (sql: string, n: number) => Respuesta | Error = () => ({})) {
  const consultas: Consulta[] = [];
  const pool = {
    request: () => {
      const inputs: Record<string, unknown> = {};
      const request = {
        input: (name: string, _type: unknown, value: unknown) => {
          inputs[name] = value;
          return request;
        },
        query: async (sql: string) => {
          consultas.push({ sql, inputs: { ...inputs } });
          const r = responder(sql, consultas.length - 1);
          if (r instanceof Error) throw r;
          const recordset = r.recordset ?? r.recordsets?.[0] ?? [];
          return {
            recordset,
            recordsets: r.recordsets ?? [recordset],
            rowsAffected: r.rowsAffected ?? [recordset.length],
          };
        },
      };
      return request;
    },
  };
  return { pool: pool as unknown as mssql.ConnectionPool, consultas };
}

const FILA = {
  idEmpresa: 'e-1',
  razonSocial: 'Constructora Andina S.A.C.',
  ruc: '20512345678',
  sector: 'Construcción',
  notas: 'Llegó por referido.',
  etapa: 'contactado',
  medio: 'llamada',
  motivoCategoria: null,
  motivoDetalle1: null,
  motivoDetalle2: null,
  motivoNotas: null,
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
  updatedAt: new Date('2026-10-31T11:00:00.000Z'),
};

const CONTACTOS = [
  { idEmpresa: 'e-1', nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null, esPrincipal: true },
  { idEmpresa: 'e-1', nombre: 'Luis Prado', telefono: '998 220 145', correo: 'lprado@a.pe', esPrincipal: false },
];

const DATOS: DatosEmpresa = {
  razonSocial: 'Constructora Andina S.A.C.',
  ruc: '20512345678',
  sector: 'Construcción',
  notas: null,
  contactos: [
    { nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null },
    { nombre: 'Luis Prado', telefono: '998 220 145', correo: 'lprado@a.pe' },
  ],
};

const NUEVA: NuevaEmpresa = { ...DATOS, etapa: 'por_contactar' };

function errorSql(number: number, message = 'sql error'): Error {
  return Object.assign(new Error(message), { number });
}

/** Answers the SELECT of empresas+contactos, and nothing else. */
const conFila = (sql: string): Respuesta =>
  /^\s*SELECT\s+e\.idEmpresa/i.test(sql) ? { recordsets: [[FILA], CONTACTOS] } : {};

describe('SqlServerCrmEmpresaRepository — reading', () => {
  it('maps the row and its contacts to the domain empresa (principal first, ISO dates, sector by name)', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    const e = await new SqlServerCrmEmpresaRepository(pool).getById('e-1');
    expect(e).toEqual({
      idEmpresa: 'e-1',
      razonSocial: 'Constructora Andina S.A.C.',
      ruc: '20512345678',
      sector: 'Construcción',
      notas: 'Llegó por referido.',
      etapa: 'contactado',
      medio: 'llamada',
      motivo: null,
      contactos: [
        { nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null },
        { nombre: 'Luis Prado', telefono: '998 220 145', correo: 'lprado@a.pe' },
      ],
      createdAt: '2026-10-31T10:00:00.000Z',
      updatedAt: '2026-10-31T11:00:00.000Z',
    });
    expect(consultas).toHaveLength(1);
    expect(consultas[0]?.inputs).toEqual({ id: 'e-1' });
    expect(consultas[0]?.sql).toMatch(/ORDER\s+BY[^;]*esPrincipal\s+DESC/i);
  });

  it('builds the loss reason when the row is in Perdido', async () => {
    const perdida = {
      ...FILA,
      etapa: 'perdido',
      motivoCategoria: 'proveedor',
      motivoDetalle1: 'Distribuidora Norte S.A.C.',
      motivoDetalle2: 'diciembre 2027',
      motivoNotas: null,
    };
    const { pool } = makeFakePool(() => ({ recordsets: [[perdida], CONTACTOS] }));
    const e = await new SqlServerCrmEmpresaRepository(pool).getById('e-1');
    expect(e?.motivo).toEqual({
      categoria: 'proveedor',
      detalle1: 'Distribuidora Norte S.A.C.',
      detalle2: 'diciembre 2027',
      notas: null,
    });
  });

  it('returns null when the empresa does not exist', async () => {
    const { pool } = makeFakePool(() => ({ recordsets: [[], []] }));
    expect(await new SqlServerCrmEmpresaRepository(pool).getById('nope')).toBeNull();
  });

  it('finds by RUC with the RUC as a parameter', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    const e = await new SqlServerCrmEmpresaRepository(pool).findByRuc('20512345678');
    expect(e?.idEmpresa).toBe('e-1');
    expect(consultas[0]?.inputs).toEqual({ ruc: '20512345678' });
  });

  it('lists every empresa with only its own contacts', async () => {
    const otra = { ...FILA, idEmpresa: 'e-2', ruc: '20600000001', razonSocial: 'Otra S.A.' };
    const contactosOtra = [
      { idEmpresa: 'e-2', nombre: 'Ana Ríos', telefono: '911 222 333', correo: null, esPrincipal: true },
    ];
    const { pool } = makeFakePool(() => ({
      recordsets: [[FILA, otra], [...CONTACTOS, ...contactosOtra]],
    }));
    const lista = await new SqlServerCrmEmpresaRepository(pool).list();
    expect(lista.map((e) => [e.idEmpresa, e.contactos.length])).toEqual([
      ['e-1', 2],
      ['e-2', 1],
    ]);
    expect(lista[1]?.contactos[0]?.nombre).toBe('Ana Ríos');
  });

  it('gives an empresa without contact rows an empty list instead of failing', async () => {
    const { pool } = makeFakePool(() => ({ recordsets: [[FILA], []] }));
    const e = await new SqlServerCrmEmpresaRepository(pool).getById('e-1');
    expect(e?.contactos).toEqual([]);
  });
});

describe('SqlServerCrmEmpresaRepository — create', () => {
  it('writes the empresa and all its contacts in ONE transaction, only the first as principal', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    const e = await new SqlServerCrmEmpresaRepository(pool).create(NUEVA);
    const escritura = consultas[0];
    expect(escritura?.sql).toMatch(/SET\s+XACT_ABORT\s+ON/i);
    expect(escritura?.sql).toMatch(/BEGIN\s+TRAN/i);
    expect(escritura?.sql).toMatch(/COMMIT/i);
    expect(escritura?.sql).toMatch(/INSERT\s+INTO\s+dbo\.CrmEmpresa/i);
    expect(escritura?.sql.match(/INSERT\s+INTO\s+dbo\.CrmContacto/gi)).toHaveLength(1);
    expect(escritura?.inputs).toMatchObject({
      razonSocial: 'Constructora Andina S.A.C.',
      ruc: '20512345678',
      sector: 'Construcción',
      notas: null,
      etapa: 'por_contactar',
      c0n: 'Marcela Quispe',
      c0t: '987 654 321',
      c0c: null,
      c0p: true,
      c1n: 'Luis Prado',
      c1t: '998 220 145',
      c1c: 'lprado@a.pe',
      c1p: false,
    });
    expect(typeof escritura?.inputs.idEmpresa).toBe('string');
    // The stored row is read back so the caller gets the real thing.
    expect(e.idEmpresa).toBe('e-1');
  });

  it('turns a unique-constraint violation into RucDuplicadoError', async () => {
    for (const number of [2627, 2601]) {
      const { pool } = makeFakePool(() => errorSql(number));
      await expect(new SqlServerCrmEmpresaRepository(pool).create(NUEVA)).rejects.toBeInstanceOf(
        RucDuplicadoError,
      );
    }
  });

  it('rethrows any other database error untouched', async () => {
    const boom = errorSql(1205, 'deadlock');
    const { pool } = makeFakePool(() => boom);
    await expect(new SqlServerCrmEmpresaRepository(pool).create(NUEVA)).rejects.toBe(boom);
  });
});

describe('SqlServerCrmEmpresaRepository — update', () => {
  it('replaces the empresa data and the whole contacts list in one transaction', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).update('e-1', DATOS);
    const q = consultas[0];
    expect(q?.sql).toMatch(/SET\s+XACT_ABORT\s+ON/i);
    expect(q?.sql).toMatch(/UPDATE\s+dbo\.CrmEmpresa/i);
    expect(q?.sql).toMatch(/DELETE\s+FROM\s+dbo\.CrmContacto\s+WHERE\s+idEmpresa\s*=\s*@id/i);
    expect(q?.sql).toMatch(/INSERT\s+INTO\s+dbo\.CrmContacto/i);
    // Stage, medium and loss reason are NOT part of this update.
    expect(q?.sql).not.toMatch(/etapa\s*=|medio\s*=|motivo\w*\s*=/i);
    expect(q?.inputs).toMatchObject({ id: 'e-1', ruc: '20512345678', c0p: true, c1p: false });
  });

  it('maps "no row updated" to EmpresaNotFoundError', async () => {
    const { pool } = makeFakePool(() => errorSql(50404, 'empresa no encontrada'));
    await expect(new SqlServerCrmEmpresaRepository(pool).update('nope', DATOS)).rejects.toBeInstanceOf(
      EmpresaNotFoundError,
    );
  });

  it('maps a RUC that belongs to another empresa to RucDuplicadoError', async () => {
    const { pool } = makeFakePool(() => errorSql(2627));
    await expect(new SqlServerCrmEmpresaRepository(pool).update('e-1', DATOS)).rejects.toBeInstanceOf(
      RucDuplicadoError,
    );
  });
});

describe('SqlServerCrmEmpresaRepository — estado', () => {
  it('writes stage, medium and the loss reason together', async () => {
    const { pool, consultas } = makeFakePool((sql) =>
      /UPDATE\s+dbo\.CrmEmpresa/i.test(sql) ? { recordset: [{ idEmpresa: 'e-1' }] } : conFila(sql),
    );
    await new SqlServerCrmEmpresaRepository(pool).updateEstado('e-1', {
      etapa: 'perdido',
      medio: null,
      motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: 'Muy caro' },
    });
    expect(consultas[0]?.inputs).toEqual({
      id: 'e-1',
      etapa: 'perdido',
      medio: null,
      motivoCategoria: 'precio',
      motivoDetalle1: 'S/ 7,000',
      motivoDetalle2: null,
      motivoNotas: 'Muy caro',
    });
    expect(consultas[0]?.sql).toMatch(/updatedAt\s*=\s*SYSUTCDATETIME\(\)/i);
  });

  it('clears the loss reason columns when the empresa leaves Perdido', async () => {
    const { pool, consultas } = makeFakePool((sql) =>
      /UPDATE\s+dbo\.CrmEmpresa/i.test(sql) ? { recordset: [{ idEmpresa: 'e-1' }] } : conFila(sql),
    );
    await new SqlServerCrmEmpresaRepository(pool).updateEstado('e-1', {
      etapa: 'contactado',
      medio: 'whatsapp',
      motivo: null,
    });
    expect(consultas[0]?.inputs).toMatchObject({
      etapa: 'contactado',
      medio: 'whatsapp',
      motivoCategoria: null,
      motivoDetalle1: null,
      motivoDetalle2: null,
      motivoNotas: null,
    });
  });

  it('throws EmpresaNotFoundError when no row matches the id', async () => {
    const { pool } = makeFakePool(() => ({ recordset: [] }));
    await expect(
      new SqlServerCrmEmpresaRepository(pool).updateEstado('nope', {
        etapa: 'contactado',
        medio: 'llamada',
        motivo: null,
      }),
    ).rejects.toBeInstanceOf(EmpresaNotFoundError);
  });
});

describe('SqlServerCrmEmpresaRepository — sectores', () => {
  it('lists the sector names', async () => {
    const { pool } = makeFakePool(() => ({ recordset: [{ nombre: 'Comercio' }, { nombre: 'Minería' }] }));
    expect(await new SqlServerCrmEmpresaRepository(pool).listSectores()).toEqual([
      'Comercio',
      'Minería',
    ]);
  });

  it('creates a sector and returns the stored name', async () => {
    const { pool, consultas } = makeFakePool(() => ({ recordset: [{ nombre: 'Educación' }] }));
    expect(await new SqlServerCrmEmpresaRepository(pool).createSector('Educación')).toBe('Educación');
    expect(consultas[0]?.inputs).toEqual({ nombre: 'Educación' });
  });

  it('rejects a duplicate name with SectorDuplicadoError', async () => {
    const { pool } = makeFakePool(() => errorSql(2627));
    await expect(new SqlServerCrmEmpresaRepository(pool).createSector('Comercio')).rejects.toBeInstanceOf(
      SectorDuplicadoError,
    );
  });
});
