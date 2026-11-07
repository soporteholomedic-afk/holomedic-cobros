import { describe, expect, it } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerCrmOportunidadRepository } from '../sqlserver/sqlServerCrmOportunidadRepository';
import { EmpresaNotFoundError, OportunidadNotFoundError } from '../../domain/errors';
import type {
  DatosOportunidad,
  NuevaOportunidad,
  NuevaInteraccion,
  Oportunidad,
  SeguimientoOportunidad,
} from '../../domain/entities';

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

function errorSql(number: number, message = 'sql error'): Error {
  return Object.assign(new Error(message), { number });
}

/** One stored row, DECIMAL coming back as the driver returns it (a string). */
const FILA = {
  idOportunidad: 'op-1',
  idEmpresa: 'e-1',
  nombre: 'Renova de monoceras',
  responsableId: 'u-1',
  responsableNombre: 'Scott Palomino',
  origen: 'referido',
  servicio: 'Monoceras',
  montoEstimado: '7000.00',
  etapa: 'contactado',
  medio: 'llamada',
  medioOtro: null,
  motivoCategoria: null,
  motivoDetalle1: null,
  motivoDetalle2: null,
  motivoNotas: null,
  intentosSinRespuesta: 2,
  faltaResponderDesde: new Date('2026-10-30T15:00:00.000Z'),
  proximaAccionTipo: 'llamar',
  proximaAccionDetalle: 'Confirmar fecha',
  proximaAccionFecha: new Date('2026-11-03T00:00:00.000Z'),
  sugerenciaDescartadaEn: null,
  migrada: false,
  createdAt: new Date('2026-10-31T10:00:00.000Z'),
  updatedAt: new Date('2026-10-31T11:00:00.000Z'),
};

const conFila = (sql: string): Respuesta =>
  /FROM\s+dbo\.CrmOportunidad/i.test(sql) ? { recordsets: [[FILA]] } : {};

const NUEVA: NuevaOportunidad = {
  nombre: 'Renova de monoceras',
  responsableId: 'u-1',
  responsableNombre: 'Scott Palomino',
  origen: 'referido',
  servicio: 'Monoceras',
  montoEstimado: 7000,
  etapa: 'por_contactar',
  medio: null,
  medioOtro: null,
};

const DATOS: DatosOportunidad = {
  nombre: 'Renova de monoceras',
  responsableId: null,
  responsableNombre: null,
  origen: null,
  servicio: null,
  montoEstimado: null,
};

const SEGUIMIENTO: SeguimientoOportunidad = {
  etapa: 'contactado',
  medio: 'otro',
  medioOtro: 'Feria',
  motivo: null,
  intentosSinRespuesta: 1,
  faltaResponderDesde: null,
  proximaAccion: { tipo: 'otro', detalle: 'x', fecha: '2026-11-03' },
  sugerenciaDescartadaEn: null,
};

const INTERACCION: NuevaInteraccion = {
  idUsuario: 'u-1',
  nombreUsuario: 'Scott Palomino',
  direccion: 'saliente',
  medio: 'llamada',
  medioOtro: null,
  resultado: 'no_contesto',
  resumen: 'No contestó',
  idOportunidad: null,
};

