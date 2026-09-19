import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getHolomedicPool } from '@/lib/db';

import type { CrearEmpresaInput } from '../../../domain/entities';
import { NotFoundError } from '../../../domain/errors';
import { estadoInicial } from '../../../domain/maquinaEstados';
import type { EnvioCadenciaAPersistir, TransicionAPersistir } from '../../../domain/ports';
import { SqlServerEmpresaRepository } from '../sqlServerEmpresaRepository';
import { SqlServerPipelineRepository } from '../sqlServerPipelineRepository';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `SqlServerPipelineRepository` (tasks
 * pr10/WU2) against the real local HOLOMEDIC SQL Server:
 * - T1/T6 seeding: `SqlServerEmpresaRepository.crear` lands the 1:1
 *   pipeline row derived from the origen (rows are born WITH the
 *   empresa — the transitions endpoint only ever applies moves).
 * - `registrarTransicion` — the ONE-transaction write of pipeline row
 *   + CRM_Transiciones audit + optional CRM_Resultados / CRM_Handoffs
 *   rows (design §2b); a mid-flight failure rolls the WHOLE bundle
 *   back (proven with a CK violation on the result insert).
 * - DATE round-trips: the adapter owns the DATE ↔ 'YYYY-MM-DD' mapping.
 * - T14 motivo + cooldown, T12 re-arm and T5 handoff — the pr10
 *   mandates — through real SQL.
 * - `cambiarTipo` (T16): empresas.tipo + optional conversion event.
 *
 * Probe rows use reserved rucNormalizado values; every test cleans up
 * in `finally` and FK CASCADE removes pipeline/history/handoffs with
 * the empresa — zero residue (pr3 suite precedent).
 */

const PROBE_RUCS = ['0000000000989', '0000000000988', '0000000000987'];
const PROBE_KEY = `rucNormalizado IN ('${PROBE_RUCS.join("','")}')`;

let pool: mssql.ConnectionPool;
let empresas: SqlServerEmpresaRepository;
let pipelines: SqlServerPipelineRepository;

beforeAll(async () => {
  pool = await getHolomedicPool();
  await pool.connect();
  await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
  empresas = new SqlServerEmpresaRepository(pool);
  pipelines = new SqlServerPipelineRepository(pool);
});

afterAll(async () => {
  if (pool) {
    await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    await pool.close();
  }
});

function inputCon(origen: 'Inbound' | 'Outbound' | null, tipo: 'Cliente' | 'Prospecto' = 'Prospecto'): CrearEmpresaInput {
  return {
    ruc: PROBE_RUCS[0] as string,
    razonSocial: 'Probe Pipeline SA',
    tipo,
    origen,
    contactos: [{ nombre: 'Ana Probe', correos: ['ana@pipeline.test'] }],
  };
}

/** Land a probe empresa and force its pipeline row into an arbitrary state. */
async function crearConEstado(
  flujo: 'INBOUND' | 'OUTBOUND',
  etapa: string,
  counters: { ciclo?: number; enviosCiclo?: number; fechaCicloInicio?: string | null; fechaUltimoEnvio?: string | null } = {},
): Promise<number> {
  const empresa = await empresas.crear(inputCon(flujo === 'INBOUND' ? 'Inbound' : 'Outbound'));
  await pool
    .request()
    .input('empresaId', mssql.Int, empresa.id)
    .input('flujo', mssql.VarChar(10), flujo)
    .input('etapa', mssql.VarChar(20), etapa)
    .input('ciclo', mssql.Int, counters.ciclo ?? 1)
    .input('enviosCiclo', mssql.Int, counters.enviosCiclo ?? 0)
    .input('fechaCicloInicio', mssql.Date, counters.fechaCicloInicio ?? null)
    .input('fechaUltimoEnvio', mssql.Date, counters.fechaUltimoEnvio ?? null).query(`
      UPDATE dbo.CRM_Pipeline
      SET flujo = @flujo, etapa = @etapa, ciclo = @ciclo, enviosCiclo = @enviosCiclo,
          fechaCicloInicio = @fechaCicloInicio, fechaUltimoEnvio = @fechaUltimoEnvio
      WHERE empresaId = @empresaId
    `);
  return empresa.id;
}

