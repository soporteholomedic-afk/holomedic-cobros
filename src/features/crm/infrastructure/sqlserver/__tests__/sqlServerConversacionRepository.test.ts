import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';

import { normalizarNombre } from '../../../domain/normalizar';
import { ConflictError, NotFoundError } from '../../../domain/errors';
import { SqlServerConversacionRepository } from '../sqlServerConversacionRepository';
import { loadEnvLocal } from './loadEnvLocal';

loadEnvLocal();

/**
 * DB integration contract for `SqlServerConversacionRepository`
 * (agente-ia-crm E1) against the real SHARED HOLOMEDIC SQL Server.
 * Unlike the empresa suite (fixed probe keys), this file is RESILIENT:
 * every probe row carries a per-run random suffix, ids are tracked and
 * deleted in `finally` (CRM_Mensajes falls with the conversación via
 * FK CASCADE; contactos fall with the empresa), and NO assertion
 * assumes anything about rows owned by other runs/users.
 *
 * Pinned here (advisory remediation E1):
 * - LIKE escape: a busqueda of `%`/`_` matches LITERAL wildcard
 *   characters only — never "everything" (R3 wildcards-sin-escape).
 * - listar: ONE query with COUNT(*) OVER() — total coherente with the
 *   page under the same filter, 0 rows → total 0 (R4 count-not-atomic).
 * - buscarCandidatosVinculacion: free-text phone match across empresas.
 * - buscarCandidatosVinculacion E2·T8: exact seek on the new
 *   telefonoNormalizado column (+ fallback over the un-normalized
 *   subset only; the normalized column is authoritative — a drifted
 *   normalizado never re-matches through the free-text fallback).
 * - The lifecycle writes (vincular, registrarActividad IN/OUT,
 *   marcarLeidos, crearContacto, buscarContactosTexto).
 */

const SUFIJO = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const DIGITOS = Math.floor(Math.random() * 1_000_000)
  .toString()
  .padStart(6, '0');

let pool: mssql.ConnectionPool;
let repo: SqlServerConversacionRepository;
let secuencia = 0;

const conversacionesCreadas = new Set<number>();
const empresasCreadas = new Set<number>();
// E3: extracciones de ficha (NO ACTION sobre contactos — no caen con
// la conversación ni siempre con la empresa; se borran por id propio).
const extraccionesCreadas = new Set<number>();

/** Deletes ONLY what this run created — ids first, no LIKE over foreign data. */
async function limpiarProbe(): Promise<void> {
  // Extracciones PRIMERO: su FK a contactos es NO ACTION y bloquearía
  // el DELETE de la empresa probe. El OBJECT_ID guarda la fase RED del
  // ciclo TDD (la tabla aún no existe en la base cuando el test falla
  // antes de implementarla).
  if (extraccionesCreadas.size > 0) {
    for (const id of extraccionesCreadas) {
      await pool.request().input('id', mssql.BigInt, id).query(`
        IF OBJECT_ID('dbo.CRM_ExtraccionesFicha') IS NOT NULL
          DELETE FROM dbo.CRM_ExtraccionesFicha WHERE id = @id
      `);
    }
    extraccionesCreadas.clear();
  }
  // Conversaciones PRIMERO: su contactoId es FK NO ACTION y bloquearía
  // el DELETE de la empresa probe si quedara una fila apuntando. Los
  // mensajes caen solos por FK CASCADE.
  for (const id of conversacionesCreadas) {
    await pool.request().input('id', mssql.Int, id)
      .query('DELETE FROM dbo.CRM_Conversaciones WHERE id = @id');
  }
  conversacionesCreadas.clear();
  // Empresas al final: contactos caen por FK CASCADE.
  for (const id of empresasCreadas) {
    await pool.request().input('id', mssql.Int, id)
      .query('DELETE FROM dbo.CRM_Empresas WHERE id = @id');
  }
  empresasCreadas.clear();
}

/** Unique E.164-ish probe phone per call (random run digits + counter). */
function telefonoProbe(): string {
  secuencia += 1;
  return `+595981${DIGITOS}${String(secuencia).padStart(4, '0')}`;
}

function identificadorCanalProbe(): string {
  secuencia += 1;
  return `probe-${SUFIJO}-${secuencia}`;
}

async function crearEmpresaProbe(razonSocial: string): Promise<number> {
  secuencia += 1;
  const rucNormalizado = `PROBECONV${SUFIJO}${secuencia}`;
  const inserted = await pool
    .request()
    .input('rucNormalizado', mssql.VarChar(30), rucNormalizado)
    .input('razonSocial', mssql.NVarChar(200), razonSocial).query(`
      INSERT INTO dbo.CRM_Empresas (ruc, rucNormalizado, razonSocial, tipo)
      OUTPUT INSERTED.id
      VALUES (@rucNormalizado, @rucNormalizado, @razonSocial, 'Prospecto')
    `);
  const id = (inserted.recordset as { id: number }[])[0]?.id;
  if (id === undefined) throw new Error('INSERT probe de CRM_Empresas no devolvió id');
  empresasCreadas.add(id);
  return id;
}

