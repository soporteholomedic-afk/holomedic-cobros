import { describe, expect, it } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerCrmEmpresaRepository } from '../sqlServerCrmEmpresaRepository';
import {
  DatosEmpresaInvalidosError,
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
  direccion: 'Av. Los Próceres 210, San Isidro',
  relacion: 'prospecto',
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
  direccion: null,
  contactos: [
    { nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null },
    { nombre: 'Luis Prado', telefono: '998 220 145', correo: 'lprado@a.pe' },
  ],
};

const NUEVA: NuevaEmpresa = { ...DATOS, relacion: 'prospecto' };

function errorSql(number: number, message = 'sql error'): Error {
  return Object.assign(new Error(message), { number });
}

/** Answers the SELECT of empresas+contactos, and nothing else. */
const conFila = (sql: string): Respuesta =>
  /^\s*SELECT\s+e\.idEmpresa/i.test(sql) ? { recordsets: [[FILA], CONTACTOS] } : {};

describe('SqlServerCrmEmpresaRepository — reading', () => {
  it('maps the row and its contacts to the domain empresa (principal first, ISO dates, sector by name, relacion)', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    const e = await new SqlServerCrmEmpresaRepository(pool).getById('e-1');
    expect(e).toEqual({
      idEmpresa: 'e-1',
      razonSocial: 'Constructora Andina S.A.C.',
      ruc: '20512345678',
      sector: 'Construcción',
      notas: 'Llegó por referido.',
      direccion: 'Av. Los Próceres 210, San Isidro',
      relacion: 'prospecto',
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
    // The stage columns are gone from CrmEmpresa: the SELECT must not ask for them.
    expect(consultas[0]?.sql).not.toMatch(/\b(etapa|motivoCategoria|proximaAccionTipo|intentosSinRespuesta)\b/i);
  });

  it('reads a cliente relacion unchanged (winning or losing an oportunidad never touches it)', async () => {
    const { pool } = makeFakePool(() => ({ recordsets: [[{ ...FILA, relacion: 'cliente' }], CONTACTOS] }));
    const e = await new SqlServerCrmEmpresaRepository(pool).getById('e-1');
    expect(e?.relacion).toBe('cliente');
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

  it('reads a NULL direccion as null (empresas created before the column keep working)', async () => {
    const { pool } = makeFakePool(() => ({ recordsets: [[{ ...FILA, direccion: null }], CONTACTOS] }));
    const e = await new SqlServerCrmEmpresaRepository(pool).getById('e-1');
    expect(e?.direccion).toBeNull();
  });

  it('selects relacion and direccion, never the retired stage columns', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).getById('e-1');
    for (const col of ['relacion', 'direccion', 'notas', 'ruc']) {
      expect(consultas[0]?.sql).toContain(col);
    }
    for (const col of [
      'etapa',
      'medio',
      'medioOtro',
      'intentosSinRespuesta',
      'faltaResponderDesde',
      'proximaAccionTipo',
      'proximaAccionDetalle',
      'proximaAccionFecha',
      'origen',
      'sugerenciaDescartadaEn',
      'motivoCategoria',
    ]) {
      expect(consultas[0]?.sql).not.toContain(col);
    }
  });
});

describe('SqlServerCrmEmpresaRepository — create', () => {
  it('writes the empresa (with its relacion) and all its contacts in ONE transaction, only the first as principal', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    const e = await new SqlServerCrmEmpresaRepository(pool).create(NUEVA);
    const escritura = consultas[0];
    expect(escritura?.sql).toMatch(/SET\s+XACT_ABORT\s+ON/i);
    expect(escritura?.sql).toMatch(/BEGIN\s+TRAN/i);
    expect(escritura?.sql).toMatch(/COMMIT/i);
    expect(escritura?.sql).toMatch(/INSERT\s+INTO\s+dbo\.CrmEmpresa\s*\([^)]*\brelacion\b[^)]*\)/i);
    expect(escritura?.sql).not.toMatch(/\betapa\b|\borigen\b/i);
    expect(escritura?.sql.match(/INSERT\s+INTO\s+dbo\.CrmContacto/gi)).toHaveLength(1);
    expect(escritura?.inputs).toMatchObject({
      razonSocial: 'Constructora Andina S.A.C.',
      ruc: '20512345678',
      sector: 'Construcción',
      notas: null,
      relacion: 'prospecto',
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

  it('stores a cliente relacion when the caller passes one', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).create({ ...NUEVA, relacion: 'cliente' });
    expect(consultas[0]?.inputs).toMatchObject({ relacion: 'cliente' });
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
    // Stage-era columns AND the relacion are NOT part of this update
    // (the board moved to CrmOportunidad; relacion has its own method).
    expect(q?.sql).not.toMatch(/etapa\s*=|medio\s*=|motivo\w*\s*=|relacion\s*=/i);
    expect(q?.inputs).toMatchObject({ id: 'e-1', ruc: '20512345678', c0p: true, c1p: false });
  });

  it('maps "no row updated" to EmpresaNotFoundError', async () => {
    const { pool } = makeFakePool(() => errorSql(50404, 'empresa no encontrada'));
    await expect(new SqlServerCrmEmpresaRepository(pool).update('nope', DATOS)).rejects.toBeInstanceOf(
      EmpresaNotFoundError,
    );
  });

  it('replaces the fiscal address on update (writes the whole DatosEmpresa)', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).update('e-1', { ...DATOS, direccion: 'Jr. Unión 500, Cercado' });
    expect(consultas[0]?.inputs).toMatchObject({ id: 'e-1', direccion: 'Jr. Unión 500, Cercado' });
    expect(consultas[0]?.sql).toMatch(/direccion\s*=\s*@direccion/i);
  });

  it('maps a RUC that belongs to another empresa to RucDuplicadoError', async () => {
    const { pool } = makeFakePool(() => errorSql(2627));
    await expect(new SqlServerCrmEmpresaRepository(pool).update('e-1', DATOS)).rejects.toBeInstanceOf(
      RucDuplicadoError,
    );
  });

  it('turns the filtered unique index violation (2601) into RucDuplicadoError on update', async () => {
    const { pool } = makeFakePool(() => errorSql(2601));
    await expect(new SqlServerCrmEmpresaRepository(pool).update('e-1', DATOS)).rejects.toBeInstanceOf(
      RucDuplicadoError,
    );
  });
});

