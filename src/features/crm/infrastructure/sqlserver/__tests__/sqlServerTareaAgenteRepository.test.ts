import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';

import { SqlServerTareaAgenteRepository } from '../sqlServerTareaAgenteRepository';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `SqlServerTareaAgenteRepository`
 * (agente-ia-crm E2·T5) against the real dev HOLOMEDIC SQL Server —
 * the user authorized inserting and removing test data here. Every
 * probe lives under a per-run marker conversación (unique
 * identificadorCanal); the afterAll deletes those conversations and
 * the CRM_Mensajes/CRM_AgenteTareas cascades wipe the rest. NO
 * assertion assumes anything about rows owned by other runs/users.
 *
 * Pinned here:
 * - crearSiNoExiste idempotency: the same (conversacionId, mensajeId,
 *   tipo) triple returns the SAME id with creada:false; a different
 *   mensajeId is a new task.
 * - reclamarPendientes claims exactly `limite` fresh rows (id ASC),
 *   flips them to PROCESANDO and stamps reclamadaEn; a requeued row
 *   inside the 60 s cooling is NOT claimed, a backdated one IS.
 * - reclamarAbandonadas re-claims PROCESANDO rows claimed more than
 *   `minutos` ago (crash recovery) and refreshes the claim stamp.
 * - completar / reencolar / fallar transitions: fallar counts
 *   attempts, keeps PENDIENTE under 3 and flips FALLIDA (with
 *   procesadaEn + truncated error) at the 3rd.
 */

const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const MARCA_IDENTIFICADOR = `E2T5-PROBE-${SUFIJO}`;

let pool: mssql.ConnectionPool;
let repo: SqlServerTareaAgenteRepository;

const idsConversacion = new Set<number>();

/** One probe conversation keyed by the run's unique canal marker. */
async function crearConversacionProbe(): Promise<number> {
  const inserted = await pool
    .request()
    .input('identificadorCanal', mssql.VarChar(64), `${MARCA_IDENTIFICADOR}-${idsConversacion.size + 1}`)
    .query(`
      INSERT INTO dbo.CRM_Conversaciones (canal, telefono, identificadorCanal, estado, modo)
      OUTPUT INSERTED.id
      VALUES ('WHATSAPP', NULL, @identificadorCanal, 'ACTIVA_IA', 'IA')
    `);
  const id = (inserted.recordset as { id: number }[])[0]?.id;
  if (id === undefined) throw new Error('INSERT probe de CRM_Conversaciones no devolvió id');
  idsConversacion.add(id);
  return id;
}

/** One probe IN/CLIENTE message row in the given conversation. */
async function crearMensajeProbe(conversacionId: number): Promise<number> {
  const inserted = await pool
    .request()
    .input('conversacionId', mssql.Int, conversacionId)
    .query(`
      INSERT INTO dbo.CRM_Mensajes (conversacionId, direccion, emisor, cuerpo, tipo, canal)
      OUTPUT INSERTED.id
      VALUES (@conversacionId, 'IN', 'CLIENTE', 'probe', 'TEXTO', 'WHATSAPP')
    `);
  const id = Number((inserted.recordset as { id: number | string }[])[0]?.id);
  if (!Number.isFinite(id)) throw new Error('INSERT probe de CRM_Mensajes no devolvió id');
  return id;
}

interface FilaTarea {
  id: number;
  estado: string;
  intentos: number;
  error: string | null;
  reclamadaEn: Date | null;
  procesadaEn: Date | null;
}

/** Direct read of one task row (the adapter deliberately has no read-by-id). */
async function leerTarea(id: number): Promise<FilaTarea> {
  const result = await pool
    .request()
    .input('id', mssql.BigInt, id)
    .query(
      'SELECT id, estado, intentos, error, reclamadaEn, procesadaEn FROM dbo.CRM_AgenteTareas WHERE id = @id',
    );
  const fila = (result.recordset as FilaTarea[])[0];
  if (fila === undefined) throw new Error(`tarea probe ${id} desapareció`);
  return fila;
}

/** Backdate the claim stamp (cooling / crash-recovery simulation). */
async function retrospectarReclamada(id: number, segundos: number): Promise<void> {
  await pool
    .request()
    .input('id', mssql.BigInt, id)
    .input('segundos', mssql.Int, segundos)
    .query(
      'UPDATE dbo.CRM_AgenteTareas SET reclamadaEn = DATEADD(SECOND, -@segundos, SYSUTCDATETIME()) WHERE id = @id',
    );
}

