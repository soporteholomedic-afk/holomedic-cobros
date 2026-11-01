import { describe, expect, it } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerCrmEmpresaRepository } from '../sqlServerCrmEmpresaRepository';
import {
  DatosEmpresaInvalidosError,
  EmpresaNotFoundError,
  RucDuplicadoError,
  SectorDuplicadoError,
} from '../../../domain/errors';
import type { DatosEmpresa, NuevaEmpresa, SeguimientoEmpresa } from '../../../domain/entities';

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
  medioOtro: null,
  intentosSinRespuesta: 0,
  faltaResponderDesde: null,
  proximaAccionTipo: null,
  proximaAccionDetalle: null,
  proximaAccionFecha: null,
  origen: null,
  sugerenciaDescartadaEn: null,
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

const NUEVA: NuevaEmpresa = { ...DATOS, etapa: 'por_contactar', origen: null };

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
      medioOtro: null,
      motivo: null,
      intentosSinRespuesta: 0,
      faltaResponderDesde: null,
      proximaAccion: null,
      origen: null,
      sugerenciaDescartadaEn: null,
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

  it('clears medioOtro unless the medium stays "otro" (a stage move never leaves a stale free text)', async () => {
    const { pool, consultas } = makeFakePool((sql) =>
      /UPDATE\s+dbo\.CrmEmpresa/i.test(sql) ? { recordset: [{ idEmpresa: 'e-1' }] } : conFila(sql),
    );
    await new SqlServerCrmEmpresaRepository(pool).updateEstado('e-1', {
      etapa: 'contactado',
      medio: 'correo',
      motivo: null,
    });
    expect(consultas[0]?.sql).toMatch(
      /medioOtro\s*=\s*CASE\s+WHEN\s+@medio\s*=\s*N?'otro'\s+THEN\s+medioOtro\s+ELSE\s+NULL\s+END/i,
    );
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

describe('SqlServerCrmEmpresaRepository — follow-up columns', () => {
  it('maps NULL RUC, NULL contact fields, next action, origin and pending reply', async () => {
    const fila = {
      ...FILA,
      ruc: null,
      etapa: 'contactado',
      medio: 'otro',
      medioOtro: 'Feria',
      intentosSinRespuesta: 2,
      faltaResponderDesde: new Date('2026-10-30T15:00:00.000Z'),
      proximaAccionTipo: 'llamar',
      proximaAccionDetalle: 'Confirmar fecha',
      proximaAccionFecha: new Date('2026-11-03T00:00:00.000Z'),
      origen: 'referido',
      sugerenciaDescartadaEn: 3,
    };
    const contactos = [
      { idEmpresa: 'e-1', nombre: null, telefono: null, correo: 'a@b.pe', esPrincipal: true },
    ];
    const { pool } = makeFakePool(() => ({ recordsets: [[fila], contactos] }));
    const e = await new SqlServerCrmEmpresaRepository(pool).getById('e-1');
    expect(e).toMatchObject({
      ruc: null,
      medio: 'otro',
      medioOtro: 'Feria',
      intentosSinRespuesta: 2,
      faltaResponderDesde: '2026-10-30T15:00:00.000Z',
      proximaAccion: { tipo: 'llamar', detalle: 'Confirmar fecha', fecha: '2026-11-03' },
      origen: 'referido',
      sugerenciaDescartadaEn: 3,
      contactos: [{ nombre: null, telefono: null, correo: 'a@b.pe' }],
    });
  });

  it('selects the new columns', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).getById('e-1');
    for (const col of [
      'medioOtro',
      'intentosSinRespuesta',
      'faltaResponderDesde',
      'proximaAccionTipo',
      'proximaAccionDetalle',
      'proximaAccionFecha',
      'origen',
      'sugerenciaDescartadaEn',
    ]) {
      expect(consultas[0]?.sql).toContain(col);
    }
  });

  it('stores an empresa without RUC as NULL and a contact with only an email', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).create({
      ...NUEVA,
      ruc: null,
      contactos: [{ nombre: null, telefono: null, correo: 'a@b.pe' }],
    });
    expect(consultas[0]?.inputs).toMatchObject({ ruc: null, c0n: null, c0t: null, c0c: 'a@b.pe' });
  });

  it('binds the inbound origin on create and inserts it into the origen column', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).create({ ...NUEVA, origen: 'referido' });
    expect(consultas[0]?.inputs).toMatchObject({ origen: 'referido' });
    expect(consultas[0]?.sql).toMatch(/INSERT\s+INTO\s+dbo\.CrmEmpresa\s*\([^)]*\borigen\b[^)]*\)/i);
    expect(consultas[0]?.sql).toContain('@origen');
  });

  it('binds a NULL origin on create when the empresa has none (manual create, import)', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmEmpresaRepository(pool).create(NUEVA);
    expect(consultas[0]?.inputs).toHaveProperty('origen', null);
  });

  it('turns the filtered unique index violation (2601) into RucDuplicadoError on update', async () => {
    const { pool } = makeFakePool(() => errorSql(2601));
    await expect(new SqlServerCrmEmpresaRepository(pool).update('e-1', DATOS)).rejects.toBeInstanceOf(
      RucDuplicadoError,
    );
  });

  it('finds nothing by a NULL RUC without querying', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    expect(await new SqlServerCrmEmpresaRepository(pool).findByRuc(null)).toBeNull();
    expect(consultas).toHaveLength(0);
  });
});