describe('SqlServerCrmEmpresaRepository — updateRelacion', () => {
  it('writes the comercial relationship and bumps updatedAt', async () => {
    const { pool, consultas } = makeFakePool((sql) =>
      /UPDATE\s+dbo\.CrmEmpresa/i.test(sql) ? { recordset: [{ idEmpresa: 'e-1' }] } : conFila(sql),
    );
    const e = await new SqlServerCrmEmpresaRepository(pool).updateRelacion('e-1', 'cliente');
    expect(consultas[0]?.sql).toMatch(
      /UPDATE\s+dbo\.CrmEmpresa\s+SET\s+relacion\s*=\s*@relacion\s*,\s*updatedAt\s*=\s*SYSUTCDATETIME\(\)/i,
    );
    expect(consultas[0]?.inputs).toEqual({ id: 'e-1', relacion: 'cliente' });
    expect(e.idEmpresa).toBe('e-1');
  });

  it('maps "no row updated" to EmpresaNotFoundError', async () => {
    const { pool } = makeFakePool(() => ({ recordset: [] }));
    await expect(
      new SqlServerCrmEmpresaRepository(pool).updateRelacion('nope', 'cliente'),
    ).rejects.toBeInstanceOf(EmpresaNotFoundError);
  });

  it('touches nothing else: no etapa-era column and no contact rewrite in the statement', async () => {
    const { pool, consultas } = makeFakePool((sql) =>
      /UPDATE\s+dbo\.CrmEmpresa/i.test(sql) ? { recordset: [{ idEmpresa: 'e-1' }] } : conFila(sql),
    );
    await new SqlServerCrmEmpresaRepository(pool).updateRelacion('e-1', 'prospecto');
    expect(consultas[0]?.sql).not.toMatch(/\b(etapa|medio|motivo|origen|CrmContacto)\b/i);
  });
});

describe('SqlServerCrmEmpresaRepository — misc forms', () => {
  it('maps NULL RUC and a contact with only an email (stored as NULLs)', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).create({
      ...NUEVA,
      ruc: null,
      contactos: [{ nombre: null, telefono: null, correo: 'a@b.pe' }],
    });
    expect(consultas[0]?.inputs).toMatchObject({ ruc: null, c0n: null, c0t: null, c0c: 'a@b.pe' });
  });

  it('persists the fiscal address on create: column in the INSERT list, value bound', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).create({ ...NUEVA, direccion: 'Av. Los Próceres 210, San Isidro' });
    expect(consultas[0]?.inputs).toMatchObject({ direccion: 'Av. Los Próceres 210, San Isidro' });
    expect(consultas[0]?.sql).toMatch(/INSERT\s+INTO\s+dbo\.CrmEmpresa\s*\([^)]*\bdireccion\b[^)]*\)/i);
    expect(consultas[0]?.sql).toContain('@direccion');
  });

  it('stores a NULL direccion when the create has none', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).create(NUEVA);
    expect(consultas[0]?.inputs).toHaveProperty('direccion', null);
  });

  it('finds nothing by a NULL RUC without querying', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    expect(await new SqlServerCrmEmpresaRepository(pool).findByRuc(null)).toBeNull();
    expect(consultas).toHaveLength(0);
  });
});

