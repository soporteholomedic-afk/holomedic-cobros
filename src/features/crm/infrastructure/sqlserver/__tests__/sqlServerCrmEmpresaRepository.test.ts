import { describe, expect, it } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerCrmEmpresaRepository } from '../sqlServerCrmEmpresaRepository';
import { EmpresaNotFoundError, RucDuplicadoError } from '../../../domain/errors';
import type { NuevaEmpresa } from '../../../domain/entities';

interface Consulta {
  sql: string;
  inputs: Record<string, unknown>;
}

function makeFakePool(
  recordset: unknown[] = [],
  opciones: { fallo?: Error } = {},
) {
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
          if (opciones.fallo) throw opciones.fallo;
          return { recordset, rowsAffected: [recordset.length] };
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
  contactoNombre: 'Marcela Quispe',
  contactoTelefono: '987 654 321',
  contactoCorreo: null,
  notas: null,
  etapa: 'por_contactar',
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
  updatedAt: new Date('2026-10-31T11:00:00.000Z'),
};

const NUEVA: NuevaEmpresa = {
  razonSocial: 'Constructora Andina S.A.C.',
  ruc: '20512345678',
  sector: 'Construcción',
  contactoNombre: 'Marcela Quispe',
  contactoTelefono: '987 654 321',
  contactoCorreo: null,
  notas: null,
  etapa: 'por_contactar',
};

function errorSql(number: number): Error {
  return Object.assign(new Error('sql error'), { number });
}

describe('SqlServerCrmEmpresaRepository', () => {
  it('maps a row to the domain empresa with ISO dates', async () => {
    const { pool } = makeFakePool([FILA]);
    const e = await new SqlServerCrmEmpresaRepository(pool).getById('e-1');
    expect(e).toEqual({
      ...FILA,
      createdAt: '2026-10-31T10:00:00.000Z',
      updatedAt: '2026-10-31T11:00:00.000Z',
    });
  });

  it('getById returns null when there is no row, and queries by id', async () => {
    const { pool, consultas } = makeFakePool([]);
    const e = await new SqlServerCrmEmpresaRepository(pool).getById('nope');
    expect(e).toBeNull();
    expect(consultas[0].sql).toMatch(/FROM\s+dbo\.CrmEmpresa\s+WHERE\s+idEmpresa\s*=\s*@id/i);
    expect(consultas[0].inputs['id']).toBe('nope');
  });

  it('findByRuc looks up by exact RUC', async () => {
    const { pool, consultas } = makeFakePool([FILA]);
    const e = await new SqlServerCrmEmpresaRepository(pool).findByRuc('20512345678');
    expect(e?.idEmpresa).toBe('e-1');
    expect(consultas[0].sql).toMatch(/WHERE\s+ruc\s*=\s*@ruc/i);
    expect(consultas[0].inputs['ruc']).toBe('20512345678');
  });

  it('list returns every empresa, most recently touched first', async () => {
    const { pool, consultas } = makeFakePool([FILA, { ...FILA, idEmpresa: 'e-2' }]);
    const lista = await new SqlServerCrmEmpresaRepository(pool).list();
    expect(lista.map((e) => e.idEmpresa)).toEqual(['e-1', 'e-2']);
    expect(consultas[0].sql).toMatch(/ORDER\s+BY\s+updatedAt\s+DESC/i);
  });

  it('create inserts every field with a generated id and returns the stored row', async () => {
    const { pool, consultas } = makeFakePool([FILA]);
    const e = await new SqlServerCrmEmpresaRepository(pool).create(NUEVA);
    expect(e.idEmpresa).toBe('e-1');
    const { sql, inputs } = consultas[0];
    expect(sql).toMatch(/INSERT\s+INTO\s+dbo\.CrmEmpresa/i);
    expect(sql).toMatch(/OUTPUT\s+INSERTED\.\*/i);
    expect(inputs['idEmpresa']).toMatch(/^[0-9a-f-]{36}$/);
    expect(inputs).toMatchObject({
      razonSocial: NUEVA.razonSocial,
      ruc: NUEVA.ruc,
      sector: 'Construcción',
      contactoNombre: NUEVA.contactoNombre,
      contactoTelefono: NUEVA.contactoTelefono,
      contactoCorreo: null,
      notas: null,
      etapa: 'por_contactar',
    });
  });

  it('create maps a unique-key violation on the RUC to RucDuplicadoError', async () => {
    for (const number of [2627, 2601]) {
      const { pool } = makeFakePool([], { fallo: errorSql(number) });
      await expect(new SqlServerCrmEmpresaRepository(pool).create(NUEVA)).rejects.toThrow(
        RucDuplicadoError,
      );
    }
  });

  it('create lets any other database error through untouched', async () => {
    const { pool } = makeFakePool([], { fallo: errorSql(8152) });
    await expect(new SqlServerCrmEmpresaRepository(pool).create(NUEVA)).rejects.toMatchObject({
      number: 8152,
    });
  });

  it('updateEtapa changes only the column, refreshes updatedAt and returns the row', async () => {
    const { pool, consultas } = makeFakePool([{ ...FILA, etapa: 'contactado' }]);
    const e = await new SqlServerCrmEmpresaRepository(pool).updateEtapa('e-1', 'contactado');
    expect(e.etapa).toBe('contactado');
    const { sql, inputs } = consultas[0];
    expect(sql).toMatch(/UPDATE\s+dbo\.CrmEmpresa\s+SET\s+etapa\s*=\s*@etapa,\s*updatedAt\s*=\s*SYSUTCDATETIME\(\)/i);
    expect(sql).toMatch(/OUTPUT\s+INSERTED\.\*/i);
    expect(sql).toMatch(/WHERE\s+idEmpresa\s*=\s*@id/i);
    expect(inputs).toMatchObject({ id: 'e-1', etapa: 'contactado' });
  });

  it('updateEtapa throws EmpresaNotFoundError when no row matches', async () => {
    const { pool } = makeFakePool([]);
    await expect(
      new SqlServerCrmEmpresaRepository(pool).updateEtapa('nope', 'cliente'),
    ).rejects.toThrow(EmpresaNotFoundError);
  });
});
