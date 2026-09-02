import { describe, expect, it } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerParametroRepository } from '../SqlServerParametroRepository';

/**
 * SQL contract for `SqlServerParametroRepository.valor` — the read-only
 * access to dbo.parametros_sistema. The heartbeat reads
 * TARDANZA_ALARMA_RELOJ_SEG (REQ-F1-03) through this port; the dashboard
 * will read WORKER_CAIDO_SEG (ADR-5) through the same adapter.
 */

interface Consulta {
  sql: string;
  inputs: Record<string, unknown>;
}

function makeFakePool(recordset: unknown[] = []) {
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
          return { recordset, rowsAffected: [recordset.length] };
        },
      };
      return request;
    },
  };
  return { pool: pool as unknown as mssql.ConnectionPool, consultas };
}

describe('SqlServerParametroRepository.valor', () => {
  it('reads dbo.parametros_sistema.valor by clave with the parameter bound', async () => {
    const { pool, consultas } = makeFakePool([{ valor: '60' }]);
    const repo = new SqlServerParametroRepository(pool);
    const valor = await repo.valor('TARDANZA_ALARMA_RELOJ_SEG');
    expect(consultas).toHaveLength(1);
    const { sql, inputs } = consultas[0] ?? { sql: '', inputs: {} };
    expect(sql).toMatch(/SELECT\s+valor\s+FROM\s+dbo\.parametros_sistema\s+WHERE\s+clave\s*=\s*@clave/i);
    expect(inputs['clave']).toBe('TARDANZA_ALARMA_RELOJ_SEG');
    expect(valor).toBe('60');
  });

  it('resolves to null when the clave does not exist', async () => {
    const { pool } = makeFakePool([]);
    const repo = new SqlServerParametroRepository(pool);
    await expect(repo.valor('CLAVE_INEXISTENTE')).resolves.toBeNull();
  });
});