/**
 * Deterministic claim scope: the claim is GLOBAL (prod semantics), so
 * tests that assert on claim contents first drain the PENDIENTE
 * backlog — the probe rows earlier tests in THIS run left behind
 * (they cascade away in afterAll; vitest runs files serially, so no
 * concurrent run can interleave).
 */
async function drenarPendientes(): Promise<void> {
  await repo.reclamarPendientes(1000);
}

// ---- E4·T7 (agente-ia-crm): tareas INGESTAR_CONOCIMIENTO (conversacionId NULL) ----

/** Base de los mensajeId de ingesta probe (grandes, nunca colisionan). */
const MARCA_INGESTA_ID = 4_200_000_000;
const idsTareasIngesta = new Set<number>();
let secuenciaIngesta = 0;

function ingestaIdProbe(): number {
  secuenciaIngesta += 1;
  return MARCA_INGESTA_ID + secuenciaIngesta;
}

describe('SqlServerTareaAgenteRepository — tareas INGESTAR_CONOCIMIENTO (E4·T7)', () => {
  it('crearSiNoExiste con conversacionId NULL: dedup por (NULL, ingestaId, tipo) — misma clave → mismo id, creada:false', async () => {
    try {
      const ingestaId = ingestaIdProbe();
      const primera = await repo.crearSiNoExiste({
        conversacionId: null,
        mensajeId: ingestaId,
        tipo: 'INGESTAR_CONOCIMIENTO',
      });
      idsTareasIngesta.add(primera.id);
      expect(primera.creada).toBe(true);

      // Replay de la MISMA ingesta: la UNIQUE trata los NULL como
      // iguales → violación atrapada → el fallback SELECT debe
      // encontrar la fila con IS NULL y devolver la misma id.
      const segunda = await repo.crearSiNoExiste({
        conversacionId: null,
        mensajeId: ingestaId,
        tipo: 'INGESTAR_CONOCIMIENTO',
      });
      expect(segunda).toEqual({ id: primera.id, creada: false });

      // Otra ingesta (otro mensajeId) es OTRA tarea.
      const otraIngesta = ingestaIdProbe();
      const tercera = await repo.crearSiNoExiste({
        conversacionId: null,
        mensajeId: otraIngesta,
        tipo: 'INGESTAR_CONOCIMIENTO',
      });
      idsTareasIngesta.add(tercera.id);
      expect(tercera.creada).toBe(true);
      expect(tercera.id).not.toBe(primera.id);
    } finally {
      for (const id of idsTareasIngesta) {
        await pool.request().input('id', mssql.BigInt, id)
          .query('DELETE FROM dbo.CRM_AgenteTareas WHERE id = @id');
      }
      idsTareasIngesta.clear();
    }
  });

  it('el claim devuelve la tarea de ingesta con conversacionId NULL intacto (mapeo honesto)', async () => {
    try {
      await drenarPendientes();
      const ingestaId = ingestaIdProbe();
      const { id } = await repo.crearSiNoExiste({
        conversacionId: null,
        mensajeId: ingestaId,
        tipo: 'INGESTAR_CONOCIMIENTO',
      });
      idsTareasIngesta.add(id);

      const reclamadas = await repo.reclamarPendientes(1000);
      const deIngesta = reclamadas.find((t) => t.id === id);
      expect(deIngesta, 'la tarea de ingesta fue reclamada').toBeDefined();
      expect(deIngesta?.tipo).toBe('INGESTAR_CONOCIMIENTO');
      expect(deIngesta?.conversacionId, 'NULL cruza tal cual (sin placeholder 0)').toBeNull();
      expect(deIngesta?.mensajeId).toBe(ingestaId);
    } finally {
      for (const id of idsTareasIngesta) {
        await pool.request().input('id', mssql.BigInt, id)
          .query('DELETE FROM dbo.CRM_AgenteTareas WHERE id = @id');
      }
      idsTareasIngesta.clear();
    }
  });
});

beforeAll(async () => {
  const db = await getCrmDb();
  pool = db.pool;
  repo = db.tareas instanceof SqlServerTareaAgenteRepository
    ? db.tareas
    : new SqlServerTareaAgenteRepository(pool);
});

