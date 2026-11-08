import { describe, expect, it } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerAtencionesRepository, fechaLima } from '../sqlServerAtencionesRepository';

interface Consulta {
  sql: string;
  inputs: Record<string, unknown>;
}

type Respuesta = { recordset?: unknown[] };

/** Fake pool: records every query and answers via `responder(sql)`. */
function makeFakePool(responder: (sql: string) => Respuesta = () => ({})) {
  const consultas: Consulta[] = [];
  const pool = {
    connect: async () => pool,
    request: () => {
      const inputs: Record<string, unknown> = {};
      const request = {
        input: (name: string, _type: unknown, value: unknown) => {
          inputs[name] = value;
          return request;
        },
        query: async (sql: string) => {
          consultas.push({ sql, inputs: { ...inputs } });
          return { recordset: responder(sql).recordset ?? [] };
        },
      };
      return request;
    },
  };
  return { pool: pool as unknown as mssql.ConnectionPool, consultas };
}

describe('SqlServerAtencionesRepository', () => {
  it('queries SIGLA by RUC and returns the last attention as a Lima date', async () => {
    const { pool, consultas } = makeFakePool(() => ({
      recordset: [{ UltimaAtencion: new Date('2026-06-15T20:35:00.000Z') }],
    }));
    const repo = new SqlServerAtencionesRepository(async () => pool);

    const fecha = await repo.ultimaAtencion('20512345678');

    expect(fecha).toBe('2026-06-15'); // 20:35 UTC = 15:35 Lima, same day
    expect(consultas).toHaveLength(1);
    expect(consultas[0].inputs.ruc).toBe('20512345678');
    expect(consultas[0].sql).toContain('FROM Cliente');
    expect(consultas[0].sql).toContain('LEFT JOIN Orden');
    expect(consultas[0].sql).toContain('MAX(O.FecAte)');
    expect(consultas[0].sql).toContain('@ruc');
  });

  it('returns null when SIGLA has no attention for the RUC (LEFT JOIN yields NULL)', async () => {
    const { pool } = makeFakePool(() => ({ recordset: [{ UltimaAtencion: null }] }));
    const repo = new SqlServerAtencionesRepository(async () => pool);

    expect(await repo.ultimaAtencion('20999999999')).toBeNull();
  });

  it('returns null when the RUC matches no Cliente row', async () => {
    const { pool } = makeFakePool(() => ({ recordset: [] }));
    const repo = new SqlServerAtencionesRepository(async () => pool);

    expect(await repo.ultimaAtencion('20000000000')).toBeNull();
  });

  it('maps a late-UTC attention to its Lima calendar day', () => {
    // 2026-06-15T05:00:00Z is still 2026-06-15 in Lima (UTC-5).
    expect(fechaLima(new Date('2026-06-15T05:00:00.000Z'))).toBe('2026-06-15');
    // 2026-06-16T04:00:00Z is still 2026-06-15 in Lima.
    expect(fechaLima(new Date('2026-06-16T04:00:00.000Z'))).toBe('2026-06-15');
  });
});
