#!/usr/bin/env node
/**
 * Backfill script for `CRM_Contactos.telefonoNormalizado` (agente-ia-crm
 * E2·T8 — remediation of the E1 advisory R3-scan-tabla-complea). Reads
 * every contacto row whose telefono or telefonoNormalizado is present,
 * derives the E.164 with the DOMAIN rule and updates only the rows
 * where the stored value differs.
 *
 * Modes:
 *  - Default DRY-RUN: prints the per-row plan (id, telefono →
 *    normalizado; 'sin cambio' when already current; 'no normalizable'
 *    when the phone does not resolve to an E.164) and writes NOTHING.
 *  - `--apply`: performs the bounded UPDATEs — each statement keeps the
 *    `ISNULL(telefonoNormalizado,'') <> ISNULL(@normalizado,'')` guard,
 *    so only rows where the value differs are touched and a re-run is
 *    a no-op (idempotent; there is NO `--limpiar`).
 *
 * Profiles (AGENTS.md SIGLA Database Access):
 *  - Default DRY-RUN connects read-only via the EXPLORADOR_DATOS
 *    profile (`HOLOMEDIC_DB_USER=explorar_datos`); any other
 *    explorador user is refused.
 *  - `--apply` connects with the app's write profile (`DB_*` env
 *    vars), REFUSES the explorador credentials, and logs every
 *    statement it runs.
 *  - Both modes refuse to run against any database other than
 *    HOLOMEDIC.
 *
 * The plan/arg helpers are pure and exported for TDD
 * (scripts/__tests__/crm-normalizar-telefonos.test.mjs).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import mssql from 'mssql';

/** Read-only exploration profile user (AGENTS.md) — the only dry-run identity. */
const PERFIL_EXPLORADOR = 'explorar_datos';

/** Shared dev database guard — the script never touches another DB. */
const BASE_DATOS_REQUERIDA = 'HOLOMEDIC';

/**
 * Read only the rows that can possibly need work: both columns NULL is
 * already "current" (telefono absent AND nothing stored).
 */
export const SQL_LEER = `
  SELECT id, telefono, telefonoNormalizado
  FROM dbo.CRM_Contactos
  WHERE telefono IS NOT NULL OR telefonoNormalizado IS NOT NULL
  ORDER BY id
`;

/**
 * Bounded idempotent UPDATE: the ISNULL-comparison guard means the
 * statement only ever touches a row whose stored value differs from
 * the freshly derived one (race-safe against a concurrent writer) —
 * re-runs and already-current rows are no-ops.
 */
export const SQL_ACTUALIZAR = `
  UPDATE dbo.CRM_Contactos
  SET telefonoNormalizado = @normalizado, updatedAt = SYSDATETIME()
  WHERE id = @id
    AND ISNULL(telefonoNormalizado, '') <> ISNULL(@normalizado, '')
`;

/**
 * Parse CLI args: DRY-RUN by default (no flags), `--apply` writes.
 * Unknown flags (including `--limpiar`, deliberately absent here — the
 * re-run is already a no-op) are returned so `main` can refuse them.
 */
export function parsearArgumentos(argv) {
  const aplicar = argv.includes('--apply');
  const desconocidos = argv.filter((arg) => arg !== '--apply');
  return { aplicar, desconocidos };
}

/**
 * Free text → E.164 — DOCUMENTED DUPLICATE of the domain's
 * `normalizarTelefonoE164`
 * (src/features/crm/domain/normalizar.ts, agente-ia-crm E1): a
 * standalone .mjs cannot import the TypeScript domain, so the rule is
 * copied verbatim. Parity is pinned by
 * scripts/__tests__/crm-normalizar-telefonos.test.mjs (which imports
 * the domain normalizer and compares both on a case list) — when the
 * domain rule changes, update BOTH copies together.
 */
export function normalizarTelefonoE164(entrada) {
  const limpio = entrada.replace(/[\s\-().]/g, '');
  if (limpio === '') return null;

  if (limpio.startsWith('+')) {
    return internacionalE164(limpio.slice(1));
  }
  if (limpio.startsWith('00')) {
    return internacionalE164(limpio.slice(2));
  }
  if (!/^\d+$/.test(limpio)) return null;

  if (limpio.startsWith('0')) {
    const local = limpio.slice(1);
    if (local.length < 7 || local.length > 10) return null;
    return `+595${local}`;
  }
  if (limpio.startsWith('595') && limpio.length >= 9 && limpio.length <= 13) {
    return `+${limpio}`;
  }
  if (limpio.startsWith('9') && limpio.length >= 9 && limpio.length <= 10) {
    return `+595${limpio}`;
  }
  if ((limpio.startsWith('2') || limpio.startsWith('3')) && limpio.length >= 7 && limpio.length <= 8) {
    return `+595${limpio}`;
  }
  return internacionalE164(limpio);
}

/** 8–15 dígitos (E.164), sin cero inicial tras el '+' — duplicado del dominio. */
function internacionalE164(digitos) {
  if (!/^\d+$/.test(digitos)) return null;
  if (digitos.startsWith('0')) return null;
  if (digitos.length < 8 || digitos.length > 15) return null;
  return `+${digitos}`;
}

/**
 * Idempotency plan: one entry per row, classified so `--apply` only
 * executes the 'actualizar' ones:
 *  - 'actualizar'      → the derived value differs from the stored one
 *                        (includes drift cleanup: stored non-null +
 *                        telefono that no longer normalizes → NULL).
 *  - 'sin cambio'      → already current (derived === stored).
 *  - 'no normalizable' → the phone does not resolve to an E.164 and
 *                        nothing is stored (nothing to do).
 */
