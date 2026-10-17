import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';

import { SqlServerConfigRepository } from '../sqlServerConfigRepository';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `SqlServerConfigRepository`
 * (agente-ia-crm E5·T2) against the real SHARED HOLOMEDIC SQL Server.
 * Probe rules (same as the other repo suites): a per-run random key
 * prefix (`probe.<suffix>.`), own rows only, every probe key and its
 * audit rows deleted in `afterAll` (and per-test where cheap), zero
 * assumptions about foreign rows.
 *
 * Pinned here: guardar is an upsert; the audit row is written in the
 * SAME transaction; non-secret audits keep the old/new values; SECRET
 * audits NEVER carry values (only the fact of the change); listar
 * filters by exact prefix and escapes LIKE wildcards; obtener returns
 * null for an unknown key; the audit listing is newest-first and
 * bounded.
 */

const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const PREFIJO = `probe.${SUFIJO}.`;

let pool: mssql.ConnectionPool;
let repo: SqlServerConfigRepository;

async function limpiar(): Promise<void> {
  await pool
    .request()
    .input('patron', mssql.NVarChar, `${PREFIJO.replace(/[%_[]/g, (c) => `[${c}]`)}%`)
    .query('DELETE FROM dbo.CRM_ConfigAuditoria WHERE clave LIKE @patron');
  await pool
    .request()
    .input('patron', mssql.NVarChar, `${PREFIJO.replace(/[%_[]/g, (c) => `[${c}]`)}%`)
    .query('DELETE FROM dbo.CRM_Config WHERE clave LIKE @patron');
}

beforeAll(async () => {
  const db = await getCrmDb();
  pool = db.pool;
  repo = new SqlServerConfigRepository(pool);
  await limpiar();
});

afterAll(async () => {
  await limpiar();
});

describe('SqlServerConfigRepository', () => {
  it('returns null for an unknown key', async () => {
    expect(await repo.obtener(`${PREFIJO}no-existe`)).toBeNull();
  });

  it('guardar inserts, then updates the same key (upsert)', async () => {
    const clave = `${PREFIJO}umbral`;

    await repo.guardar({ clave, valor: '0.60', esSecreto: false, usuario: 'ana' });
    const primera = await repo.obtener(clave);
    expect(primera).toMatchObject({
      clave,
      valor: '0.60',
      esSecreto: false,
      actualizadoPor: 'ana',
    });
    expect(primera?.actualizadoEn).toBeInstanceOf(Date);

    await repo.guardar({ clave, valor: '0.75', esSecreto: false, usuario: 'beto' });
    const segunda = await repo.obtener(clave);
    expect(segunda).toMatchObject({ valor: '0.75', actualizadoPor: 'beto' });

    const filas = await repo.listar(PREFIJO);
    expect(filas.filter((fila) => fila.clave === clave)).toHaveLength(1);
  });

  it('records a non-secret audit with old and new values', async () => {
    const clave = `${PREFIJO}horario`;

    await repo.guardar({ clave, valor: '8', esSecreto: false, usuario: 'ana' });
    await repo.guardar({ clave, valor: '9', esSecreto: false, usuario: 'beto' });

    const auditoria = (await repo.listarAuditoria({ clave })).filter(
      (fila) => fila.clave === clave,
    );
    expect(auditoria).toHaveLength(2);
    // newest first
    expect(auditoria[0]).toMatchObject({
      usuario: 'beto',
      valorAnterior: '8',
      valorNuevo: '9',
      esSecreto: false,
    });
    expect(auditoria[1]).toMatchObject({
      usuario: 'ana',
      valorAnterior: null,
      valorNuevo: '8',
    });
  });

  it('NEVER stores secret values in the audit trail', async () => {
    const clave = `${PREFIJO}api-key`;

    await repo.guardar({ clave, valor: 'v1:cifrado-a', esSecreto: true, usuario: 'ana' });
    await repo.guardar({ clave, valor: 'v1:cifrado-b', esSecreto: true, usuario: 'ana' });

    const auditoria = await repo.listarAuditoria({ clave });
    expect(auditoria).toHaveLength(2);
    for (const fila of auditoria) {
      expect(fila.esSecreto).toBe(true);
      expect(fila.valorAnterior).toBeNull();
      expect(fila.valorNuevo).toBeNull();
    }
    // …while the stored row keeps the (already encrypted) payload.
    expect((await repo.obtener(clave))?.valor).toBe('v1:cifrado-b');
  });

  it('listar filters by exact prefix and treats LIKE wildcards literally', async () => {
    await repo.guardar({ clave: `${PREFIJO}agente.a`, valor: '1', esSecreto: false, usuario: 'u' });
    await repo.guardar({ clave: `${PREFIJO}agente.b`, valor: '2', esSecreto: false, usuario: 'u' });
    await repo.guardar({ clave: `${PREFIJO}kapso.a`, valor: '3', esSecreto: false, usuario: 'u' });

    const agente = await repo.listar(`${PREFIJO}agente.`);
    expect(agente.map((fila) => fila.clave).sort()).toEqual([
      `${PREFIJO}agente.a`,
      `${PREFIJO}agente.b`,
    ]);

    // '_' must not behave as a single-char wildcard.
    expect(await repo.listar(`${PREFIJO}agent_.`)).toEqual([]);
    // '%' must not match everything.
    expect(await repo.listar(`${PREFIJO}%`)).toEqual([]);
  });

  it('listarAuditoria honors a bounded limit', async () => {
    const clave = `${PREFIJO}limite`;
    for (let i = 0; i < 4; i += 1) {
      await repo.guardar({ clave, valor: String(i), esSecreto: false, usuario: 'u' });
    }

    const dos = await repo.listarAuditoria({ clave, limite: 2 });
    expect(dos).toHaveLength(2);
    expect(dos[0].valorNuevo).toBe('3');
  });

  it('rejects an empty key', async () => {
    await expect(
      repo.guardar({ clave: '  ', valor: 'x', esSecreto: false, usuario: 'u' }),
    ).rejects.toThrow();
  });

  it('eliminar removes the key and audits the deletion', async () => {
    const clave = `${PREFIJO}borrable`;
    await repo.guardar({ clave, valor: 'hola', esSecreto: false, usuario: 'ana' });

    await repo.eliminar({ clave, usuario: 'beto' });

    expect(await repo.obtener(clave)).toBeNull();
    const auditoria = await repo.listarAuditoria({ clave });
    expect(auditoria[0]).toMatchObject({
      usuario: 'beto',
      valorAnterior: 'hola',
      valorNuevo: null,
    });
  });
});
