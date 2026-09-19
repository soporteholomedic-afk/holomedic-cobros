import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getHolomedicPool } from '@/lib/db';

import type { CrearEmpresaInput } from '../../../domain/entities';
import { NotFoundError } from '../../../domain/errors';
import type { AsignacionAPersistir } from '../../../domain/ports';
import { SqlServerAsignacionesRepository } from '../sqlServerAsignacionesRepository';
import { SqlServerEmpresaRepository } from '../sqlServerEmpresaRepository';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `SqlServerAsignacionesRepository` (tasks
 * pr14/WU2, spec G5) against the real local HOLOMEDIC SQL Server:
 * - ONE `withCrmTransaction` per assignment event: the
 *   CRM_Empresas.responsable UPDATE + the CRM_Asignaciones INSERT land
 *   together — a mid-flight failure (CK violation on the accion)
 *   rolls BOTH back, leaving the owner untouched (design §2d).
 * - ASIGNADO / REASIGNADO / DEVUELTO rows carry previo/nuevo (NULL =
 *   pool) and the acting user.
 * - `listarAsignaciones` returns the per-empresa history newest first
 *   (spec G5 reassignment-history scenario) with BIGINT ids Number()-ed.
 * - A missing empresa raises the typed NotFoundError.
 *
 * Probe rows use a reserved rucNormalizado; every test cleans up in
 * `finally` and FK CASCADE removes the asignaciones with the empresa —
 * zero residue (pr3 suite precedent).
 */

const PROBE_RUCS = ['0000000000979', '0000000000978'];
const PROBE_KEY = `rucNormalizado IN ('${PROBE_RUCS.join("','")}')`;

let pool: mssql.ConnectionPool;
let empresas: SqlServerEmpresaRepository;
let asignaciones: SqlServerAsignacionesRepository;

beforeAll(async () => {
  pool = await getHolomedicPool();
  await pool.connect();
  await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
  empresas = new SqlServerEmpresaRepository(pool);
  asignaciones = new SqlServerAsignacionesRepository(pool);
});

afterAll(async () => {
  if (pool) {
    await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    await pool.close();
  }
});

async function crearProbeEmpresa(): Promise<number> {
  const datos: CrearEmpresaInput = {
    ruc: PROBE_RUCS[0] as string,
    razonSocial: 'Probe Asignaciones SA',
    tipo: 'Prospecto',
    contactos: [{ nombre: 'Ana Probe', correos: ['ana@asignaciones.test'] }],
  };
  const empresa = await empresas.crear(datos);
  return empresa.id;
}

async function responsableActual(empresaId: number): Promise<string | null> {
  const result = await pool
    .request()
    .input('empresaId', mssql.Int, empresaId)
    .query(`SELECT responsable FROM dbo.CRM_Empresas WHERE id = @empresaId`);
  return (result.recordset[0]?.responsable as string | null) ?? null;
}

function eventoCon(overrides: Partial<AsignacionAPersistir>): AsignacionAPersistir {
  return {
    empresaId: 1,
    accion: 'ASIGNADO',
    responsablePrevio: null,
    responsableNuevo: 'jperez',
    actorUsuario: 'admin',
    ...overrides,
  };
}

describe('SqlServerAsignacionesRepository — ONE-transaction assignment events', () => {
  it('ASIGNADO: sets the owner AND writes the event row (previo null)', async () => {
    const empresaId = await crearProbeEmpresa();
    try {
      await asignaciones.registrarAsignacion(
        eventoCon({ empresaId, accion: 'ASIGNADO', responsablePrevio: null, responsableNuevo: 'jperez' }),
      );

      expect(await responsableActual(empresaId)).toBe('jperez');
      const filas = await asignaciones.listarAsignaciones(empresaId);
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        empresaId,
        accion: 'ASIGNADO',
        responsablePrevio: null,
        responsableNuevo: 'jperez',
        actorUsuario: 'admin',
      });
      expect(typeof filas[0]?.id).toBe('number');
      expect(filas[0]?.id).toBeGreaterThan(0);
      expect(filas[0]?.createdAt).toBeTruthy();
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('REASIGNADO replaces the owner; DEVUELTO nulls it — history newest first', async () => {
    const empresaId = await crearProbeEmpresa();
    try {
      await asignaciones.registrarAsignacion(
        eventoCon({ empresaId, accion: 'ASIGNADO', responsablePrevio: null, responsableNuevo: 'jperez' }),
      );
      await asignaciones.registrarAsignacion(
        eventoCon({
          empresaId,
          accion: 'REASIGNADO',
          responsablePrevio: 'jperez',
          responsableNuevo: 'mgarcia',
          actorUsuario: 'admin',
        }),
      );
      await asignaciones.registrarAsignacion(
        eventoCon({
          empresaId,
          accion: 'DEVUELTO',
          responsablePrevio: 'mgarcia',
          responsableNuevo: null,
          actorUsuario: 'mgarcia',
        }),
      );

      expect(await responsableActual(empresaId)).toBeNull();
      const filas = await asignaciones.listarAsignaciones(empresaId);
      expect(filas).toHaveLength(3);
      // Newest first (spec G5 order): DEVUELTO → REASIGNADO → ASIGNADO,
      // every event with its actor.
      expect(filas.map((f) => f.accion)).toEqual(['DEVUELTO', 'REASIGNADO', 'ASIGNADO']);
      expect(filas[0]).toMatchObject({ responsablePrevio: 'mgarcia', responsableNuevo: null, actorUsuario: 'mgarcia' });
      expect(filas[1]).toMatchObject({ responsablePrevio: 'jperez', responsableNuevo: 'mgarcia' });
      expect(filas[2]).toMatchObject({ responsablePrevio: null, responsableNuevo: 'jperez' });
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('a mid-flight CK violation rolls the OWNER update back (ONE transaction)', async () => {
    const empresaId = await crearProbeEmpresa();
    try {
      // The accion CHECK fires AFTER the responsable UPDATE inside the
      // tx — the rollback must leave the owner untouched.
      await expect(
        asignaciones.registrarAsignacion(
          eventoCon({
            empresaId,
            accion: 'ARCHIVADO' as AsignacionAPersistir['accion'],
            responsableNuevo: 'jperez',
          }),
        ),
      ).rejects.toThrow(/CK_CRM_Asignaciones_Accion/);

      expect(await responsableActual(empresaId)).toBeNull();
      const filas = await asignaciones.listarAsignaciones(empresaId);
      expect(filas).toHaveLength(0);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('raises NotFoundError when the empresa does not exist', async () => {
    await expect(
      asignaciones.registrarAsignacion(eventoCon({ empresaId: 2147000000 })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