export function planificarNormalizacion(filas) {
  return filas.map((fila) => {
    const normalizado = fila.telefono === null ? null : normalizarTelefonoE164(fila.telefono);
    const almacenado = fila.telefonoNormalizado ?? null;
    let accion;
    if (normalizado === null && almacenado === null) {
      accion = 'no normalizable';
    } else if ((normalizado ?? '') === (almacenado ?? '')) {
      accion = 'sin cambio';
    } else {
      accion = 'actualizar';
    }
    return { id: fila.id, telefono: fila.telefono, normalizado, accion };
  });
}

/** Parse KEY=VALUE lines of .env.local into process.env (never overwrite). */
function cargarEnvLocal() {
  const ruta = path.resolve(process.cwd(), '.env.local');
  let contenido;
  try {
    contenido = readFileSync(ruta, 'utf8');
  } catch {
    console.error(`No se pudo leer ${ruta} — ejecute desde la raíz del repo.`);
    process.exit(1);
  }
  for (const linea of contenido.split(/\r?\n/)) {
    const coincide = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linea.trim());
    if (coincide && process.env[coincide[1]] === undefined) {
      process.env[coincide[1]] = coincide[2];
    }
  }
}

/** Resolve the mssql config for a mode, enforcing the AGENTS.md profiles. */
function resolverConfig(escritura) {
  const prefijo = escritura ? 'DB_' : 'HOLOMEDIC_DB_';
  const host = process.env[`${prefijo}HOST`];
  const usuario = process.env[`${prefijo}USER`];
  const password = process.env[`${prefijo}PASSWORD`];
  const base = process.env.HOLOMEDIC_DB_NAME ?? 'HOLOMEDIC';

  if (!host || !usuario || !password) {
    console.error(
      `Faltan credenciales: se requieren ${prefijo}HOST, ${prefijo}USER y ${prefijo}PASSWORD en .env.local.`,
    );
    process.exit(1);
  }
  if (!escritura && usuario !== PERFIL_EXPLORADOR) {
    console.error(
      `El dry-run debe usar el perfil EXPLORADOR_DATOS (HOLOMEDIC_DB_USER=${PERFIL_EXPLORADOR}); se recibió "${usuario}".`,
    );
    process.exit(1);
  }
  if (escritura && usuario === PERFIL_EXPLORADOR) {
    console.error('Perfil de solo lectura recibido para escritura; se rechaza la operación.');
    process.exit(1);
  }
  if (base !== BASE_DATOS_REQUERIDA) {
    console.error(
      `Solo se normaliza la base de pruebas ${BASE_DATOS_REQUERIDA}; se recibió "${base}".`,
    );
    process.exit(1);
  }

  return {
    server: host,
    port: process.env[`${prefijo}PORT`] ? parseInt(process.env[`${prefijo}PORT`], 10) : 1433,
    user: usuario,
    password,
    database: base,
    options: { encrypt: false, trustServerCertificate: true },
  };
}

async function main() {
  const args = parsearArgumentos(process.argv.slice(2));
  if (args.desconocidos.length > 0) {
    console.error(
      `Flag(s) no reconocido(s): ${args.desconocidos.join(', ')}. Uso: --apply (no hace falta --limpiar: re-ejecutar ya es un no-op).`,
    );
    process.exit(1);
  }

  cargarEnvLocal();
  const config = resolverConfig(args.aplicar);
  const pool = new mssql.ConnectionPool(config);
  await pool.connect();

  const { recordset: filas } = await pool.request().query(SQL_LEER);
  const plan = planificarNormalizacion(filas);
  const porAccion = (accion) => plan.filter((p) => p.accion === accion).length;

  console.log(
    `[${args.aplicar ? 'APPLY' : 'DRY-RUN'}] telefonoNormalizado: ${plan.length} fila(s) relevante(s) — ` +
      `${porAccion('actualizar')} por actualizar, ${porAccion('sin cambio')} sin cambio, ` +
      `${porAccion('no normalizable')} no normalizable(s).`,
  );
  for (const entrada of plan) {
    if (entrada.accion === 'actualizar') {
      const destino = entrada.normalizado ?? 'NULL';
      console.log(` - [actualizar] #${entrada.id} "${entrada.telefono ?? ''}" → ${destino}`);
    } else if (entrada.accion === 'sin cambio') {
      console.log(` - [sin cambio] #${entrada.id} "${entrada.telefono ?? ''}" ya es ${entrada.normalizado}`);
    } else {
      console.log(` - [no normalizable] #${entrada.id} "${entrada.telefono ?? ''}"`);
    }
  }

  if (!args.aplicar) {
    console.log(
      'Dry-run: no se escribieron datos. Ejecute con --apply para normalizar (re-ejecutar después es un no-op).',
    );
  } else {
    let actualizadas = 0;
    for (const entrada of plan.filter((p) => p.accion === 'actualizar')) {
      const resultado = await pool
        .request()
        .input('id', mssql.Int, entrada.id)
        .input('normalizado', mssql.VarChar(30), entrada.normalizado)
        .query(SQL_ACTUALIZAR);
      const afectadas = resultado.rowsAffected[0] ?? 0;
      actualizadas += afectadas;
      console.log(
        `UPDATE CRM_Contactos #${entrada.id} telefonoNormalizado=${entrada.normalizado ?? 'NULL'} (${afectadas} fila(s))`,
      );
    }
    console.log(
      `Apply completo: ${actualizadas} fila(s) actualizada(s) de ${porAccion('actualizar')} planeada(s). ` +
        'Re-ejecutar es un no-op.',
    );
  }

  await pool.close();
}

// Run only when executed directly (crm-sembrar-conocimiento precedent),
// guarded so the unit test's import never opens a DB connection.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error('crm-normalizar-telefonos falló:', error.message);
    process.exit(1);
  });
}
