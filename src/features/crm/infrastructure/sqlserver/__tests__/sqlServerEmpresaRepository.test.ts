import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getHolomedicPool } from '@/lib/db';

import type { CrearEmpresaInput } from '../../../domain/entities';
import { ConflictError } from '../../../domain/errors';
import { SqlServerEmpresaRepository } from '../sqlServerEmpresaRepository';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `SqlServerEmpresaRepository` (tasks
 * pr3/WU3) against the real local HOLOMEDIC SQL Server:
 * - aggregate mapping (empresa + contactos + correos, normalized
 *   storage forms, exactly-one-principal as provided);
 * - UQ violations mapped to the typed `ConflictError` (RUC dedup,
 *   duplicate contacto name, filtered principal index backstop);
 * - listar filters matching the port contract semantics;
 * - obtenerPorId/actualizar incl. the missing-id null paths.
 *
 * Probe rows use reserved rucNormalizado values; every test cleans up
 * in `finally` and the FK CASCADE removes contactos/correos with the
 * empresa — zero residue (pr2 suite precedent).
 */

const PROBE_RUCS = ['0000000000997', '0000000000996', '0000000000995'];
const PROBE_KEY = `rucNormalizado IN ('${PROBE_RUCS.join("','")}')`;

let pool: mssql.ConnectionPool;

beforeAll(async () => {
  pool = await getHolomedicPool();
  await pool.connect();
  await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
});

afterAll(async () => {
  if (pool) {
    await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    await pool.close();
  }
});

function inputAlfa(): CrearEmpresaInput {
  return {
    ruc: ' 0000-0000-00997 ', // normalization is the adapter's job
    razonSocial: 'Probe Alfa SA',
    tipo: 'Cliente',
    origen: 'Inbound',
    proyectoObra: 'Obra Norte',
    notas: 'fila de prueba',
    responsable: 'testuser1',
    contactos: [
      {
        nombre: 'José Pérez',
        telefono: '0981 555 222',
        correos: ['Jose@Perez.com', 'jose@perez.com', 'OTRO@x.com'],
      },
      { nombre: 'Ana Díaz', correos: ['ana@diaz.com'], esPrincipal: true },
    ],
  };
}