async function crearContactoProbe(
  empresaId: number,
  nombre: string,
  telefono: string | null,
  telefonoNormalizado: string | null = null,
): Promise<number> {
  const inserted = await pool
    .request()
    .input('empresaId', mssql.Int, empresaId)
    .input('nombre', mssql.NVarChar(200), nombre)
    .input('nombreNormalizado', mssql.VarChar(200), normalizarNombre(nombre))
    .input('telefono', mssql.VarChar(30), telefono)
    .input('telefonoNormalizado', mssql.VarChar(30), telefonoNormalizado).query(`
      INSERT INTO dbo.CRM_Contactos (empresaId, nombre, nombreNormalizado, telefono, telefonoNormalizado, esPrincipal)
      OUTPUT INSERTED.id
      VALUES (@empresaId, @nombre, @nombreNormalizado, @telefono, @telefonoNormalizado, 0)
    `);
  const id = (inserted.recordset as { id: number }[])[0]?.id;
  if (id === undefined) throw new Error('INSERT probe de CRM_Contactos no devolvió id');
  return id;
}

/** One linked fixture row: empresa + contacto + conversación vinculada. */
async function crearFixtureVinculada(estado: 'ACTIVA_IA' | 'PAUSADA' | 'TOMADA_HUMANO' | 'REQUIERE_HUMANO'): Promise<{
  empresaId: number;
  contactoId: number;
  conversacionId: number;
}> {
  const marca = `${estado}-${SUFIJO}`;
  const empresaId = await crearEmpresaProbe(`Probe ${marca} SA`);
  const contactoId = await crearContactoProbe(empresaId, `Contacto ${marca}`, null);
  const conversacion = await repo.crear({
    canal: 'WHATSAPP',
    telefono: telefonoProbe(),
    identificadorCanal: identificadorCanalProbe(),
    empresaId,
    contactoId,
    estado,
  });
  conversacionesCreadas.add(conversacion.id);
  return { empresaId, contactoId, conversacionId: conversacion.id };
}

/** An id guaranteed absent RIGHT NOW (max + delta — no assumptions). */
async function idInexistente(tabla: 'CRM_Conversaciones' | 'CRM_Contactos'): Promise<number> {
  const result = await pool.request().query(`SELECT MAX(id) AS maximo FROM dbo.${tabla}`);
  const maximo = (result.recordset as { maximo: number | null }[])[0]?.maximo ?? 0;
  return maximo + 1000;
}

beforeAll(async () => {
  const db = await getCrmDb();
  pool = db.pool;
  repo = new SqlServerConversacionRepository(pool);
});

afterAll(async () => {
  if (pool) {
    // Idempotente por si un finally de test no alcanzó a correr.
    await limpiarProbe();
    await pool.close();
  }
});

