import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as mssql from 'mssql';

import { getCrmDb } from '@/features/crm/infrastructure/getCrmDb';

import { normalizarNombre } from '../../../domain/normalizar';
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

/** Deletes ONLY what this run created — ids first, no LIKE over foreign data. */
async function limpiarProbe(): Promise<void> {
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
): Promise<number> {
  const inserted = await pool
    .request()
    .input('empresaId', mssql.Int, empresaId)
    .input('nombre', mssql.NVarChar(200), nombre)
    .input('nombreNormalizado', mssql.VarChar(200), normalizarNombre(nombre))
    .input('telefono', mssql.VarChar(30), telefono).query(`
      INSERT INTO dbo.CRM_Contactos (empresaId, nombre, nombreNormalizado, telefono, esPrincipal)
      OUTPUT INSERTED.id
      VALUES (@empresaId, @nombre, @nombreNormalizado, @telefono, 0)
    `);
  const id = (inserted.recordset as { id: number }[])[0]?.id;
  if (id === undefined) throw new Error('INSERT probe de CRM_Contactos no devolvió id');
  return id;
}

/** One linked fixture row: empresa + contacto + conversación vinculada. */
async function crearFixtureVinculada(estado: 'ACTIVA_IA' | 'PAUSADA' | 'TOMADA_HUMANO'): Promise<{
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