describe('SqlServerEmpresaRepository', () => {
  it('crear maps the full aggregate: raw ruc + normalized key, contactos, deduped lowercase correos, principal as provided', async () => {
    const repo = new SqlServerEmpresaRepository(pool);
    try {
      const empresa = await repo.crear(inputAlfa());

      expect(empresa.ruc).toBe('0000-0000-00997'); // stored trimmed; dashes kept
      expect(empresa.rucNormalizado).toBe('0000000000997');
      expect(empresa.razonSocial).toBe('Probe Alfa SA');
      expect(empresa.tipo).toBe('Cliente');
      expect(empresa.origen).toBe('Inbound');
      expect(empresa.proyectoObra).toBe('Obra Norte');
      expect(empresa.notas).toBe('fila de prueba');
      expect(empresa.responsable).toBe('testuser1');
      expect(empresa.createdAt).toBeTruthy();

      expect(empresa.contactos).toHaveLength(2);
      const [jose, ana] = empresa.contactos;
      expect(jose?.empresaId).toBe(empresa.id);
      expect(jose?.nombre).toBe('José Pérez');
      expect(jose?.telefono).toBe('0981 555 222');
      expect(jose?.esPrincipal).toBe(false);
      // normalized (lowercase) and deduped (UQ_CRM_Correos_ContactoCorreo union form)
      expect(jose?.correos.map((c) => c.correo)).toEqual(['jose@perez.com', 'otro@x.com']);
      expect(ana?.esPrincipal).toBe(true);

      // The D1 merge key is stored accent-stripped for 'José Pérez'.
      const nombreNormalizado = await pool
        .request()
        .input('contactoId', mssql.Int, jose?.id)
        .query('SELECT nombreNormalizado FROM dbo.CRM_Contactos WHERE id = @contactoId');
      expect(nombreNormalizado.recordset[0]?.nombreNormalizado).toBe('jose perez');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('crear rejects a duplicated normalized RUC with ConflictError', async () => {
    const repo = new SqlServerEmpresaRepository(pool);
    try {
      await repo.crear(inputAlfa());

      await expect(repo.crear(inputAlfa())).rejects.toBeInstanceOf(ConflictError);
      await expect(repo.crear(inputAlfa())).rejects.toThrow('Ya existe una empresa con ese RUC');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('crear rejects a duplicated contacto name within the same empresa (UQ_CRM_Contactos_EmpresaNombre) and persists nothing', async () => {
    const repo = new SqlServerEmpresaRepository(pool);
    try {
      const duplicado = inputAlfa();
      duplicado.contactos = [
        { nombre: 'Mismo Nombre', correos: ['a@x.com'] },
        { nombre: 'mismo  nombre', correos: ['b@x.com'] },
      ];

      await expect(repo.crear(duplicado)).rejects.toThrow(/nombre/i);
      // The whole transaction rolled back — the empresa never landed.
      const rows = await pool
        .request()
        .query(`SELECT id FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
      expect(rows.recordset).toHaveLength(0);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('crear rejects a second principal through the filtered index backstop (UX_CRM_Contactos_Principal)', async () => {
    const repo = new SqlServerEmpresaRepository(pool);
    try {
      const dosPrincipales = inputAlfa();
      dosPrincipales.contactos = [
        { nombre: 'Principal Uno', correos: ['p1@x.com'], esPrincipal: true },
        { nombre: 'Principal Dos', correos: ['p2@x.com'], esPrincipal: true },
      ];

      await expect(repo.crear(dosPrincipales)).rejects.toThrow(/principal/i);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('listar applies q/tipo/responsable filters per the port contract', async () => {
    const repo = new SqlServerEmpresaRepository(pool);
    try {
      await repo.crear(inputAlfa());
      await repo.crear({
        ruc: '0000000000996',
        razonSocial: 'Probe Beta SA',
        tipo: 'Prospecto',
        contactos: [{ nombre: 'Beta Contacto', correos: ['beta@x.com'] }],
      });
      await repo.crear({
        ruc: '0000000000995',
        razonSocial: 'Probe Gamma SA',
        tipo: 'Prospecto',
        responsable: 'testuser2',
        contactos: [{ nombre: 'Gamma Contacto', correos: ['gamma@x.com'] }],
      });

      const todas = await repo.listar();
      expect(todas.map((e) => e.razonSocial)).toEqual(
        expect.arrayContaining(['Probe Alfa SA', 'Probe Beta SA', 'Probe Gamma SA']),
      );

      const porQ = await repo.listar({ q: 'alfa' });
      expect(porQ.map((e) => e.razonSocial)).toEqual(['Probe Alfa SA']);

      const porRucParcial = await repo.listar({ q: '000000000099' });
      expect(porRucParcial).toHaveLength(3); // digit fragment hits every rucNormalizado

      const clientes = await repo.listar({ tipo: 'Cliente' });
      expect(clientes.map((e) => e.razonSocial)).toEqual(['Probe Alfa SA']);

      const deTestUser1 = await repo.listar({ responsable: 'testuser1' });
      expect(deTestUser1.map((e) => e.razonSocial)).toEqual(['Probe Alfa SA']);

      const delPool = await repo.listar({ responsable: null });
      expect(delPool.map((e) => e.razonSocial)).toEqual(['Probe Beta SA']);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('obtenerPorId returns the aggregate or null when absent', async () => {
    const repo = new SqlServerEmpresaRepository(pool);
    try {
      const creada = await repo.crear(inputAlfa());

      const encontrada = await repo.obtenerPorId(creada.id);
      expect(encontrada?.id).toBe(creada.id);
      expect(encontrada?.contactos[0]?.correos.length).toBeGreaterThan(0);

      expect(await repo.obtenerPorId(987654321)).toBeNull();
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('actualizar applies only provided changes; returns null for a missing id', async () => {
    const repo = new SqlServerEmpresaRepository(pool);
    try {
      const creada = await repo.crear(inputAlfa());

      const actualizada = await repo.actualizar(creada.id, {
        razonSocial: 'Probe Alfa Mutada SA',
        responsable: null,
      });
      expect(actualizada?.razonSocial).toBe('Probe Alfa Mutada SA');
      expect(actualizada?.responsable).toBeNull(); // explicit null clears the assignment
      expect(actualizada?.tipo).toBe('Cliente'); // untouched field survives

      const releida = await repo.obtenerPorId(creada.id);
      expect(releida?.razonSocial).toBe('Probe Alfa Mutada SA');

      expect(await repo.actualizar(987654321, { notas: 'x' })).toBeNull();
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });
});