const INTERACCION_GENERAL = {
  idUsuario: 'u-1',
  nombreUsuario: 'Scott Palomino',
  direccion: 'saliente' as const,
  medio: 'llamada' as const,
  medioOtro: null,
  resultado: 'no_contesto' as const,
  resumen: 'No contestó',
  idOportunidad: null,
};

const INTERACCION_VINCULADA = { ...INTERACCION_GENERAL, idOportunidad: 'op-9' };

const FILA_INTERACCION = (id: number, fecha: string, idOportunidad: string | null = null) => ({
  idInteraccion: id,
  idEmpresa: 'e-1',
  idOportunidad,
  fecha: new Date(fecha),
  idUsuario: 'u-1',
  nombreUsuario: 'Scott Palomino',
  direccion: 'saliente',
  medio: 'llamada',
  medioOtro: null,
  resultado: 'no_contesto',
  resumen: null,
});

describe('SqlServerCrmEmpresaRepository — interacciones (unknown empresa)', () => {
  it('maps the empresa foreign key violation (547) to EmpresaNotFoundError', async () => {
    const { pool } = makeFakePool(() =>
      errorSql(
        547,
        'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_CrmInteraccion_empresa". The conflict occurred in database "HOLOMEDIC", table "dbo.CrmEmpresa", column \'idEmpresa\'.',
      ),
    );
    const error = await new SqlServerCrmEmpresaRepository(pool)
      .addInteraccion('nope', INTERACCION_GENERAL)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmpresaNotFoundError);
    expect((error as Error).message).toContain('nope');
  });

  it('rethrows a foreign key violation on the linked OPORTUNIDAD untouched (the empresa exists)', async () => {
    const fkOportunidad = errorSql(
      547,
      'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_CrmInteraccion_oportunidad". The conflict occurred in database "HOLOMEDIC", table "dbo.CrmOportunidad", column \'idOportunidad\'.',
    );
    const { pool } = makeFakePool(() => fkOportunidad);
    await expect(
      new SqlServerCrmEmpresaRepository(pool).addInteraccion('e-1', INTERACCION_VINCULADA),
    ).rejects.toBe(fkOportunidad);
  });

  it('rethrows a CHECK violation (also 547) untouched: the empresa exists, the data is wrong', async () => {
    const check = errorSql(
      547,
      'The INSERT statement conflicted with the CHECK constraint "CK_CrmInteraccion_resultado". The conflict occurred in database "HOLOMEDIC", table "dbo.CrmInteraccion", column \'resultado\'.',
    );
    const { pool } = makeFakePool(() => check);
    await expect(new SqlServerCrmEmpresaRepository(pool).addInteraccion('e-1', INTERACCION_GENERAL)).rejects.toBe(check);
  });

  it('rethrows any other database error of addInteraccion untouched', async () => {
    const boom = errorSql(1205, 'deadlock');
    const { pool } = makeFakePool(() => boom);
    await expect(new SqlServerCrmEmpresaRepository(pool).addInteraccion('e-1', INTERACCION_GENERAL)).rejects.toBe(boom);
  });
});