function bundleCon(overrides: Partial<TransicionAPersistir>): TransicionAPersistir {
  return {
    empresaId: 1,
    usuario: 'jperez',
    evento: 'CotizaciónEnviada',
    motivo: null,
    hoy: '2026-06-01',
    estadoPrevio: { flujo: 'INBOUND', etapa: 'REGISTRADO' },
    estadoNuevo: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' },
    resultado: 'CotizaciónEnviada',
    efectos: {
      ciclo: 1,
      enviosCiclo: 1,
      fechaCicloInicio: '2026-06-01',
      fechaUltimoEnvio: '2026-06-01',
      descansoHasta: null,
      rechazadoHasta: null,
      motivoRechazo: null,
    },
    handoff: null,
    ...overrides,
  };
}

async function contar(tabla: string, empresaId: number): Promise<number> {
  const result = await pool
    .request()
    .input('empresaId', mssql.Int, empresaId)
    .query(`SELECT id FROM dbo.${tabla} WHERE empresaId = @empresaId`);
  return result.recordset.length;
}

describe('SqlServerPipelineRepository — T1/T6 seeding at empresa creation', () => {
  it('crear() seeds the 1:1 pipeline row from the origen (T1: Inbound → INBOUND/REGISTRADO, defaults ciclo=1 envios=0)', async () => {
    try {
      const empresa = await empresas.crear(inputCon('Inbound'));

      const fila = await pipelines.obtenerPorEmpresaId(empresa.id);
      expect(fila).not.toBeNull();
      expect(fila?.flujo).toBe('INBOUND');
      expect(fila?.etapa).toBe('REGISTRADO');
      expect(fila?.ciclo).toBe(1);
      expect(fila?.enviosCiclo).toBe(0);
      expect(fila?.fechaCicloInicio).toBeNull();
      expect(fila?.fechaUltimoEnvio).toBeNull();
      expect(fila?.descansoHasta).toBeNull();
      expect(fila?.rechazadoHasta).toBeNull();
      expect(fila?.motivoRechazo).toBeNull();
      expect(estadoInicial('Inbound')).toEqual({ flujo: 'INBOUND', etapa: 'REGISTRADO' });
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('crear() without origen lands NO pipeline row (T1/T6 need a door)', async () => {
    try {
      const empresa = await empresas.crear(inputCon(null));
      expect(await pipelines.obtenerPorEmpresaId(empresa.id)).toBeNull();
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('obtenerPorEmpresaId returns null for an unknown empresa', async () => {
    expect(await pipelines.obtenerPorEmpresaId(-7)).toBeNull();
  });
});

describe('SqlServerPipelineRepository — DATE mapping', () => {
  it('round-trips DATE columns as exact YYYY-MM-DD strings', async () => {
    try {
      const empresa = await empresas.crear(inputCon('Outbound'));
      await pool
        .request()
        .input('empresaId', mssql.Int, empresa.id).query(`
          UPDATE dbo.CRM_Pipeline
          SET fechaCicloInicio = '2026-02-01', fechaUltimoEnvio = '2026-03-10',
              descansoHasta = '2026-06-10', rechazadoHasta = '2026-09-01',
              motivoRechazo = 'Sin presupuesto'
          WHERE empresaId = @empresaId
        `);

      const fila = await pipelines.obtenerPorEmpresaId(empresa.id);
      expect(fila?.fechaCicloInicio).toBe('2026-02-01');
      expect(fila?.fechaUltimoEnvio).toBe('2026-03-10');
      expect(fila?.descansoHasta).toBe('2026-06-10');
      expect(fila?.rechazadoHasta).toBe('2026-09-01');
      expect(fila?.motivoRechazo).toBe('Sin presupuesto');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });
});

describe('SqlServerPipelineRepository — the atomic registrarTransicion', () => {
  it('T2 writes pipeline row + CRM_Transiciones + CRM_Resultados in ONE transaction', async () => {
    try {
      const empresa = await empresas.crear(inputCon('Inbound'));

      const fila = await pipelines.registrarTransicion(
        bundleCon({ empresaId: empresa.id }),
      );

      // Pipeline row updated with the armed counters and the actor.
      expect(fila.etapa).toBe('SEGUIMIENTO');
      expect(fila.enviosCiclo).toBe(1);
      expect(fila.fechaCicloInicio).toBe('2026-06-01');
      expect(fila.fechaUltimoEnvio).toBe('2026-06-01');
      expect(fila.updatedBy).toBe('jperez');

      // Audit: who, when, from, to (spec G4).
      const transiciones = await pool
        .request()
        .input('empresaId', mssql.Int, empresa.id)
        .query(`SELECT flujoPrevio, etapaPrevia, flujoNuevo, etapaNueva, evento, motivo, usuario
                FROM dbo.CRM_Transiciones WHERE empresaId = @empresaId`);
      expect(transiciones.recordset).toHaveLength(1);
      expect(transiciones.recordset[0]).toMatchObject({
        flujoPrevio: 'INBOUND',
        etapaPrevia: 'REGISTRADO',
        flujoNuevo: 'INBOUND',
        etapaNueva: 'SEGUIMIENTO',
        evento: 'CotizaciónEnviada',
        motivo: null,
        usuario: 'jperez',
      });

      // Result event attributed to the acting user on the business date.
      const resultados = await pool
        .request()
        .input('empresaId', mssql.Int, empresa.id)
        .query(`SELECT tipo, usuario, fecha FROM dbo.CRM_Resultados WHERE empresaId = @empresaId`);
      expect(resultados.recordset).toHaveLength(1);
      expect(resultados.recordset[0]?.tipo).toBe('CotizaciónEnviada');
      expect(resultados.recordset[0]?.usuario).toBe('jperez');
      expect(resultados.recordset[0]?.fecha).toBeInstanceOf(Date);
      expect((resultados.recordset[0]?.fecha as Date).toISOString().slice(0, 10)).toBe('2026-06-01');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('T5 lands the CRM_Handoffs record next to the audit and result rows', async () => {
    try {
      const empresaId = await crearConEstado('INBOUND', 'CONFIRMADA');

      await pipelines.registrarTransicion(
        bundleCon({
          empresaId,
          evento: 'HandoffRegistrado',
          estadoPrevio: { flujo: 'INBOUND', etapa: 'CONFIRMADA' },
          estadoNuevo: { flujo: 'INBOUND', etapa: 'ENTREGADA' },
          resultado: 'HandoffRegistrado',
          efectos: {
            ciclo: 1,
            enviosCiclo: 0,
            fechaCicloInicio: null,
            fechaUltimoEnvio: null,
            descansoHasta: null,
            rechazadoHasta: null,
            motivoRechazo: null,
          },
          handoff: { area: 'Operaciones', nota: 'Coordinar entrega' },
        }),
      );

      expect(await pipelines.obtenerPorEmpresaId(empresaId).then((f) => f?.etapa)).toBe('ENTREGADA');
      expect(await contar('CRM_Transiciones', empresaId)).toBe(1);
      expect(await contar('CRM_Resultados', empresaId)).toBe(1);
      const handoffs = await pool
        .request()
        .input('empresaId', mssql.Int, empresaId)
        .query(`SELECT area, nota, usuario FROM dbo.CRM_Handoffs WHERE empresaId = @empresaId`);
      expect(handoffs.recordset).toHaveLength(1);
      expect(handoffs.recordset[0]).toMatchObject({
        area: 'Operaciones',
        nota: 'Coordinar entrega',
        usuario: 'jperez',
      });
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('T14 persists the motivo (audit + mirror) and the 3-month cooldown date', async () => {
    try {
      const empresaId = await crearConEstado('INBOUND', 'SEGUIMIENTO', { enviosCiclo: 1, fechaUltimoEnvio: '2026-05-25' });

      const fila = await pipelines.registrarTransicion(
        bundleCon({
          empresaId,
          evento: 'Rechazo',
          motivo: 'Ya tiene proveedor',
          estadoPrevio: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' },
          estadoNuevo: { flujo: 'INBOUND', etapa: 'RECHAZADO' },
          resultado: null,
          efectos: {
            ciclo: 1,
            enviosCiclo: 1,
            fechaCicloInicio: null,
            fechaUltimoEnvio: '2026-05-25',
            descansoHasta: null,
            rechazadoHasta: '2026-09-01',
            motivoRechazo: 'Ya tiene proveedor',
          },
        }),
      );

      expect(fila.etapa).toBe('RECHAZADO');
      expect(fila.rechazadoHasta).toBe('2026-09-01');
      expect(fila.motivoRechazo).toBe('Ya tiene proveedor');
      const transicion = await pool
        .request()
        .input('empresaId', mssql.Int, empresaId)
        .query(`SELECT evento, motivo FROM dbo.CRM_Transiciones WHERE empresaId = @empresaId`);
      expect(transicion.recordset[0]).toMatchObject({ evento: 'Rechazo', motivo: 'Ya tiene proveedor' });
      // A rejection is NOT a result event (design D4 catalog).
      expect(await contar('CRM_Resultados', empresaId)).toBe(0);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('T12 flips the flow and re-arms the denormalized cadence counters', async () => {
    try {
      const empresaId = await crearConEstado('OUTBOUND', 'DATOS', {
        ciclo: 2,
        enviosCiclo: 3,
        fechaCicloInicio: '2026-01-05',
        fechaUltimoEnvio: '2026-04-20',
      });

      const fila = await pipelines.registrarTransicion(
        bundleCon({
          empresaId,
          estadoPrevio: { flujo: 'OUTBOUND', etapa: 'DATOS' },
          estadoNuevo: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' },
          efectos: {
            ciclo: 1,
            enviosCiclo: 1,
            fechaCicloInicio: '2026-06-01',
            fechaUltimoEnvio: '2026-06-01',
            descansoHasta: null,
            rechazadoHasta: null,
            motivoRechazo: null,
          },
        }),
      );

      expect(fila.flujo).toBe('INBOUND');
      expect(fila.etapa).toBe('SEGUIMIENTO');
      expect(fila.ciclo).toBe(1);
      expect(fila.enviosCiclo).toBe(1);
      expect(fila.fechaCicloInicio).toBe('2026-06-01');
      expect(fila.fechaUltimoEnvio).toBe('2026-06-01');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('a mid-flight failure rolls the WHOLE bundle back (CK violation on the result insert)', async () => {
    try {
      const empresa = await empresas.crear(inputCon('Inbound'));

      // The dropped 'AvanceDeEtapa' violates CK_CRM_Resultados_Tipo —
      // a deterministic failure AFTER the pipeline UPDATE and the
      // audit INSERT inside the same transaction.
      await expect(
        pipelines.registrarTransicion(
          bundleCon({
            empresaId: empresa.id,
            resultado: 'AvanceDeEtapa' as never, // deliberate catalog violation (test-only cast)
          }),
        ),
      ).rejects.toThrow(/CK_CRM_Resultados_Tipo|CHECK/i);

      // Nothing landed: pipeline untouched, no orphan audit rows.
      const fila = await pipelines.obtenerPorEmpresaId(empresa.id);
      expect(fila?.etapa).toBe('REGISTRADO');
      expect(fila?.enviosCiclo).toBe(0);
      expect(await contar('CRM_Transiciones', empresa.id)).toBe(0);
      expect(await contar('CRM_Resultados', empresa.id)).toBe(0);
      expect(await contar('CRM_Handoffs', empresa.id)).toBe(0);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('rejects a bundle for an empresa without a pipeline row (NotFoundError, nothing written)', async () => {
    try {
      const empresa = await empresas.crear(inputCon(null));

      await expect(
        pipelines.registrarTransicion(bundleCon({ empresaId: empresa.id })),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(await contar('CRM_Transiciones', empresa.id)).toBe(0);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });
});

describe('SqlServerPipelineRepository — cambiarTipo (T16)', () => {
  it('updates the tipo and emits ConversiónProspectoACliente on Prospecto→Cliente', async () => {
    try {
      const empresa = await empresas.crear(inputCon(null, 'Prospecto'));

      await pipelines.cambiarTipo({
        empresaId: empresa.id,
        nuevoTipo: 'Cliente',
        usuario: 'mgarcia',
        hoy: '2026-06-01',
        convertir: true,
      });

      const tipo = await pool
        .request()
        .input('empresaId', mssql.Int, empresa.id)
        .query(`SELECT tipo FROM dbo.CRM_Empresas WHERE id = @empresaId`);
      expect(tipo.recordset[0]?.tipo).toBe('Cliente');

      const resultados = await pool
        .request()
        .input('empresaId', mssql.Int, empresa.id)
        .query(`SELECT tipo, usuario FROM dbo.CRM_Resultados WHERE empresaId = @empresaId`);
      expect(resultados.recordset).toHaveLength(1);
      expect(resultados.recordset[0]).toMatchObject({
        tipo: 'ConversiónProspectoACliente',
        usuario: 'mgarcia',
      });
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('updates the tipo WITHOUT a result event when convertir is false (Cliente→Prospecto)', async () => {
    try {
      const empresa = await empresas.crear(inputCon(null, 'Cliente'));

      await pipelines.cambiarTipo({
        empresaId: empresa.id,
        nuevoTipo: 'Prospecto',
        usuario: 'mgarcia',
        hoy: '2026-06-01',
        convertir: false,
      });

      const tipo = await pool
        .request()
        .input('empresaId', mssql.Int, empresa.id)
        .query(`SELECT tipo FROM dbo.CRM_Empresas WHERE id = @empresaId`);
      expect(tipo.recordset[0]?.tipo).toBe('Prospecto');
      expect(await contar('CRM_Resultados', empresa.id)).toBe(0);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('raises NotFoundError when the empresa does not exist', async () => {
    await expect(
      pipelines.cambiarTipo({
        empresaId: -3,
        nuevoTipo: 'Cliente',
        usuario: 'mgarcia',
        hoy: '2026-06-01',
        convertir: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('SqlServerPipelineRepository — standalone audit ports', () => {
  it('handoffs.registrar lands a CRM_Handoffs row and returns its id', async () => {
    try {
      const empresa = await empresas.crear(inputCon(null));

      const id = await pipelines.registrar({
        empresaId: empresa.id,
        area: 'Cobranzas',
        nota: null,
        usuario: 'jperez',
      });
      expect(id).toBeGreaterThan(0);

      const handoffs = await pool
        .request()
        .input('id', mssql.BigInt, id)
        .query(`SELECT area, usuario FROM dbo.CRM_Handoffs WHERE id = @id`)
        .then((r) => r.recordset);
      expect(handoffs[0]).toMatchObject({ area: 'Cobranzas', usuario: 'jperez' });
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });
});

describe('SqlServerPipelineRepository — the atomic registrarEnvioCadencia (tasks pr13/WU1)', () => {
  /** A full send bundle, pr10's bundleCon shape. */
  function envioCon(overrides: Partial<EnvioCadenciaAPersistir>): EnvioCadenciaAPersistir {
    return {
      empresaId: 1,
      usuario: 'jperez',
      hoy: '2026-06-01',
      estadoFinal: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' },
      actividad: { asunto: 'Envío de cadencia (ciclo 1, envío 2)', detalle: null, contactoId: null },
      efectos: {
        ciclo: 1,
        enviosCiclo: 2,
        fechaCicloInicio: '2026-05-18',
        fechaUltimoEnvio: '2026-06-01',
        descansoHasta: null,
        rechazadoHasta: null,
        motivoRechazo: null,
      },
      transicion: null,
      ...overrides,
    };
  }

  async function contactoPrincipalId(empresaId: number): Promise<number | null> {
    const result = await pool
      .request()
      .input('empresaId', mssql.Int, empresaId)
      .query(`SELECT TOP 1 id FROM dbo.CRM_Contactos WHERE empresaId = @empresaId`);
    return (result.recordset[0]?.id as number | undefined) ?? null;
  }

  it('weekly send: activity row + counter update in ONE tx, NO audit row (a send is not a machine move)', async () => {
    try {
      const empresaId = await crearConEstado('INBOUND', 'SEGUIMIENTO', {
        ciclo: 1,
        enviosCiclo: 1,
        fechaCicloInicio: '2026-05-18',
        fechaUltimoEnvio: '2026-05-25',
      });
      const contactoId = await contactoPrincipalId(empresaId);

      const fila = await pipelines.registrarEnvioCadencia(
        envioCon({ empresaId, actividad: { asunto: 'Seguimiento semana 2', detalle: 'Propuesta', contactoId } }),
      );

      expect(fila.enviosCiclo).toBe(2);
      expect(fila.fechaUltimoEnvio).toBe('2026-06-01');
      expect(fila.etapa).toBe('SEGUIMIENTO');
      expect(fila.updatedBy).toBe('jperez');

      const actividades = await pool
        .request()
        .input('empresaId', mssql.Int, empresaId).query(`
          SELECT tipo, asunto, detalle, usuario, fecha, contactoId
          FROM dbo.CRM_Actividades WHERE empresaId = @empresaId`);
      expect(actividades.recordset).toHaveLength(1);
      expect(actividades.recordset[0]).toMatchObject({
        tipo: 'ENVIO_CADENCIA',
        asunto: 'Seguimiento semana 2',
        detalle: 'Propuesta',
        usuario: 'jperez',
        contactoId,
      });
      expect((actividades.recordset[0]?.fecha as Date).toISOString().slice(0, 10)).toBe('2026-06-01');

      expect(await contar('CRM_Transiciones', empresaId)).toBe(0);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('T8 bundle: derived EnviosAgotados writes the audit row and lands DESCANSO + descansoHasta', async () => {
    try {
      const empresaId = await crearConEstado('OUTBOUND', 'CADENCIA', {
        ciclo: 2,
        enviosCiclo: 2,
        fechaCicloInicio: '2026-05-11',
        fechaUltimoEnvio: '2026-05-25',
      });

      const fila = await pipelines.registrarEnvioCadencia(
        envioCon({
          empresaId,
          estadoFinal: { flujo: 'OUTBOUND', etapa: 'DESCANSO' },
          efectos: {
            ciclo: 2,
            enviosCiclo: 3,
            fechaCicloInicio: '2026-05-11',
            fechaUltimoEnvio: '2026-06-01',
            descansoHasta: '2026-09-01',
            rechazadoHasta: null,
            motivoRechazo: null,
          },
          transicion: {
            evento: 'EnviosAgotados',
            estadoPrevio: { flujo: 'OUTBOUND', etapa: 'CADENCIA' },
            estadoNuevo: { flujo: 'OUTBOUND', etapa: 'DESCANSO' },
          },
        }),
      );

      expect(fila.flujo).toBe('OUTBOUND');
      expect(fila.etapa).toBe('DESCANSO');
      expect(fila.enviosCiclo).toBe(3);
      expect(fila.descansoHasta).toBe('2026-09-01');

      const transiciones = await pool
        .request()
        .input('empresaId', mssql.Int, empresaId)
        .query(`SELECT flujoPrevio, etapaPrevia, flujoNuevo, etapaNueva, evento, usuario FROM dbo.CRM_Transiciones WHERE empresaId = @empresaId`);
      expect(transiciones.recordset).toHaveLength(1);
      expect(transiciones.recordset[0]).toMatchObject({
        flujoPrevio: 'OUTBOUND',
        etapaPrevia: 'CADENCIA',
        flujoNuevo: 'OUTBOUND',
        etapaNueva: 'DESCANSO',
        evento: 'EnviosAgotados',
        usuario: 'jperez',
      });

      // T8 is NOT a bold design row — no result event.
      expect(await contar('CRM_Resultados', empresaId)).toBe(0);
      expect(await contar('CRM_Actividades', empresaId)).toBe(1);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('T9 bundle: derived ReinicioCadencia writes the audit row, ciclo+1 and clears the rest', async () => {
    try {
      const empresaId = await crearConEstado('OUTBOUND', 'DESCANSO', {
        ciclo: 2,
        enviosCiclo: 3,
        fechaCicloInicio: '2026-03-02',
        fechaUltimoEnvio: '2026-03-16',
      });
      await pool
        .request()
        .input('empresaId', mssql.Int, empresaId)
        .query(`UPDATE dbo.CRM_Pipeline SET descansoHasta = '2026-06-01' WHERE empresaId = @empresaId`);

      const fila = await pipelines.registrarEnvioCadencia(
        envioCon({
          empresaId,
          estadoFinal: { flujo: 'OUTBOUND', etapa: 'CADENCIA' },
          efectos: {
            ciclo: 3,
            enviosCiclo: 1,
            fechaCicloInicio: '2026-06-01',
            fechaUltimoEnvio: '2026-06-01',
            descansoHasta: null,
            rechazadoHasta: null,
            motivoRechazo: null,
          },
          transicion: {
            evento: 'ReinicioCadencia',
            estadoPrevio: { flujo: 'OUTBOUND', etapa: 'DESCANSO' },
            estadoNuevo: { flujo: 'OUTBOUND', etapa: 'CADENCIA' },
          },
        }),
      );

      expect(fila.flujo).toBe('OUTBOUND');
      expect(fila.etapa).toBe('CADENCIA');
      expect(fila.ciclo).toBe(3);
      expect(fila.enviosCiclo).toBe(1);
      expect(fila.descansoHasta).toBeNull();

      const evento = await pool
        .request()
        .input('empresaId', mssql.Int, empresaId)
        .query(`SELECT evento FROM dbo.CRM_Transiciones WHERE empresaId = @empresaId`);
      expect(evento.recordset[0]?.evento).toBe('ReinicioCadencia');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('a mid-flight failure rolls the WHOLE send back (CK violation on the pipeline update AFTER the activity insert)', async () => {
    try {
      const empresaId = await crearConEstado('INBOUND', 'SEGUIMIENTO', {
        enviosCiclo: 1,
        fechaUltimoEnvio: '2026-05-25',
      });

      await expect(
        pipelines.registrarEnvioCadencia(
          envioCon({
            empresaId,
            estadoFinal: { flujo: 'INBOUND', etapa: 'LEAD' as never }, // deliberate CK violation
            transicion: {
              evento: 'EnviosAgotados',
              estadoPrevio: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' },
              estadoNuevo: { flujo: 'INBOUND', etapa: 'LEAD' as never }, // deliberate CK violation
            },
          }),
        ),
      ).rejects.toThrow(/CK_CRM_Pipeline_Etapa|CHECK/i);

      // Nothing landed: the activity insert rolled back with the tx.
      expect(await contar('CRM_Actividades', empresaId)).toBe(0);
      expect(await contar('CRM_Transiciones', empresaId)).toBe(0);
      const fila = await pipelines.obtenerPorEmpresaId(empresaId);
      expect(fila?.enviosCiclo).toBe(1);
      expect(fila?.fechaUltimoEnvio).toBe('2026-05-25');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('raises NotFoundError when the empresa has no pipeline row (nothing written)', async () => {
    try {
      const empresa = await empresas.crear(inputCon(null));

      await expect(
        pipelines.registrarEnvioCadencia(envioCon({ empresaId: empresa.id })),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(await contar('CRM_Actividades', empresa.id)).toBe(0);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });
});

describe('SqlServerPipelineRepository — listarCandidatosCola (tasks pr13/WU2 queue read)', () => {
  it('returns every pipeline row joined with razonSocial/responsable, skipping pipeline-less empresas', async () => {
    try {
      const inbound = await crearConEstado('INBOUND', 'SEGUIMIENTO', {
        enviosCiclo: 1,
        fechaUltimoEnvio: '2026-05-25',
      });
      // RUC distinto: inputCon fija PROBE_RUCS[0].
      const sinOrigen = await empresas.crear({
        ...inputCon(null),
        ruc: PROBE_RUCS[1] as string,
      });

      // Marcar el responsable para probar el JOIN.
      await pool
        .request()
        .input('empresaId', mssql.Int, inbound)
        .input('responsable', mssql.NVarChar(200), 'jperez')
        .query(`UPDATE dbo.CRM_Empresas SET responsable = @responsable WHERE id = @empresaId`);

      const candidatos = await pipelines.listarCandidatosCola();
      const deProbe = candidatos.filter((c) => [inbound, sinOrigen.id].includes(c.empresaId));

      // Solo filas DE pipeline (las sin origen no tienen fila 1:1).
      expect(deProbe).toHaveLength(1);
      expect(deProbe[0]).toMatchObject({
        empresaId: inbound,
        razonSocial: 'Probe Pipeline SA',
        responsable: 'jperez',
        flujo: 'INBOUND',
        etapa: 'SEGUIMIENTO',
        enviosCiclo: 1,
      });
      expect(typeof deProbe[0]?.razonSocial).toBe('string');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('returns no probe rows once the suite cleaned up (real empty read for the probe marker)', async () => {
    // Runs AFTER the previous test's cleanup: the probe razonSocial
    // must be gone — proving the read sees live data, not a cache.
    const candidatos = await pipelines.listarCandidatosCola();
    expect(candidatos.every((c) => typeof c.razonSocial === 'string' && c.razonSocial.length > 0)).toBe(true);
    expect(candidatos.filter((c) => c.razonSocial === 'Probe Pipeline SA')).toHaveLength(0);
  });
});

describe('SqlServerPipelineRepository — historial reads (tasks pr11 detail timeline)', () => {
  it('listarTransiciones returns the audit rows newest-first with mapped fields and numeric ids', async () => {
    try {
      const empresaId = await crearConEstado('INBOUND', 'REGISTRADO');

      // Two audited transitions: T2 (REGISTRADO → SEGUIMIENTO) then
      // T3 (SEGUIMIENTO → PRESENTACION). The adapter test pins the
      // READ contract, not the effects (pr10 owns those).
      await pipelines.registrarTransicion(bundleCon({ empresaId }));
      await pipelines.registrarTransicion(
        bundleCon({
          empresaId,
          evento: 'PresentaciónEnviada',
          estadoPrevio: { flujo: 'INBOUND', etapa: 'SEGUIMIENTO' },
          estadoNuevo: { flujo: 'INBOUND', etapa: 'PRESENTACION' },
          resultado: 'PresentaciónEnviada',
          efectos: {
            ciclo: 1,
            enviosCiclo: 0,
            fechaCicloInicio: null,
            fechaUltimoEnvio: null,
            descansoHasta: null,
            rechazadoHasta: null,
            motivoRechazo: null,
          },
        }),
      );

      const filas = await pipelines.listarTransiciones(empresaId);

      expect(filas).toHaveLength(2);
      // Newest first — the timeline renders top-down.
      expect(filas[0]?.evento).toBe('PresentaciónEnviada');
      expect(filas[1]?.evento).toBe('CotizaciónEnviada');
      expect(filas[0]!.id).toBeGreaterThan(filas[1]!.id);
      // BIGINT ids cross tedious as strings — the port contract is number.
      expect(typeof filas[0]?.id).toBe('number');
      expect(filas[0]).toMatchObject({
        empresaId,
        flujoPrevio: 'INBOUND',
        etapaPrevia: 'SEGUIMIENTO',
        flujoNuevo: 'INBOUND',
        etapaNueva: 'PRESENTACION',
        motivo: null,
        usuario: 'jperez',
      });
      expect(filas[1]).toMatchObject({
        flujoPrevio: 'INBOUND',
        etapaPrevia: 'REGISTRADO',
        flujoNuevo: 'INBOUND',
        etapaNueva: 'SEGUIMIENTO',
        usuario: 'jperez',
      });
      expect(typeof filas[0]?.createdAt).toBe('string');
      expect(new Date(filas[0]?.createdAt ?? '').toString()).not.toBe('Invalid Date');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('listarHandoffs returns the T5 record (área, nota, usuario, createdAt)', async () => {
    try {
      const empresaId = await crearConEstado('INBOUND', 'CONFIRMADA');

      await pipelines.registrarTransicion(
        bundleCon({
          empresaId,
          evento: 'HandoffRegistrado',
          estadoPrevio: { flujo: 'INBOUND', etapa: 'CONFIRMADA' },
          estadoNuevo: { flujo: 'INBOUND', etapa: 'ENTREGADA' },
          resultado: 'HandoffRegistrado',
          efectos: {
            ciclo: 1,
            enviosCiclo: 0,
            fechaCicloInicio: null,
            fechaUltimoEnvio: null,
            descansoHasta: null,
            rechazadoHasta: null,
            motivoRechazo: null,
          },
          handoff: { area: 'Operaciones', nota: 'Coordinar entrega' },
        }),
      );

      const handoffs = await pipelines.listarHandoffs(empresaId);
      expect(handoffs).toHaveLength(1);
      expect(typeof handoffs[0]?.id).toBe('number');
      expect(handoffs[0]).toMatchObject({
        empresaId,
        area: 'Operaciones',
        nota: 'Coordinar entrega',
        usuario: 'jperez',
      });
      expect(typeof handoffs[0]?.createdAt).toBe('string');
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });

  it('a freshly created empresa has an EMPTY historial (T1/T6 seeding writes no audit rows)', async () => {
    try {
      const empresa = await empresas.crear(inputCon('Inbound'));

      expect(await pipelines.listarTransiciones(empresa.id)).toEqual([]);
      expect(await pipelines.listarHandoffs(empresa.id)).toEqual([]);
    } finally {
      await pool.request().query(`DELETE FROM dbo.CRM_Empresas WHERE ${PROBE_KEY}`);
    }
  });
});