const SEGUIMIENTO: SeguimientoEmpresa = {
  etapa: 'contactado',
  medio: 'otro',
  medioOtro: 'Feria',
  motivo: null,
  intentosSinRespuesta: 1,
  faltaResponderDesde: null,
  proximaAccion: { tipo: 'otro', detalle: 'x', fecha: '2026-11-03' },
  sugerenciaDescartadaEn: null,
};

const INTERACCION = {
  idUsuario: 'u-1',
  nombreUsuario: 'Scott Palomino',
  direccion: 'saliente' as const,
  medio: 'llamada' as const,
  medioOtro: null,
  resultado: 'no_contesto' as const,
  resumen: 'No contestó',
};

const FILA_INTERACCION = (id: number, fecha: string) => ({
  idInteraccion: id,
  idEmpresa: 'e-1',
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
  it('maps the foreign key violation (547) to EmpresaNotFoundError', async () => {
    const { pool } = makeFakePool(() => errorSql(547, 'FK_CrmInteraccion_empresa'));
    const error = await new SqlServerCrmEmpresaRepository(pool)
      .addInteraccion('nope', INTERACCION)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmpresaNotFoundError);
    expect((error as Error).message).toContain('nope');
  });

  it('rethrows any other database error of addInteraccion untouched', async () => {
    const boom = errorSql(1205, 'deadlock');
    const { pool } = makeFakePool(() => boom);
    await expect(new SqlServerCrmEmpresaRepository(pool).addInteraccion('e-1', INTERACCION)).rejects.toBe(boom);
  });
});

describe('SqlServerCrmEmpresaRepository — interacciones', () => {
  it('adds an interaction with the user snapshot as parameters', async () => {
    const { pool, consultas } = makeFakePool(() => ({
      recordset: [FILA_INTERACCION(7, '2026-10-31T12:00:00.000Z')],
    }));
    const i = await new SqlServerCrmEmpresaRepository(pool).addInteraccion('e-1', INTERACCION);
    expect(consultas[0]?.sql).toMatch(/INSERT\s+INTO\s+dbo\.CrmInteraccion/i);
    expect(consultas[0]?.inputs).toMatchObject({
      idEmpresa: 'e-1',
      idUsuario: 'u-1',
      nombreUsuario: 'Scott Palomino',
      direccion: 'saliente',
      imedio: 'llamada',
      imedioOtro: null,
      resultado: 'no_contesto',
      resumen: 'No contestó',
    });
    expect(i).toMatchObject({ idInteraccion: 7, fecha: '2026-10-31T12:00:00.000Z' });
  });

  it('lists the history newest first, mapped to the domain', async () => {
    const { pool, consultas } = makeFakePool(() => ({
      recordset: [
        FILA_INTERACCION(2, '2026-10-31T12:00:00.000Z'),
        FILA_INTERACCION(1, '2026-10-30T12:00:00.000Z'),
      ],
    }));
    const lista = await new SqlServerCrmEmpresaRepository(pool).listInteracciones('e-1');
    expect(consultas[0]?.sql).toMatch(/ORDER\s+BY\s+fecha\s+DESC\s*,\s*idInteraccion\s+DESC/i);
    expect(consultas[0]?.inputs).toEqual({ idEmpresa: 'e-1' });
    expect(lista.map((i) => i.idInteraccion)).toEqual([2, 1]);
    expect(lista[0]?.fecha).toBe('2026-10-31T12:00:00.000Z');
    expect(lista[0]?.resumen).toBeNull();
  });
});