describe('SqlServerCrmEmpresaRepository — interacciones', () => {
  it('adds a general interaction (idOportunidad NULL) with the user snapshot as parameters', async () => {
    const { pool, consultas } = makeFakePool(() => ({
      recordset: [FILA_INTERACCION(7, '2026-10-31T12:00:00.000Z')],
    }));
    const i = await new SqlServerCrmEmpresaRepository(pool).addInteraccion('e-1', INTERACCION_GENERAL);
    expect(consultas[0]?.sql).toMatch(/INSERT\s+INTO\s+dbo\.CrmInteraccion\s*\([^)]*\bidOportunidad\b[^)]*\)/i);
    expect(consultas[0]?.inputs).toMatchObject({
      idEmpresa: 'e-1',
      ioid: null,
      idUsuario: 'u-1',
      nombreUsuario: 'Scott Palomino',
      direccion: 'saliente',
      imedio: 'llamada',
      imedioOtro: null,
      resultado: 'no_contesto',
      resumen: 'No contestó',
    });
    expect(i).toMatchObject({ idInteraccion: 7, fecha: '2026-10-31T12:00:00.000Z', idOportunidad: null });
  });

  it('adds an interaction linked to an oportunidad, binding its id', async () => {
    const { pool, consultas } = makeFakePool(() => ({
      recordset: [FILA_INTERACCION(8, '2026-10-31T12:00:00.000Z', 'op-9')],
    }));
    const i = await new SqlServerCrmEmpresaRepository(pool).addInteraccion('e-1', INTERACCION_VINCULADA);
    expect(consultas[0]?.inputs).toMatchObject({ ioid: 'op-9' });
    expect(i.idOportunidad).toBe('op-9');
  });

  it('lists the history newest first, mapped to the domain, with the oportunidad link', async () => {
    const { pool, consultas } = makeFakePool(() => ({
      recordset: [
        FILA_INTERACCION(2, '2026-10-31T12:00:00.000Z', 'op-9'),
        FILA_INTERACCION(1, '2026-10-30T12:00:00.000Z'),
      ],
    }));
    const lista = await new SqlServerCrmEmpresaRepository(pool).listInteracciones('e-1');
    expect(consultas[0]?.sql).toMatch(/ORDER\s+BY\s+fecha\s+DESC\s*,\s*idInteraccion\s+DESC/i);
    expect(consultas[0]?.inputs).toEqual({ idEmpresa: 'e-1' });
    expect(lista.map((i) => [i.idInteraccion, i.idOportunidad])).toEqual([
      [2, 'op-9'],
      [1, null],
    ]);
    expect(lista[0]?.fecha).toBe('2026-10-31T12:00:00.000Z');
    expect(lista[0]?.resumen).toBeNull();
  });
});

describe('SqlServerCrmEmpresaRepository — fusionar', () => {
  it('moves interactions, oportunidades and contacts into the destination and deletes the origin, in one transaction', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    const e = await new SqlServerCrmEmpresaRepository(pool).fusionar('e-origen', 'e-1');
    const q = consultas[0];
    expect(q?.sql).toMatch(/SET\s+XACT_ABORT\s+ON/i);
    expect(q?.sql).toMatch(/BEGIN\s+TRAN/i);
    expect(q?.sql).toMatch(/COMMIT/i);
    expect(q?.inputs).toEqual({ origen: 'e-origen', destino: 'e-1' });
    // Interactions move.
    expect(q?.sql).toMatch(/UPDATE\s+dbo\.CrmInteraccion\s+SET\s+idEmpresa\s*=\s*@destino\s+WHERE\s+idEmpresa\s*=\s*@origen/i);
    // Oportunidades move too — before the origin row is deleted.
    expect(q?.sql).toMatch(/UPDATE\s+dbo\.CrmOportunidad\s+SET\s+idEmpresa\s*=\s*@destino\s+WHERE\s+idEmpresa\s*=\s*@origen/i);
    expect((q?.sql.indexOf('CrmOportunidad') ?? 0)).toBeLessThan(q?.sql.search(/DELETE\s+FROM\s+dbo\.CrmEmpresa/i) ?? 0);
    // Contacts move only when the destination has no identical one, never as principal.
    expect(q?.sql).toMatch(/UPDATE\s+o\s+SET\s+idEmpresa\s*=\s*@destino,\s*esPrincipal\s*=\s*0/i);
    expect(q?.sql).toMatch(/NOT\s+EXISTS[\s\S]*d\.nombre[\s\S]*d\.telefono[\s\S]*d\.correo/i);
    // The origin row goes last; its leftover duplicate contacts go with it by cascade.
    expect(q?.sql).toMatch(/DELETE\s+FROM\s+dbo\.CrmEmpresa\s+WHERE\s+idEmpresa\s*=\s*@origen/i);
    expect(q?.sql.indexOf('CrmInteraccion')).toBeLessThan(q?.sql.search(/DELETE\s+FROM\s+dbo\.CrmEmpresa/i) ?? 0);
    expect(e.idEmpresa).toBe('e-1');
    expect(consultas).toHaveLength(2);
  });

  it('compares nullable contact fields NULL-safely', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).fusionar('e-origen', 'e-1');
    expect(consultas[0]?.sql).toMatch(/ISNULL\(d\.nombre/i);
  });

  it('reports the missing origin with the origin id', async () => {
    const { pool } = makeFakePool(() => errorSql(50404));
    const error = await new SqlServerCrmEmpresaRepository(pool).fusionar('a', 'b').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmpresaNotFoundError);
    expect((error as Error).message).toContain('a');
    expect((error as Error).message).not.toContain('b');
  });

  it('reports the missing destination with the destination id', async () => {
    const { pool, consultas } = makeFakePool(() => errorSql(50405));
    const error = await new SqlServerCrmEmpresaRepository(pool)
      .fusionar('origen-1', 'destino-2')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmpresaNotFoundError);
    expect((error as Error).message).toContain('destino-2');
    expect((error as Error).message).not.toContain('origen-1');
    // The two checks raise different numbers so the caller can tell them apart.
    expect(consultas[0]?.sql).toMatch(/NOT\s+EXISTS[^;]*@origen[^;]*THROW\s+50404/i);
    expect(consultas[0]?.sql).toMatch(/NOT\s+EXISTS[^;]*@destino[^;]*THROW\s+50405/i);
  });

  it('refuses to merge an empresa with itself with a domain error and a Spanish message', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    const error = await new SqlServerCrmEmpresaRepository(pool).fusionar('a', 'a').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
    expect((error as Error).message).toBe('No se puede unir una tarjeta consigo misma.');
    expect(consultas).toHaveLength(0);
  });

  it('appends the origin notes to the destination notes before deleting the origin, never dropping them', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).fusionar('e-origen', 'e-1');
    const sql = consultas[0]?.sql ?? '';
    const notas = sql.search(/SET\s+d?\.?notas\s*=\s*CASE/i);
    expect(notas).toBeGreaterThan(-1);
    expect(notas).toBeLessThan(sql.search(/DELETE\s+FROM\s+dbo\.CrmEmpresa/i));
    expect(sql).toMatch(/o\.notas\s+IS\s+NULL\s+THEN\s+d\.notas/i);
    expect(sql).toMatch(/d\.notas\s+IS\s+NULL\s+THEN\s+o\.notas/i);
    expect(sql).toMatch(/d\.notas\s*\+\s*CHAR\(10\)\s*\+\s*CHAR\(10\)\s*\+\s*o\.notas/i);
    expect(sql).toMatch(/d\.notas\s*=\s*o\.notas\s+THEN\s+d\.notas/i);
    // Nothing else of the destination is touched: RUC, sector and relacion stay.
    expect(sql).not.toMatch(/SET[^;]*\b(ruc|idSector|relacion)\b/i);
  });
});