describe('SqlServerCrmOportunidadRepository — reading', () => {
  it('maps the row to the domain oportunidad: DECIMAL to number, DATE to YYYY-MM-DD, ISO timestamps', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    const op: Oportunidad | null = await new SqlServerCrmOportunidadRepository(pool).getById('op-1');
    expect(op).toEqual({
      idOportunidad: 'op-1',
      idEmpresa: 'e-1',
      nombre: 'Renova de monoceras',
      responsableId: 'u-1',
      responsableNombre: 'Scott Palomino',
      origen: 'referido',
      servicio: 'Monoceras',
      montoEstimado: 7000,
      etapa: 'contactado',
      medio: 'llamada',
      medioOtro: null,
      motivo: null,
      intentosSinRespuesta: 2,
      faltaResponderDesde: '2026-10-30T15:00:00.000Z',
      proximaAccion: { tipo: 'llamar', detalle: 'Confirmar fecha', fecha: '2026-11-03' },
      sugerenciaDescartadaEn: null,
      migrada: false,
      createdAt: '2026-10-31T10:00:00.000Z',
      updatedAt: '2026-10-31T11:00:00.000Z',
    });
    expect(consultas[0]?.inputs).toEqual({ id: 'op-1' });
    expect(consultas[0]?.sql).toMatch(/WHERE\s+idOportunidad\s*=\s*@id/i);
  });

  it('builds the loss reason when the etapa is perdida', async () => {
    const perdida = {
      ...FILA,
      etapa: 'perdida',
      medio: null,
      motivoCategoria: 'proveedor',
      motivoDetalle1: 'Distribuidora Norte S.A.C.',
      motivoDetalle2: 'diciembre 2027',
      motivoNotas: 'Se quedó con su proveedor actual.',
    };
    const { pool } = makeFakePool(() => ({ recordsets: [[perdida]] }));
    const op = await new SqlServerCrmOportunidadRepository(pool).getById('op-1');
    expect(op?.motivo).toEqual({
      categoria: 'proveedor',
      detalle1: 'Distribuidora Norte S.A.C.',
      detalle2: 'diciembre 2027',
      notas: 'Se quedó con su proveedor actual.',
    });
  });

  it('maps a migrated card (migrada = 1) and NULL optional fields to null, not undefined', async () => {
    const migrada = {
      ...FILA,
      responsableId: null,
      responsableNombre: null,
      origen: null,
      servicio: null,
      montoEstimado: null,
      medio: null,
      proximaAccionTipo: null,
      proximaAccionDetalle: null,
      proximaAccionFecha: null,
      faltaResponderDesde: null,
      sugerenciaDescartadaEn: 3,
      migrada: true,
    };
    const { pool } = makeFakePool(() => ({ recordsets: [[migrada]] }));
    const op = await new SqlServerCrmOportunidadRepository(pool).getById('op-1');
    expect(op).toMatchObject({
      responsableId: null,
      responsableNombre: null,
      origen: null,
      servicio: null,
      montoEstimado: null,
      medio: null,
      proximaAccion: null,
      faltaResponderDesde: null,
      sugerenciaDescartadaEn: 3,
      migrada: true,
    });
  });

  it('returns null when the oportunidad does not exist', async () => {
    const { pool } = makeFakePool(() => ({ recordsets: [[]] }));
    expect(await new SqlServerCrmOportunidadRepository(pool).getById('nope')).toBeNull();
  });

  it('lists every oportunidad, newest first', async () => {
    const masNueva = { ...FILA, idOportunidad: 'op-2', createdAt: new Date('2026-11-01T10:00:00.000Z') };
    const { pool, consultas } = makeFakePool(() => ({ recordset: [masNueva, FILA] }));
    const lista = await new SqlServerCrmOportunidadRepository(pool).list();
    expect(lista.map((o) => o.idOportunidad)).toEqual(['op-2', 'op-1']);
    expect(consultas[0]?.sql).toMatch(/FROM\s+dbo\.CrmOportunidad\s+ORDER\s+BY\s+createdAt\s+DESC/i);
    expect(consultas[0]?.sql).not.toMatch(/WHERE/i);
  });

  it('lists the oportunidades of one empresa, newest first, filtered by it', async () => {
    const { pool, consultas } = makeFakePool(() => ({ recordset: [FILA] }));
    const lista = await new SqlServerCrmOportunidadRepository(pool).listByEmpresa('e-1');
    expect(lista.map((o) => o.idEmpresa)).toEqual(['e-1']);
    expect(consultas[0]?.inputs).toEqual({ idEmpresa: 'e-1' });
    expect(consultas[0]?.sql).toMatch(/WHERE\s+idEmpresa\s*=\s*@idEmpresa\s+ORDER\s+BY\s+createdAt\s+DESC/i);
  });
});