afterAll(async () => {
  if (pool) {
    // E4·T7: las tareas de ingesta NO cascadean (conversacionId NULL) —
    // se rastrean y borran explícitamente, con backstop por mensajeId.
    for (const id of idsTareasIngesta) {
      await pool.request().input('id', mssql.BigInt, id)
        .query('DELETE FROM dbo.CRM_AgenteTareas WHERE id = @id');
    }
    await pool
      .request()
      .input('desde', mssql.BigInt, MARCA_INGESTA_ID)
      .query(
        'DELETE FROM dbo.CRM_AgenteTareas WHERE conversacionId IS NULL AND mensajeId >= @desde AND tipo = \'INGESTAR_CONOCIMIENTO\'',
      );
    // The conversations own the graph: CRM_Mensajes and
    // CRM_AgenteTareas cascade away with them.
    for (const id of idsConversacion) {
      await pool.request().input('id', mssql.Int, id)
        .query('DELETE FROM dbo.CRM_Conversaciones WHERE id = @id');
    }
    const backstop = await pool
      .request()
      .input('patron', mssql.VarChar(64), `${MARCA_IDENTIFICADOR}-%`)
      .query(
        'DELETE FROM dbo.CRM_Conversaciones WHERE identificadorCanal LIKE @patron',
      );
    void backstop;
    await pool.close();
  }
});