describe('SqlServerCrmEmpresaRepository — updateSeguimiento', () => {
  const ok = (sql: string): Respuesta =>
    /UPDATE\s+dbo\.CrmEmpresa/i.test(sql) ? { recordset: [{ idEmpresa: 'e-1' }] } : conFila(sql);

  it('writes the follow-up state and the new interaction in ONE transaction', async () => {
    const { pool, consultas } = makeFakePool(ok);
    await new SqlServerCrmEmpresaRepository(pool).updateSeguimiento('e-1', SEGUIMIENTO, INTERACCION);
    const q = consultas[0];
    expect(q?.sql).toMatch(/SET\s+XACT_ABORT\s+ON/i);
    expect(q?.sql).toMatch(/BEGIN\s+TRAN/i);
    expect(q?.sql).toMatch(/COMMIT/i);
    expect(q?.sql).toMatch(/UPDATE\s+dbo\.CrmEmpresa/i);
    expect(q?.sql.match(/INSERT\s+INTO\s+dbo\.CrmInteraccion/gi)).toHaveLength(1);
    expect(q?.sql).toMatch(/50404/);
    expect(q?.inputs).toMatchObject({
      id: 'e-1',
      etapa: 'contactado',
      medio: 'otro',
      medioOtro: 'Feria',
      intentosSinRespuesta: 1,
      faltaResponderDesde: null,
      proximaAccionTipo: 'otro',
      proximaAccionDetalle: 'x',
      proximaAccionFecha: '2026-11-03',
      sugerenciaDescartadaEn: null,
      motivoCategoria: null,
      idUsuario: 'u-1',
      resultado: 'no_contesto',
    });
    // The write is a single round trip plus the read-back.
    expect(consultas).toHaveLength(2);
  });

  it('skips the INSERT when there is no interaction (card moved or suggestion dismissed)', async () => {
    const { pool, consultas } = makeFakePool(ok);
    await new SqlServerCrmEmpresaRepository(pool).updateSeguimiento('e-1', SEGUIMIENTO, null);
    expect(consultas[0]?.sql).not.toMatch(/CrmInteraccion/i);
  });

  it('maps "no row updated" to EmpresaNotFoundError', async () => {
    const { pool } = makeFakePool(() => errorSql(50404));
    await expect(
      new SqlServerCrmEmpresaRepository(pool).updateSeguimiento('nope', SEGUIMIENTO, INTERACCION),
    ).rejects.toBeInstanceOf(EmpresaNotFoundError);
  });
});

describe('SqlServerCrmEmpresaRepository — fusionar', () => {
  it('moves interactions and contacts into the destination and deletes the origin, in one transaction', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    const e = await new SqlServerCrmEmpresaRepository(pool).fusionar('e-origen', 'e-1');
    const q = consultas[0];
    expect(q?.sql).toMatch(/SET\s+XACT_ABORT\s+ON/i);
    expect(q?.sql).toMatch(/BEGIN\s+TRAN/i);
    expect(q?.sql).toMatch(/COMMIT/i);
    expect(q?.inputs).toEqual({ origen: 'e-origen', destino: 'e-1' });
    // Interactions move.
    expect(q?.sql).toMatch(/UPDATE\s+dbo\.CrmInteraccion\s+SET\s+idEmpresa\s*=\s*@destino\s+WHERE\s+idEmpresa\s*=\s*@origen/i);
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
    // Nothing else of the destination is touched: RUC, sector and counters stay.
    expect(sql).not.toMatch(/SET[^;]*\b(ruc|idSector|intentosSinRespuesta)\b/i);
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
