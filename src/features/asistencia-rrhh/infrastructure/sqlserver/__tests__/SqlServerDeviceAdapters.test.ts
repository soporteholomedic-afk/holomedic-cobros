import { describe, expect, it } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerDispositivoRepository } from '../SqlServerDispositivoRepository';
import { SqlServerAlertaRepository } from '../SqlServerAlertaRepository';
import { SqlServerComandoRepository } from '../SqlServerComandoRepository';

/**
 * SQL contracts for the three supporting adapters the ingestion route
 * uses: device Bearer lookup (ADR-7 byte equality on VARBINARY(32)),
 * alert creation, and the atomic PENDIENTE→ENVIADO command claim
 * (OUTPUT clause — the claim and the fetch are one statement, so a
 * command is delivered exactly once).
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

describe('SqlServerDispositivoRepository.porTokenHash (ADR-7)', () => {
  const hash = Buffer.alloc(32, 0xab);

  it('looks up dbo.dispositivos by exact apiTokenHash equality with the 32-byte buffer', async () => {
    const { pool, consultas } = makeFakePool([]);
    const repo = new SqlServerDispositivoRepository(pool);
    await repo.porTokenHash(hash);
    expect(consultas).toHaveLength(1);
    const { sql, inputs } = consultas[0] ?? { sql: '', inputs: {} };
    expect(sql).toMatch(/FROM\s+dbo\.dispositivos/i);
    expect(sql).toMatch(/apiTokenHash\s*=\s*@hash/i);
    expect(inputs['hash']).toBe(hash);
  });

  it('maps a row to the domain device — WITHOUT exposing apiTokenHash', async () => {
    const fila = {
      id: 7,
      codigo: 'K20-SEDE-01',
      sede: 'Sede Central',
      ip: '192.168.10.44',
      activo: true,
      ultimaSincronizacion: new Date('2026-09-01T07:59:00'),
      createdAt: new Date('2026-08-01T10:00:00'),
      updatedAt: new Date('2026-08-01T10:00:00'),
    };
    const { pool } = makeFakePool([fila]);
    const repo = new SqlServerDispositivoRepository(pool);
    const dispositivo = await repo.porTokenHash(hash);
    expect(dispositivo).toEqual(fila);
    expect(dispositivo && 'apiTokenHash' in dispositivo).toBe(false);
  });

  it('resolves to null when no device owns the hash', async () => {
    const { pool } = makeFakePool([]);
    const repo = new SqlServerDispositivoRepository(pool);
    await expect(repo.porTokenHash(hash)).resolves.toBeNull();
  });
});

describe('SqlServerAlertaRepository.crear', () => {
  it('inserts the alert with tipo, detalle and dispositivoId', async () => {
    const { pool, consultas } = makeFakePool([]);
    const repo = new SqlServerAlertaRepository(pool);
    await repo.crear('USER_ID_DESCONOCIDO', 'user_id sin ficha: "U404"', 7);
    expect(consultas).toHaveLength(1);
    const { sql, inputs } = consultas[0] ?? { sql: '', inputs: {} };
    expect(sql).toMatch(/INSERT\s+INTO\s+dbo\.alertas\s*\(\s*tipo,\s*detalle,\s*dispositivoId\s*\)/i);
    expect(inputs['tipo']).toBe('USER_ID_DESCONOCIDO');
    expect(inputs['detalle']).toContain('U404');
    expect(inputs['dispositivoId']).toBe(7);
  });

  it('binds NULL when no dispositivoId is given', async () => {
    const { pool, consultas } = makeFakePool([]);
    const repo = new SqlServerAlertaRepository(pool);
    await repo.crear('DRIFT_RELOJ', 'drift 75s > 60s');
    expect(consultas[0]?.inputs['dispositivoId']).toBeNull();
  });
});

describe('SqlServerComandoRepository.pendientesYMarcarEnviados', () => {
  it('claims with ONE atomic UPDATE…OUTPUT restricted to the device\u2019s PENDIENTE rows', async () => {
    const { pool, consultas } = makeFakePool([]);
    const repo = new SqlServerComandoRepository(pool);
    await repo.pendientesYMarcarEnviados(7);
    expect(consultas).toHaveLength(1);
    const { sql, inputs } = consultas[0] ?? { sql: '', inputs: {} };
    expect(sql).toMatch(/UPDATE\s+dbo\.comandos_dispositivo/i);
    expect(sql).toMatch(/SET\s+estado\s*=\s*'ENVIADO'/i);
    expect(sql).toMatch(/OUTPUT\s+inserted\./i);
    expect(sql).toMatch(/estado\s*=\s*'PENDIENTE'/i);
    expect(inputs['dispositivoId']).toBe(7);
  });

  it('maps the OUTPUT rows to Comando entities in delivery order', async () => {
    const ahora = new Date('2026-09-01T08:01:00');
    const { pool } = makeFakePool([
      {
        id: 21,
        dispositivoId: 7,
        tipo: 'SET_TIME',
        payload: '{"drift_seg":75}',
        estado: 'ENVIADO',
        createdAt: new Date('2026-09-01T08:00:00'),
        enviadoAt: ahora,
        confirmadoAt: null,
      },
      {
        id: 22,
        dispositivoId: 7,
        tipo: 'SYNC_COMPLETO',
        payload: null,
        estado: 'ENVIADO',
        createdAt: new Date('2026-09-01T08:00:30'),
        enviadoAt: ahora,
        confirmadoAt: null,
      },
    ]);
    const repo = new SqlServerComandoRepository(pool);
    const comandos = await repo.pendientesYMarcarEnviados(7);
    expect(comandos).toHaveLength(2);
    expect(comandos[0]).toMatchObject({ id: 21, tipo: 'SET_TIME', estado: 'ENVIADO' });
    expect(comandos[1]).toMatchObject({ id: 22, tipo: 'SYNC_COMPLETO', payload: null });
    expect(comandos[0]?.enviadoAt).toEqual(ahora);
  });

  it('returns an empty list when the device has no PENDIENTE commands', async () => {
    const { pool } = makeFakePool([]);
    const repo = new SqlServerComandoRepository(pool);
    await expect(repo.pendientesYMarcarEnviados(7)).resolves.toEqual([]);
  });
});