describe('SqlServerCrmOportunidadRepository — create', () => {
  it('inserts the nueva oportunidad with its initial stage and reads it back', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    const op = await new SqlServerCrmOportunidadRepository(pool).create('e-1', NUEVA);
    const q = consultas[0];
    expect(typeof q?.inputs.id).toBe('string');
    expect(q?.inputs.id).not.toBe(q?.inputs.idEmpresa);
    expect(q?.inputs).toMatchObject({
      idEmpresa: 'e-1',
      nombre: 'Renova de monoceras',
      responsableId: 'u-1',
      responsableNombre: 'Scott Palomino',
      origen: 'referido',
      servicio: 'Monoceras',
      montoEstimado: 7000,
      etapa: 'por_contactar',
      medio: null,
      medioOtro: null,
      migrada: false,
    });
    expect(q?.sql).toMatch(/INSERT\s+INTO\s+dbo\.CrmOportunidad\s*\(/i);
    // The stored row is read back so the caller gets the real thing.
    expect(op.idOportunidad).toBe('op-1');
    expect(consultas).toHaveLength(2);
  });

  it('marks migration-created cards with migrada = true', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmOportunidadRepository(pool).create('e-1', NUEVA, true);
    expect(consultas[0]?.inputs).toMatchObject({ migrada: true });
  });

  it('binds a NULL montoEstimado when the create has none', async () => {
    const { pool, consultas } = makeFakePool(conFila);
    await new SqlServerCrmOportunidadRepository(pool).create('e-1', { ...NUEVA, montoEstimado: null });
    expect(consultas[0]?.inputs).toHaveProperty('montoEstimado', null);
  });

  it('maps the empresa foreign key violation (547) to EmpresaNotFoundError', async () => {
    const { pool } = makeFakePool(() =>
      errorSql(
        547,
        'The INSERT statement conflicted with the FOREIGN KEY constraint "FK_CrmOportunidad_empresa". The conflict occurred in database "HOLOMEDIC", table "dbo.CrmEmpresa", column \'idEmpresa\'.',
      ),
    );
    const error = await new SqlServerCrmOportunidadRepository(pool)
      .create('nope', NUEVA)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmpresaNotFoundError);
    expect((error as Error).message).toContain('nope');
  });

  it('rethrows a CHECK violation (also 547) untouched: the empresa exists, the data is wrong', async () => {
    const check = errorSql(
      547,
      'The INSERT statement conflicted with the CHECK constraint "CK_CrmOportunidad_etapa". The conflict occurred in database "HOLOMEDIC", table "dbo.CrmOportunidad", column \'etapa\'.',
    );
    const { pool } = makeFakePool(() => check);
    await expect(new SqlServerCrmOportunidadRepository(pool).create('e-1', NUEVA)).rejects.toBe(check);
  });

  it('rethrows any other database error untouched', async () => {
    const boom = errorSql(1205, 'deadlock');
    const { pool } = makeFakePool(() => boom);
    await expect(new SqlServerCrmOportunidadRepository(pool).create('e-1', NUEVA)).rejects.toBe(boom);
  });
});

describe('SqlServerCrmOportunidadRepository — updateDatos', () => {
  const ok = (sql: string): Respuesta =>
    /UPDATE\s+dbo\.CrmOportunidad/i.test(sql) ? { recordset: [{ idOportunidad: 'op-1' }] } : conFila(sql);

  it('replaces only the editable data: never etapa, medio or the loss reason', async () => {
    const { pool, consultas } = makeFakePool(ok);
    const op = await new SqlServerCrmOportunidadRepository(pool).updateDatos('op-1', {
      ...DATOS,
      nombre: 'Licitación 2027',
      montoEstimado: 12500.5,
    });
    const q = consultas[0];
    expect(q?.sql).toMatch(/UPDATE\s+dbo\.CrmOportunidad/i);
    expect(q?.sql).toMatch(/nombre\s*=\s*@nombre/i);
    expect(q?.sql).toMatch(/montoEstimado\s*=\s*@montoEstimado/i);
    expect(q?.sql).toMatch(/updatedAt\s*=\s*SYSUTCDATETIME\(\)/i);
    expect(q?.sql).not.toMatch(/\betapa\s*=|\bmedio\s*=|\bmotivo\w*\s*=/i);
    expect(q?.inputs).toMatchObject({
      id: 'op-1',
      nombre: 'Licitación 2027',
      responsableId: null,
      responsableNombre: null,
      origen: null,
      servicio: null,
      montoEstimado: 12500.5,
    });
    expect(op.idOportunidad).toBe('op-1');
  });

  it('throws OportunidadNotFoundError when no row matches the id', async () => {
    const { pool } = makeFakePool(() => ({ recordset: [] }));
    await expect(
      new SqlServerCrmOportunidadRepository(pool).updateDatos('nope', DATOS),
    ).rejects.toBeInstanceOf(OportunidadNotFoundError);
  });
});