describe('SqlServerCrmEmpresaRepository — sectores', () => {
  it('lists the sectors with their icon, ordered by name, NULL icon as null', async () => {
    const { pool, consultas } = makeFakePool(() => ({
      recordset: [
        { nombre: 'Comercio', icono: 'tienda' },
        { nombre: 'Minería', icono: undefined },
      ],
    }));
    expect(await new SqlServerCrmEmpresaRepository(pool).listSectores()).toEqual([
      { nombre: 'Comercio', icono: 'tienda' },
      { nombre: 'Minería', icono: null },
    ]);
    expect(consultas[0]?.sql).toMatch(/SELECT\s+nombre,\s*icono\s+FROM\s+dbo\.CrmSector\s+ORDER\s+BY\s+nombre/i);
  });

  it('creates a sector with its icon and returns the stored sector', async () => {
    const { pool, consultas } = makeFakePool(() => ({ recordset: [{ nombre: 'Educación', icono: 'educacion' }] }));
    expect(await new SqlServerCrmEmpresaRepository(pool).createSector('Educación', 'educacion')).toEqual({
      nombre: 'Educación',
      icono: 'educacion',
    });
    expect(consultas[0]?.inputs).toEqual({ nombre: 'Educación', icono: 'educacion' });
    expect(consultas[0]?.sql).toMatch(/INSERT\s+INTO\s+dbo\.CrmSector\s*\(nombre,\s*icono\)/i);
  });

  it('stores a NULL icon when none is given', async () => {
    const { pool, consultas } = makeFakePool(() => ({ recordset: [{ nombre: 'Educación', icono: null }] }));
    expect(await new SqlServerCrmEmpresaRepository(pool).createSector('Educación', null)).toEqual({
      nombre: 'Educación',
      icono: null,
    });
    expect(consultas[0]?.inputs).toEqual({ nombre: 'Educación', icono: null });
  });

  it('rejects a duplicate name with SectorDuplicadoError', async () => {
    const { pool } = makeFakePool(() => errorSql(2627));
    await expect(new SqlServerCrmEmpresaRepository(pool).createSector('Comercio', null)).rejects.toBeInstanceOf(
      SectorDuplicadoError,
    );
  });
});