describe('SqlServerTareaAgenteRepository (integración, filas probe propias)', () => {
  it('crearSiNoExiste: idempotente por triple — misma clave → mismo id, creada:false', async () => {
    const conversacionId = await crearConversacionProbe();
    const mensajeId = await crearMensajeProbe(conversacionId);

    const primera = await repo.crearSiNoExiste({
      conversacionId,
      mensajeId,
      tipo: 'GENERAR_RESPUESTA',
    });
    const segunda = await repo.crearSiNoExiste({
      conversacionId,
      mensajeId,
      tipo: 'GENERAR_RESPUESTA',
    });

    expect(primera.creada).toBe(true);
    expect(segunda).toEqual({ id: primera.id, creada: false });

    // Un mensaje distinto en la misma conversación es OTRA tarea.
    const otroMensaje = await crearMensajeProbe(conversacionId);
    const tercera = await repo.crearSiNoExiste({
      conversacionId,
      mensajeId: otroMensaje,
      tipo: 'GENERAR_RESPUESTA',
    });
    expect(tercera.creada).toBe(true);
    expect(tercera.id).not.toBe(primera.id);
  });

  it('reclamarPendientes: reclama exactamente limite filas nuevas → PROCESANDO con reclamadaEn', async () => {
    await drenarPendientes();
    const conversacionId = await crearConversacionProbe();
    const ids: number[] = [];
    for (let indice = 0; indice < 3; indice += 1) {
      const mensajeId = await crearMensajeProbe(conversacionId);
      const tarea = await repo.crearSiNoExiste({ conversacionId, mensajeId, tipo: 'GENERAR_RESPUESTA' });
      ids.push(tarea.id);
    }

    const reclamadas = await repo.reclamarPendientes(2);

    expect(reclamadas).toHaveLength(2);
    // id ASC: the two oldest of the three.
    expect(reclamadas.map((t) => t.id)).toEqual(ids.slice(0, 2));
    for (const tarea of reclamadas) {
      expect(tarea.estado).toBe('PROCESANDO');
      expect(tarea.reclamadaEn).not.toBeNull();
    }
    // The third row stays PENDIENTE, untouched.
    const tercera = await leerTarea(ids[2] ?? -1);
    expect(tercera.estado).toBe('PENDIENTE');
    expect(tercera.reclamadaEn).toBeNull();
  });

  it('cooling: una fila reencolada con reclamadaEn reciente NO se reclama; backdateada sí', async () => {
    await drenarPendientes();
    const conversacionId = await crearConversacionProbe();
    const mensajeId = await crearMensajeProbe(conversacionId);
    const { id } = await repo.crearSiNoExiste({ conversacionId, mensajeId, tipo: 'GENERAR_RESPUESTA' });

    // Claim + requeue (FUERA_DE_HORARIO shape): PENDIENTE but with a
    // fresh reclamadaEn → inside the 60 s cooling.
    const reclamada = (await repo.reclamarPendientes(10)).find((t) => t.id === id);
    expect(reclamada).toBeDefined();
    await repo.reencolar(id);
    const enfriada = await leerTarea(id);
    expect(enfriada.estado).toBe('PENDIENTE');
    expect(enfriada.reclamadaEn).not.toBeNull();

    const sinClaim = await repo.reclamarPendientes(10);
    expect(sinClaim.find((t) => t.id === id)).toBeUndefined();

    // Simulate the 60 s window passing: backdate the claim stamp.
    await retrospectarReclamada(id, 120);
    const conClaim = await repo.reclamarPendientes(10);
    expect(conClaim.find((t) => t.id === id)?.estado).toBe('PROCESANDO');
  });

  it('reclamarAbandonadas: recupera PROCESANDO con claim viejo y refresca el sello', async () => {
    await drenarPendientes();
    const conversacionId = await crearConversacionProbe();
    const mensajeId = await crearMensajeProbe(conversacionId);
    const { id } = await repo.crearSiNoExiste({ conversacionId, mensajeId, tipo: 'GENERAR_RESPUESTA' });

    const reclamada = (await repo.reclamarPendientes(10)).find((t) => t.id === id);
    expect(reclamada).toBeDefined();
    const selloOriginal = (await leerTarea(id)).reclamadaEn;

    // Claim fresco → NOT abandoned at 5 minutes.
    const temprano = await repo.reclamarAbandonadas(10, 5);
    expect(temprano.find((t) => t.id === id)).toBeUndefined();

    // Backdate 10 minutes → crash-recovery reclaims with a NEW stamp.
    await retrospectarReclamada(id, 600);
    const recuperadas = await repo.reclamarAbandonadas(10, 5);
    const recuperada = recuperadas.find((t) => t.id === id);
    expect(recuperada?.estado).toBe('PROCESANDO');
    const selloNuevo = (await leerTarea(id)).reclamadaEn;
    expect(selloOriginal).toBeInstanceOf(Date);
    expect(selloNuevo).toBeInstanceOf(Date);
    if (selloOriginal === null || selloNuevo === null) {
      throw new Error('sellos de reclamo inesperadamente null tras el assert');
    }
    expect(selloNuevo.getTime()).toBeGreaterThanOrEqual(selloOriginal.getTime());
  });

  it('completar: COMPLETADA + procesadaEn + error limpio', async () => {
    const conversacionId = await crearConversacionProbe();
    const mensajeId = await crearMensajeProbe(conversacionId);
    const { id } = await repo.crearSiNoExiste({ conversacionId, mensajeId, tipo: 'GENERAR_RESPUESTA' });
    await repo.reclamarPendientes(10);
    // An error from a previous failed attempt must clear on completion.
    await repo.fallar(id, 'intento previo');
    await repo.reclamarPendientes(10);

    await repo.completar(id);

    const fila = await leerTarea(id);
    expect(fila.estado).toBe('COMPLETADA');
    expect(fila.procesadaEn).not.toBeNull();
    expect(fila.error).toBeNull();
  });

  it('reencolar: PENDIENTE conservando reclamadaEn SIN tocar intentos', async () => {
    const conversacionId = await crearConversacionProbe();
    const mensajeId = await crearMensajeProbe(conversacionId);
    const { id } = await repo.crearSiNoExiste({ conversacionId, mensajeId, tipo: 'GENERAR_RESPUESTA' });
    await repo.reclamarPendientes(10);
    await repo.fallar(id, 'un fallo real cuenta intento');

    await repo.reencolar(id);

    const fila = await leerTarea(id);
    expect(fila.estado).toBe('PENDIENTE');
    expect(fila.intentos).toBe(1);
    expect(fila.reclamadaEn).not.toBeNull();
  });

  it('fallar: cuenta intentos, PENDIENTE bajo 3, FALLIDA (con procesadaEn y error truncado) al tercero', async () => {
    const conversacionId = await crearConversacionProbe();
    const mensajeId = await crearMensajeProbe(conversacionId);
    const { id } = await repo.crearSiNoExiste({ conversacionId, mensajeId, tipo: 'GENERAR_RESPUESTA' });
    await repo.reclamarPendientes(10);

    await repo.fallar(id, 'FALLIDO_ENVIO');
    let fila = await leerTarea(id);
    expect(fila.estado).toBe('PENDIENTE');
    expect(fila.intentos).toBe(1);
    expect(fila.error).toBe('FALLIDO_ENVIO');
    expect(fila.procesadaEn).toBeNull();

    await repo.fallar(id, 'x'.repeat(600));
    fila = await leerTarea(id);
    expect(fila.estado).toBe('PENDIENTE');
    expect(fila.intentos).toBe(2);
    expect(fila.error?.length).toBe(500);

    await repo.fallar(id, 'tercer intento');
    fila = await leerTarea(id);
    expect(fila.estado).toBe('FALLIDA');
    expect(fila.intentos).toBe(3);
    expect(fila.procesadaEn).not.toBeNull();
  });
});