describe('SqlServerConversacionRepository (integración, filas probe propias)', () => {
  it('crear + obtenerPorId round-trip; id inexistente → null', async () => {
    try {
      const telefono = telefonoProbe();
      const identificadorCanal = identificadorCanalProbe();
      const creada = await repo.crear({
        canal: 'WHATSAPP',
        telefono,
        identificadorCanal,
      });
      conversacionesCreadas.add(creada.id);

      expect(creada).toMatchObject({
        id: expect.any(Number),
        empresaId: null,
        contactoId: null,
        canal: 'WHATSAPP',
        telefono,
        identificadorCanal,
        estado: 'PENDIENTE_VINCULACION',
        asignadaA: null,
        modo: 'IA',
        noLeidos: 0,
      });
      expect(creada.creadoEn).toBeTruthy();
      expect(creada.actualizadoEn).toBeTruthy();

      const releida = await repo.obtenerPorId(creada.id);
      expect(releida?.id).toBe(creada.id);
      expect(releida?.telefono).toBe(telefono);

      expect(await repo.obtenerPorId(await idInexistente('CRM_Conversaciones'))).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('buscarPorCanal por telefono y por identificadorCanal; clave ajena → null', async () => {
    try {
      const telefonoA = telefonoProbe();
      const canalA = identificadorCanalProbe();
      const convA = await repo.crear({
        canal: 'WHATSAPP',
        telefono: telefonoA,
        identificadorCanal: canalA,
      });
      conversacionesCreadas.add(convA.id);
      // Solo identificadorCanal (telefono null): la forma BSUID.
      const canalB = identificadorCanalProbe();
      const convB = await repo.crear({ canal: 'WHATSAPP', identificadorCanal: canalB });
      conversacionesCreadas.add(convB.id);

      const porTelefono = await repo.buscarPorCanal('WHATSAPP', { telefono: telefonoA });
      expect(porTelefono?.id).toBe(convA.id);

      const porCanalA = await repo.buscarPorCanal('WHATSAPP', { identificadorCanal: canalA });
      expect(porCanalA?.id).toBe(convA.id);

      const porCanalB = await repo.buscarPorCanal('WHATSAPP', { identificadorCanal: canalB });
      expect(porCanalB?.id).toBe(convB.id);
      // B no tiene teléfono: buscar por el teléfono de A jamás la encuentra.
      expect(await repo.buscarPorCanal('WHATSAPP', { telefono: telefonoProbe() })).toBeNull();
      expect(
        await repo.buscarPorCanal('WHATSAPP', { identificadorCanal: identificadorCanalProbe() }),
      ).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('listar: busqueda con escape de %, COUNT(*) OVER coherente y columnas ampliadas del JOIN', async () => {
    try {
      const alfa = await crearFixtureVinculada('ACTIVA_IA');
      const beta = await crearFixtureVinculada('PAUSADA');
      // Tercera con '%' LITERAL en la razón social (regresión del escape).
      const gamma = await crearFixtureVinculada('TOMADA_HUMANO');
      await pool
        .request()
        .input('empresaId', mssql.Int, gamma.empresaId)
        .input('razonSocial', mssql.NVarChar(200), `Probe 50% ${SUFIJO} SA`)
        .query('UPDATE dbo.CRM_Empresas SET razonSocial = @razonSocial WHERE id = @empresaId');
      const ids = [alfa.conversacionId, beta.conversacionId, gamma.conversacionId];

      // El sufijo aleatorio es propio de esta corrida: el filtro ONLY
      // alcanza a las tres filas probe (COUNT(*) OVER coherente).
      const pagina1 = await repo.listar({ busqueda: SUFIJO, limite: 2, offset: 0 });
      expect(pagina1.total).toBe(3);
      expect(pagina1.items).toHaveLength(2);
      const pagina2 = await repo.listar({ busqueda: SUFIJO, limite: 2, offset: 2 });
      expect(pagina2.total).toBe(3);
      expect(pagina2.items).toHaveLength(1);
      const idsPaginados = [...pagina1.items, ...pagina2.items].map((c) => c.id).sort();
      expect(idsPaginados).toEqual([...ids].sort());
      // Widenas del JOIN para la fila vinculada.
      const filaAlfa = pagina1.items.find((c) => c.id === alfa.conversacionId) ??
        pagina2.items.find((c) => c.id === alfa.conversacionId);
      expect(filaAlfa?.razonSocial).toContain(SUFIJO);
      expect(filaAlfa?.nombreContacto).toContain(SUFIJO);

      // REGRESIÓN escape: el '%' inicial de la búsqueda matchea SOLO un
      // '%' LITERAL del texto (razón social 'Probe 50% sufijo') — no es
      // comodín: las filas sin '%' no pueden matchear pase lo que pase
      // en los datos ajenos.
      const conPorcentaje = await repo.listar({ busqueda: `% ${SUFIJO}` });
      expect(conPorcentaje.items.map((c) => c.id)).toEqual([gamma.conversacionId]);
      expect(conPorcentaje.total).toBe(1);

      const soloPorcentaje = await repo.listar({ busqueda: '%' });
      const idsSoloPorcentaje = new Set(soloPorcentaje.items.map((c) => c.id));
      expect(idsSoloPorcentaje.has(gamma.conversacionId)).toBe(true); // el literal sí matchea
      expect(idsSoloPorcentaje.has(alfa.conversacionId)).toBe(false); // sin '%' NO matchea
      expect(idsSoloPorcentaje.has(beta.conversacionId)).toBe(false);
    } finally {
      await limpiarProbe();
    }
  });

  it('listar por estado; 0 filas bajo filtro propio → total 0', async () => {
    try {
      const alfa = await crearFixtureVinculada('ACTIVA_IA');
      await crearFixtureVinculada('PAUSADA');

      const activas = await repo.listar({ busqueda: SUFIJO, estado: 'ACTIVA_IA' });
      expect(activas.items.map((c) => c.id)).toEqual([alfa.conversacionId]);
      expect(activas.total).toBe(1);

      // Ninguna probe CERRADA: 0 filas → total 0 (COUNT OVER sin filas).
      const cerradas = await repo.listar({ busqueda: SUFIJO, estado: 'CERRADA' });
      expect(cerradas.items).toEqual([]);
      expect(cerradas.total).toBe(0);
    } finally {
      await limpiarProbe();
    }
  });

  it('listar: preview del último mensaje (OUTER APPLY TOP 1) — último id gana, sin mensajes → null', async () => {
    try {
      const alfa = await crearFixtureVinculada('ACTIVA_IA');
      const beta = await crearFixtureVinculada('PAUSADA');
      // Tres mensajes en alfa: IN, OUT IA y OUT IA MÁS NUEVO — el preview
      // debe reflejar SOLO el último por id (mismo criterio que el hilo).
      const cuerpos = [
        { direccion: 'IN', emisor: 'CLIENTE', cuerpo: `Consulta inicial ${SUFIJO}` },
        { direccion: 'OUT', emisor: 'IA', cuerpo: `Te confirmo el turno ${SUFIJO}` },
        { direccion: 'OUT', emisor: 'IA', cuerpo: `Recordatorio final ${SUFIJO}` },
      ];
      for (const c of cuerpos) {
        await pool
          .request()
          .input('conversacionId', mssql.Int, alfa.conversacionId)
          .input('direccion', mssql.VarChar(3), c.direccion)
          .input('emisor', mssql.VarChar(10), c.emisor)
          .input('cuerpo', mssql.NVarChar(4000), c.cuerpo)
          .query(`
            INSERT INTO dbo.CRM_Mensajes (conversacionId, direccion, emisor, cuerpo)
            VALUES (@conversacionId, @direccion, @emisor, @cuerpo)
          `);
      }

      const pagina = await repo.listar({ busqueda: SUFIJO });
      const filaAlfa = pagina.items.find((c) => c.id === alfa.conversacionId);
      const filaBeta = pagina.items.find((c) => c.id === beta.conversacionId);

      // El preview matchea el último mensaje sembrado (≤120 chars → exacto).
      expect(filaAlfa?.ultimoMensajeCuerpo).toBe(`Recordatorio final ${SUFIJO}`);
      expect(filaAlfa?.ultimoMensajeEmisor).toBe('IA');
      // Beta no tiene mensajes: OUTER APPLY sin filas → NULL, null-safe.
      expect(filaBeta?.ultimoMensajeCuerpo).toBeNull();
      expect(filaBeta?.ultimoMensajeEmisor).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('vincular asocia empresa+contacto (+estado/telefono); id inexistente → null', async () => {
    try {
      const empresaId = await crearEmpresaProbe(`Probe Vinc ${SUFIJO} SA`);
      const contactoId = await crearContactoProbe(empresaId, `Contacto Vinc ${SUFIJO}`, null);
      const conv = await repo.crear({ canal: 'WHATSAPP', telefono: telefonoProbe() });
      conversacionesCreadas.add(conv.id);

      const vinculada = await repo.vincular(conv.id, {
        empresaId,
        contactoId,
        estado: 'TOMADA_HUMANO',
      });
      expect(vinculada).toMatchObject({
        id: conv.id,
        empresaId,
        contactoId,
        estado: 'TOMADA_HUMANO',
      });
      const releida = await repo.obtenerPorId(conv.id);
      expect(releida?.empresaId).toBe(empresaId);

      expect(await repo.vincular(await idInexistente('CRM_Conversaciones'), {
        empresaId,
        contactoId,
      })).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('registrarActividad: IN incrementa noLeidos, OUT no; ambas avanzan ultimoMensajeEn', async () => {
    try {
      const conv = await repo.crear({ canal: 'WHATSAPP', telefono: telefonoProbe() });
      conversacionesCreadas.add(conv.id);
      expect(conv.noLeidos).toBe(0);
      expect(conv.ultimoMensajeEn).toBeNull();

      await repo.registrarActividad(conv.id, 'IN');
      await repo.registrarActividad(conv.id, 'IN');
      await repo.registrarActividad(conv.id, 'OUT');

      const trasActividad = await repo.obtenerPorId(conv.id);
      expect(trasActividad?.noLeidos).toBe(2); // OUT no infla el badge
      expect(trasActividad?.ultimoMensajeEn).not.toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('marcarMensajesLeidos vuelve noLeidos a 0', async () => {
    try {
      const conv = await repo.crear({ canal: 'WHATSAPP', telefono: telefonoProbe() });
      conversacionesCreadas.add(conv.id);
      await repo.registrarActividad(conv.id, 'IN');
      await repo.registrarActividad(conv.id, 'IN');
      expect((await repo.obtenerPorId(conv.id))?.noLeidos).toBe(2);

      await repo.marcarMensajesLeidos(conv.id);

      expect((await repo.obtenerPorId(conv.id))?.noLeidos).toBe(0);
    } finally {
      await limpiarProbe();
    }
  });

  it('buscarCandidatosVinculacion: mismo teléfono en 2 empresas → 2 candidatos; único → 1; desconocido → 0', async () => {
    try {
      // Teléfonos texto-libre válidos como local PY con troncal '0'
      // ('0981 DDDDDD' → +595981DDDDDD, la misma clave de dígitos).
      const telefonoCompartido = `0981 ${DIGITOS}`;
      const telefonoUnico = `0982 ${DIGITOS}`;
      const empresaA = await crearEmpresaProbe(`Probe Cand A ${SUFIJO} SA`);
      const empresaB = await crearEmpresaProbe(`Probe Cand B ${SUFIJO} SA`);
      const empresaC = await crearEmpresaProbe(`Probe Cand C ${SUFIJO} SA`);
      await crearContactoProbe(empresaA, `Compartido A ${SUFIJO}`, telefonoCompartido);
      await crearContactoProbe(empresaB, `Compartido B ${SUFIJO}`, telefonoCompartido);
      await crearContactoProbe(empresaC, `Unico C ${SUFIJO}`, telefonoUnico);

      const compartidos = await repo.buscarCandidatosVinculacion(`+595981${DIGITOS}`);
      expect(compartidos.map((c) => c.empresaId).sort()).toEqual([empresaA, empresaB].sort());
      expect(compartidos.every((c) => c.telefono === telefonoCompartido)).toBe(true);
      expect(compartidos.every((c) => c.razonSocial.includes(SUFIJO))).toBe(true);

      const unicos = await repo.buscarCandidatosVinculacion(`+595982${DIGITOS}`);
      expect(unicos.map((c) => c.empresaId)).toEqual([empresaC]);

      // Dígitos aleatorios de esta corrida: nadie más los tiene.
      const ninguno = await repo.buscarCandidatosVinculacion(`+595985${DIGITOS}999`);
      expect(ninguno).toEqual([]);
    } finally {
      await limpiarProbe();
    }
  });

  it('buscarCandidatosVinculacion E2·T8: seek exacto por telefonoNormalizado + fallback texto-libre; sin match → []', async () => {
    try {
      // SEEK: dos contactos comparten el MISMO E.164 normalizado (la
      // semántica de hoy se preserva: sin UNIQUE — ambos son candidatos)
      // con textos libres formateados DISTINTOS del E.164. El seek
      // exacto del índice los encuentra pese al formato del texto libre.
      const e164Compartido = `+595981${DIGITOS}`;
      const empresaSeekA = await crearEmpresaProbe(`Probe Seek A ${SUFIJO} SA`);
      const empresaSeekB = await crearEmpresaProbe(`Probe Seek B ${SUFIJO} SA`);
      const seekB = await crearContactoProbe(
        empresaSeekB, `Seek B ${SUFIJO}`, `0981-${DIGITOS}`, e164Compartido,
      );
      const seekA = await crearContactoProbe(
        empresaSeekA, `Seek A ${SUFIJO}`, `(0981) ${DIGITOS.slice(0, 3)} ${DIGITOS.slice(3)}`, e164Compartido,
      );

      // FALLBACK: normalizado NULL + texto libre con formato → match vía
      // el scan texto-libre sobre el subconjunto SIN normalizar.
      const e164Fallback = `+595982${DIGITOS}`;
      const empresaFb = await crearEmpresaProbe(`Probe Fb ${SUFIJO} SA`);
      const fb = await crearContactoProbe(empresaFb, `Fallback ${SUFIJO}`, `0982 ${DIGITOS}`, null);

      // SIN MATCH: teléfono válido propio + normalizado propio — el
      // número consultado no existe en ninguna fila.
      const empresaSin = await crearEmpresaProbe(`Probe Sin ${SUFIJO} SA`);
      await crearContactoProbe(empresaSin, `Sin ${SUFIJO}`, `0983 ${DIGITOS}`, `+595983${DIGITOS}`);

      // DRIFT: normalizado fijado a OTRO valor aunque su texto libre
      // normalizaría al consultado — la columna normalizada es
      // autoritativa: el fallback SOLO cubre filas con normalizado NULL.
      const empresaDrift = await crearEmpresaProbe(`Probe Drift ${SUFIJO} SA`);
      await crearContactoProbe(empresaDrift, `Drift ${SUFIJO}`, `0984 ${DIGITOS}`, `+595986${DIGITOS}`);

      const compartidos = await repo.buscarCandidatosVinculacion(e164Compartido);
      expect(compartidos.map((c) => c.contactoId)).toEqual([seekA, seekB].sort((a, b) => a - b)); // orden id ASC
      expect(compartidos.map((c) => c.empresaId).sort()).toEqual([empresaSeekA, empresaSeekB].sort());
      expect(compartidos.every((c) => c.telefono !== e164Compartido)).toBe(true); // texto libre formateado distinto
      expect(compartidos.every((c) => c.nombreContacto.includes('Seek'))).toBe(true);
      expect(compartidos.every((c) => c.razonSocial.includes(SUFIJO))).toBe(true);

      const porFallback = await repo.buscarCandidatosVinculacion(e164Fallback);
      expect(porFallback.map((c) => c.contactoId)).toEqual([fb]);
      expect(porFallback[0]?.telefono).toBe(`0982 ${DIGITOS}`);

      // Nadie tiene estos números → []; y la fila drift NO vuelve por el
      // fallback pese a que su texto libre normalizaría al consultado.
      expect(await repo.buscarCandidatosVinculacion(`+595985${DIGITOS}`)).toEqual([]);
      expect(await repo.buscarCandidatosVinculacion(`+595984${DIGITOS}`)).toEqual([]);
    } finally {
      await limpiarProbe();
    }
  });

  it('crearContacto + obtenerContactoPorId; id inexistente → null', async () => {
    try {
      const empresaId = await crearEmpresaProbe(`Probe Nuevo ${SUFIJO} SA`);
      const { contactoId } = await repo.crearContacto(empresaId, {
        nombre: `Nuevo Contacto ${SUFIJO}`,
        cargo: 'Compras',
      });

      const contacto = await repo.obtenerContactoPorId(contactoId);
      expect(contacto).toMatchObject({
        contactoId,
        empresaId,
        nombreContacto: `Nuevo Contacto ${SUFIJO}`,
        telefono: null,
      });
      expect(contacto?.razonSocial).toContain(SUFIJO);

      expect(await repo.obtenerContactoPorId(await idInexistente('CRM_Contactos'))).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('buscarContactosTexto: escape de % (solo matchea el literal)', async () => {
    try {
      const empresaLimpia = await crearEmpresaProbe(`Probe Limpio ${SUFIJO} SA`);
      await crearContactoProbe(empresaLimpia, `Limpio ${SUFIJO}`, null);
      const empresaConPorcentaje = await crearEmpresaProbe(`Probe 60% ${SUFIJO} SA`);
      await crearContactoProbe(empresaConPorcentaje, `Cincuenta ${SUFIJO}`, null);

      const porSufijo = await repo.buscarContactosTexto(SUFIJO);
      expect(porSufijo.map((c) => c.empresaId).sort()).toEqual(
        [empresaLimpia, empresaConPorcentaje].sort(),
      );

      // REGRESIÓN escape: el '%' inicial NO es comodín — solo matchea la
      // fila cuyo texto contiene '%' LITERAL seguido de espacio+sufijo probe.
      const conPorcentaje = await repo.buscarContactosTexto(`% ${SUFIJO}`);
      expect(conPorcentaje.map((c) => c.empresaId)).toEqual([empresaConPorcentaje]);

      const soloPorcentaje = await repo.buscarContactosTexto('%');
      const idsSoloPorcentaje = new Set(soloPorcentaje.map((c) => c.empresaId));
      expect(idsSoloPorcentaje.has(empresaConPorcentaje)).toBe(true);
      expect(idsSoloPorcentaje.has(empresaLimpia)).toBe(false);
    } finally {
      await limpiarProbe();
    }
  });
});

/** An id guaranteed absent RIGHT NOW from CRM_SolicitudesAyuda (max + delta). */
async function idSolicitudInexistente(): Promise<number> {
  const result = await pool.request().query('SELECT MAX(id) AS maximo FROM dbo.CRM_SolicitudesAyuda');
  const maximo = (result.recordset as { maximo: number | null }[])[0]?.maximo ?? 0;
  return maximo + 1000;
}

describe('E3 (agente-ia-crm): solicitudes de ayuda humana', () => {
  it('lifecycle: crear → PENDIENTE con terminos/score/mensajeId; resolver → RESUELTA con indicacion/resueltaPor/resueltaEn', async () => {
    try {
      const fixture = await crearFixtureVinculada('REQUIERE_HUMANO');
      const creada = await repo.crearSolicitudAyuda({
        conversacionId: fixture.conversacionId,
        mensajeId: null,
        consulta: `¿Hacen certificados médicos para minería ${SUFIJO}?`,
        terminosBuscados: ['certificados', 'minería'],
        score: 0.42,
      });
      expect(creada).toMatchObject({
        id: expect.any(Number),
        conversacionId: fixture.conversacionId,
        mensajeId: null,
        consulta: `¿Hacen certificados médicos para minería ${SUFIJO}?`,
        estado: 'PENDIENTE',
        indicacion: null,
        resueltaPor: null,
        resueltaEn: null,
      });
      expect(creada.terminosBuscados).toEqual(['certificados', 'minería']);
      expect(creada.score).toBeCloseTo(0.42);
      expect(creada.creadoEn).toBeInstanceOf(Date);

      // La pendiente de ESTA conversación es la recién creada; aún no
      // hay resuelta ninguna.
      const pendiente = await repo.obtenerSolicitudAyudaPendiente(fixture.conversacionId);
      expect(pendiente?.id).toBe(creada.id);
      expect(await repo.obtenerUltimaSolicitudResuelta(fixture.conversacionId)).toBeNull();

      const resuelta = await repo.resolverSolicitudAyuda(
        creada.id,
        'Responder que sí, con precio de lista 2026',
        'Operadora Probe',
      );
      expect(resuelta.id).toBe(creada.id);
      expect(resuelta.estado).toBe('RESUELTA');
      expect(resuelta.indicacion).toBe('Responder que sí, con precio de lista 2026');
      expect(resuelta.resueltaPor).toBe('Operadora Probe');
      expect(resuelta.resueltaEn).toBeInstanceOf(Date);

      // Resuelta: la pendiente desaparece y la última resuelta es ella.
      expect(await repo.obtenerSolicitudAyudaPendiente(fixture.conversacionId)).toBeNull();
      const ultima = await repo.obtenerUltimaSolicitudResuelta(fixture.conversacionId);
      expect(ultima?.id).toBe(creada.id);
      expect(ultima?.indicacion).toBe('Responder que sí, con precio de lista 2026');

      // mensajeId presente también hace round-trip (BIGINT sin FK).
      const conMensaje = await repo.crearSolicitudAyuda({
        conversacionId: fixture.conversacionId,
        mensajeId: 987654321,
        consulta: `Segunda consulta ${SUFIJO}`,
        terminosBuscados: [],
        score: null,
      });
      expect(conMensaje.mensajeId).toBe(987654321);
      expect(conMensaje.terminosBuscados).toEqual([]);
      expect(conMensaje.score).toBeNull();

      // Conversación ajena sin solicitudes → null.
      expect(await repo.obtenerSolicitudAyudaPendiente(await idInexistente('CRM_Conversaciones'))).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('resolver una solicitud ya RESUELTA → ConflictError tipado; id inexistente → NotFoundError tipado', async () => {
    try {
      const fixture = await crearFixtureVinculada('REQUIERE_HUMANO');
      const creada = await repo.crearSolicitudAyuda({
        conversacionId: fixture.conversacionId,
        consulta: `Consulta a resolver dos veces ${SUFIJO}`,
        terminosBuscados: ['consulta'],
        score: 0.1,
      });
      await repo.resolverSolicitudAyuda(creada.id, 'primera indicación', 'Operadora Probe');

      await expect(
        repo.resolverSolicitudAyuda(creada.id, 'segunda indicación', 'Operadora Probe'),
      ).rejects.toMatchObject({ name: 'ConflictError', code: 'CONFLICT_ERROR' });
      await expect(
        repo.resolverSolicitudAyuda(creada.id, 'segunda indicación', 'Operadora Probe'),
      ).rejects.toBeInstanceOf(ConflictError);

      await expect(
        repo.resolverSolicitudAyuda(await idSolicitudInexistente(), 'indicación', 'Operadora Probe'),
      ).rejects.toMatchObject({ name: 'NotFoundError', code: 'NOT_FOUND_ERROR' });
      await expect(
        repo.resolverSolicitudAyuda(await idSolicitudInexistente(), 'indicación', 'Operadora Probe'),
      ).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await limpiarProbe();
    }
  });
});

describe('E3 (agente-ia-crm): extracciones de ficha (upsert IA vs HUMANO)', () => {
  it('inserta y luego actualiza la MISMA fila (dedup contacto+empresa+campo con claves NULL)', async () => {
    try {
      const fixture = await crearFixtureVinculada('ACTIVA_IA');
      const primera = await repo.upsertExtraccionFicha({
        contactoId: fixture.contactoId,
        empresaId: fixture.empresaId,
        campo: 'cargo',
        valor: 'Jefe de Compras',
        origen: 'IA',
        confirmado: false,
      });
      extraccionesCreadas.add(primera.id);
      expect(primera).toMatchObject({
        id: expect.any(Number),
        contactoId: fixture.contactoId,
        empresaId: fixture.empresaId,
        campo: 'cargo',
        valor: 'Jefe de Compras',
        origen: 'IA',
        confirmado: false,
      });
      expect(primera.actualizadoEn).toBeInstanceOf(Date);

      // Re-extracción IA: MISMA fila, valor/origen/confirmado actualizados.
      const segunda = await repo.upsertExtraccionFicha({
        contactoId: fixture.contactoId,
        empresaId: fixture.empresaId,
        campo: 'cargo',
        valor: 'Gerente de Compras',
        origen: 'IA',
        confirmado: false,
      });
      expect(segunda.id).toBe(primera.id);
      expect(segunda.valor).toBe('Gerente de Compras');
      expect(segunda.origen).toBe('IA');

      // Una extracción con la clave contacto pero empresaId NULL es OTRA
      // fila (dedup exacto por la tupla con NULLs — sin unique index).
      const soloContacto = await repo.upsertExtraccionFicha({
        contactoId: fixture.contactoId,
        empresaId: null,
        campo: 'cargo',
        valor: 'Valor sin empresa',
        origen: 'IA',
        confirmado: false,
      });
      extraccionesCreadas.add(soloContacto.id);
      expect(soloContacto.id).not.toBe(primera.id);
    } finally {
      await limpiarProbe();
    }
  });

  it('la re-extracción IA NO sobrescribe una fila HUMANO confirmada (gana el humano)', async () => {
    try {
      const fixture = await crearFixtureVinculada('ACTIVA_IA');
      const ia = await repo.upsertExtraccionFicha({
        contactoId: fixture.contactoId,
        empresaId: fixture.empresaId,
        campo: 'trabajadores',
        valor: '50',
        origen: 'IA',
        confirmado: false,
      });
      extraccionesCreadas.add(ia.id);

      // Un humano corrige y confirma.
      const humana = await repo.upsertExtraccionFicha({
        contactoId: fixture.contactoId,
        empresaId: fixture.empresaId,
        campo: 'trabajadores',
        valor: '120',
        origen: 'HUMANO',
        confirmado: true,
      });
      expect(humana.id).toBe(ia.id);
      expect(humana).toMatchObject({ valor: '120', origen: 'HUMANO', confirmado: true });

      // La IA re-extrae OTRO valor: la fila humana confirmada NO cambia
      // (misma id, valor/origen/confirmado intactos, actualizadoEn intacto).
      const iaDeNuevo = await repo.upsertExtraccionFicha({
        contactoId: fixture.contactoId,
        empresaId: fixture.empresaId,
        campo: 'trabajadores',
        valor: '200',
        origen: 'IA',
        confirmado: false,
      });
      expect(iaDeNuevo.id).toBe(ia.id);
      expect(iaDeNuevo.valor).toBe('120');
      expect(iaDeNuevo.origen).toBe('HUMANO');
      expect(iaDeNuevo.confirmado).toBe(true);
      expect(iaDeNuevo.actualizadoEn.getTime()).toBe(humana.actualizadoEn.getTime());
    } finally {
      await limpiarProbe();
    }
  });

  it('listarExtraccionesFicha por contacto y por empresa; ambos null → []', async () => {
    try {
      const f1 = await crearFixtureVinculada('ACTIVA_IA');
      const f2 = await crearFixtureVinculada('ACTIVA_IA');
      const cargo = await repo.upsertExtraccionFicha({
        contactoId: f1.contactoId, empresaId: f1.empresaId,
        campo: 'cargo', valor: 'Compras', origen: 'IA', confirmado: false,
      });
      const sedes = await repo.upsertExtraccionFicha({
        contactoId: f1.contactoId, empresaId: null,
        campo: 'sedes', valor: '3', origen: 'IA', confirmado: false,
      });
      const trabajadores = await repo.upsertExtraccionFicha({
        contactoId: null, empresaId: f1.empresaId,
        campo: 'trabajadores', valor: '80', origen: 'IA', confirmado: false,
      });
      const ajena = await repo.upsertExtraccionFicha({
        contactoId: f2.contactoId, empresaId: f2.empresaId,
        campo: 'cargo', valor: 'Otro cargo', origen: 'IA', confirmado: false,
      });
      extraccionesCreadas.add(cargo.id);
      extraccionesCreadas.add(sedes.id);
      extraccionesCreadas.add(trabajadores.id);
      extraccionesCreadas.add(ajena.id);

      // Por contacto: filas cuya COLUMNA contactoId es la del f1 (la de
      // empresa-only no entra por la empresa de f1).
      const porContacto = await repo.listarExtraccionesFicha(f1.contactoId, null);
      expect(porContacto.map((e) => e.id).sort()).toEqual([cargo.id, sedes.id].sort());

      // Por empresa: filas cuya COLUMNA empresaId es la de f1.
      const porEmpresa = await repo.listarExtraccionesFicha(null, f1.empresaId);
      expect(porEmpresa.map((e) => e.id).sort()).toEqual([cargo.id, trabajadores.id].sort());

      expect(await repo.listarExtraccionesFicha(null, null)).toEqual([]);
    } finally {
      await limpiarProbe();
    }
  });
});

describe('E3·T4 (agente-ia-crm): promoción de cargo del contacto', () => {
  it('actualizarCargoContacto redondea el cargo canónico (obtenerContactoPorId lo expone); id inexistente → null', async () => {
    try {
      const fixture = await crearFixtureVinculada('ACTIVA_IA');

      // El contacto probe nace SIN cargo (columna aditiva — NULL).
      const antes = await repo.obtenerContactoPorId(fixture.contactoId);
      expect(antes).not.toBeNull();
      expect(antes?.cargo).toBeNull();

      const actualizado = await repo.actualizarCargoContacto(fixture.contactoId, 'Jefe de Compras');
      expect(actualizado).toMatchObject({
        contactoId: fixture.contactoId,
        empresaId: fixture.empresaId,
        nombreContacto: `Contacto ACTIVA_IA-${SUFIJO}`,
        cargo: 'Jefe de Compras',
      });

      // Round-trip: releído desde la base.
      const releido = await repo.obtenerContactoPorId(fixture.contactoId);
      expect(releido?.cargo).toBe('Jefe de Compras');

      // Re-promoción (el operador corrige): el valor canónico se reemplaza.
      const corregido = await repo.actualizarCargoContacto(fixture.contactoId, 'Gerente');
      expect(corregido?.cargo).toBe('Gerente');

      const ausente = await idInexistente('CRM_Contactos');
      expect(await repo.actualizarCargoContacto(ausente, 'X')).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });
});

describe('E3 (agente-ia-crm): asignación y memoria por conversación', () => {
  it('actualizarAsignacion fija asignadaA + modo (round-trip ida y vuelta)', async () => {
    try {
      const fixture = await crearFixtureVinculada('REQUIERE_HUMANO');
      expect((await repo.obtenerPorId(fixture.conversacionId))?.asignadaA).toBeNull();

      await repo.actualizarAsignacion(fixture.conversacionId, 'soporte@holomedic.com.py', 'HUMANO');
      expect(await repo.obtenerPorId(fixture.conversacionId)).toMatchObject({
        asignadaA: 'soporte@holomedic.com.py',
        modo: 'HUMANO',
      });

      // Devolución a la Guía: asignadaA vuelve a NULL.
      await repo.actualizarAsignacion(fixture.conversacionId, null, 'IA');
      expect(await repo.obtenerPorId(fixture.conversacionId)).toMatchObject({
        asignadaA: null,
        modo: 'IA',
      });
    } finally {
      await limpiarProbe();
    }
  });

  it('memoriaActiva nace true (DEFAULT 1) y el mapeo refleja el valor real de la columna', async () => {
    try {
      const telefono = telefonoProbe();
      const conv = await repo.crear({ canal: 'WHATSAPP', telefono });
      conversacionesCreadas.add(conv.id);
      expect(conv.memoriaActiva).toBe(true);
      expect((await repo.obtenerPorId(conv.id))?.memoriaActiva).toBe(true);

      // El listar también la cruza (columna ampliada del JOIN).
      const pagina = await repo.listar({ busqueda: telefono });
      expect(pagina.items.find((c) => c.id === conv.id)?.memoriaActiva).toBe(true);

      // Flip crudo de la columna (el toggle de UI llega en una tarea
      // posterior de E3): prueba que el MAPEO lee la columna, no un 1
      // hardcodeado.
      await pool
        .request()
        .input('id', mssql.Int, conv.id)
        .query('UPDATE dbo.CRM_Conversaciones SET memoriaActiva = 0 WHERE id = @id');
      expect((await repo.obtenerPorId(conv.id))?.memoriaActiva).toBe(false);
    } finally {
      await limpiarProbe();
    }
  });

  it('actualizarMemoriaActiva fija SOLO esa columna y relee la fila (E3·T5)', async () => {
    try {
      const telefono = telefonoProbe();
      const conv = await repo.crear({ canal: 'WHATSAPP', telefono, estado: 'ACTIVA_IA' });
      conversacionesCreadas.add(conv.id);

      // Apagar: devuelve la fila releída con el flip aplicado — y sin
      // tocar estado/modo/asignadaA (el toggle es la ÚNICA escritura).
      const apagada = await repo.actualizarMemoriaActiva(conv.id, false);
      expect(apagada).toMatchObject({
        id: conv.id,
        memoriaActiva: false,
        estado: 'ACTIVA_IA',
        modo: 'IA',
        asignadaA: null,
      });
      expect((await repo.obtenerPorId(conv.id))?.memoriaActiva).toBe(false);

      // Round-trip de vuelta a true.
      const encendida = await repo.actualizarMemoriaActiva(conv.id, true);
      expect(encendida?.memoriaActiva).toBe(true);

      // Id ausente → null (rowsAffected 0, actualizarModo precedent).
      const ausente = await idInexistente('CRM_Conversaciones');
      expect(await repo.actualizarMemoriaActiva(ausente, false)).toBeNull();
    } finally {
      await limpiarProbe();
    }
  });

  it('contarResumen cuenta por estado y MAX(ultimoMensajeEn) en UNA sola query (E3·T3)', async () => {
    // Resiliente como el resto del suite: se apoya en filas probe
    // PROPIAS — los conteos se comparan ANTES/DESPUÉS de crearlas, así
    // las filas de otros runs/usuarios jamás afectan el assert.
    try {
      const antes = await repo.contarResumen();
      expect(antes.total).toBeGreaterThanOrEqual(0);
      expect(antes.requiereAyuda).toBeGreaterThanOrEqual(0);
      expect(antes.pendienteVinculacion).toBeGreaterThanOrEqual(0);

      const fixtureAyuda = await crearFixtureVinculada('REQUIERE_HUMANO');
      const convPendiente = await repo.crear({
        canal: 'WHATSAPP',
        telefono: telefonoProbe(),
        identificadorCanal: identificadorCanalProbe(),
      });
      conversacionesCreadas.add(convPendiente.id);

      const despues = await repo.contarResumen();
      expect(despues.total).toBe(antes.total + 2);
      expect(despues.requiereAyuda).toBe(antes.requiereAyuda + 1);
      expect(despues.pendienteVinculacion).toBe(antes.pendienteVinculacion + 1);
      // MAX(ultimoMensajeEn) cruza como Date (la conversación recién
      // tocada lleva su tick de registrarActividad/crear).
      expect(despues.ultimaActividad).toBeInstanceOf(Date);
    } finally {
      await limpiarProbe();
    }
  });
});