describe('SqlServerCrmOportunidadRepository — updateSeguimiento', () => {
  const ok = (sql: string): Respuesta =>
    /UPDATE\s+dbo\.CrmOportunidad/i.test(sql) ? {} : conFila(sql);

  it('writes the stage, medium, loss reason and follow-up state, and the new activity, in ONE transaction', async () => {
    const { pool, consultas } = makeFakePool(ok);
    const op = await new SqlServerCrmOportunidadRepository(pool).updateSeguimiento(
      'op-1',
      {
        ...SEGUIMIENTO,
        etapa: 'perdida',
        medio: null,
        medioOtro: null,
        motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: null, notas: 'Muy caro' },
        faltaResponderDesde: '2026-10-29T08:30:00.000Z',
        sugerenciaDescartadaEn: 3,
      },
      INTERACCION,
    );
    const q = consultas[0];
    expect(q?.sql).toMatch(/SET\s+XACT_ABORT\s+ON/i);
    expect(q?.sql).toMatch(/BEGIN\s+TRAN/i);
    expect(q?.sql).toMatch(/COMMIT/i);
    expect(q?.sql).toMatch(/UPDATE\s+dbo\.CrmOportunidad/i);
    expect(q?.sql.match(/INSERT\s+INTO\s+dbo\.CrmInteraccion/gi)).toHaveLength(1);
    expect(q?.sql).toMatch(/50404/);
    expect(q?.inputs).toMatchObject({
      id: 'op-1',
      etapa: 'perdida',
      medio: null,
      medioOtro: null,
      motivoCategoria: 'precio',
      motivoDetalle1: 'S/ 7,000',
      motivoDetalle2: null,
      motivoNotas: 'Muy caro',
      intentosSinRespuesta: 1,
      faltaResponderDesde: new Date('2026-10-29T08:30:00.000Z'),
      proximaAccionTipo: 'otro',
      proximaAccionDetalle: 'x',
      proximaAccionFecha: '2026-11-03',
      sugerenciaDescartadaEn: 3,
      idUsuario: 'u-1',
      resultado: 'no_contesto',
    });
    // The activity links to THIS oportunidad, and its empresa comes from the row itself.
    expect(q?.sql).toMatch(
      /INSERT\s+INTO\s+dbo\.CrmInteraccion\s*\([^)]*\bidOportunidad\b[^)]*\)\s*VALUES\s*\(\s*\(SELECT\s+idEmpresa\s+FROM\s+dbo\.CrmOportunidad\s+WHERE\s+idOportunidad\s*=\s*@id\s*\)\s*,\s*@id\s*,/i,
    );
    expect(op.idOportunidad).toBe('op-1');
    // The write is a single round trip plus the read-back.
    expect(consultas).toHaveLength(2);
  });

  it('skips the INSERT when there is no interaction (card moved or suggestion dismissed)', async () => {
    const { pool, consultas } = makeFakePool(ok);
    await new SqlServerCrmOportunidadRepository(pool).updateSeguimiento('op-1', SEGUIMIENTO, null);
    expect(consultas[0]?.sql).not.toMatch(/CrmInteraccion/i);
    expect(consultas).toHaveLength(2);
  });

  it('stores NULL motivo columns when the oportunidad is not in Perdida', async () => {
    const { pool, consultas } = makeFakePool(ok);
    await new SqlServerCrmOportunidadRepository(pool).updateSeguimiento('op-1', SEGUIMIENTO, null);
    expect(consultas[0]?.inputs).toMatchObject({
      etapa: 'contactado',
      motivoCategoria: null,
      motivoDetalle1: null,
      motivoDetalle2: null,
      motivoNotas: null,
    });
  });

  it('stores a NULL próxima acción when the seguimiento has none', async () => {
    const { pool, consultas } = makeFakePool(ok);
    await new SqlServerCrmOportunidadRepository(pool).updateSeguimiento(
      'op-1',
      { ...SEGUIMIENTO, proximaAccion: null },
      null,
    );
    expect(consultas[0]?.inputs).toMatchObject({
      proximaAccionTipo: null,
      proximaAccionDetalle: null,
      proximaAccionFecha: null,
    });
    expect(consultas[0]?.sql).toMatch(/proximaAccionFecha\s*=\s*CONVERT\(DATE,\s*@proximaAccionFecha,\s*23\)/i);
  });

  it('maps "no row updated" to OportunidadNotFoundError', async () => {
    const { pool } = makeFakePool(() => errorSql(50404));
    await expect(
      new SqlServerCrmOportunidadRepository(pool).updateSeguimiento('nope', SEGUIMIENTO, INTERACCION),
    ).rejects.toBeInstanceOf(OportunidadNotFoundError);
  });

  it('rethrows any other database error untouched', async () => {
    const boom = errorSql(1205, 'deadlock');
    const { pool } = makeFakePool(() => boom);
    await expect(
      new SqlServerCrmOportunidadRepository(pool).updateSeguimiento('op-1', SEGUIMIENTO, INTERACCION),
    ).rejects.toBe(boom);
  });
});
