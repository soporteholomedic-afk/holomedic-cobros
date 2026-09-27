#!/usr/bin/env node
/**
 * One-off TEST-DATA normalization for the CRM panel rollout (spec
 * crm-data-normalization, decision 11: test-data-only, no production
 * migration semantics).
 *
 * What it does against the HOLOMEDIC database:
 *  - Backfills the derivable panel columns using ONLY the product's own
 *    alta defaults (decision 5): `CRM_Contactos.cargo` ← "Recursos
 *    Humanos / Seguridad" and `CRM_Empresas.cantidadTrabajadores` ← 30,
 *    always guarded by `IS NULL` so re-runs are no-ops (idempotent).
 *  - NEVER auto-backfills `sector` (no derivable source) — reported.
 *  - Reports contactos/empresas with missing telefono (report only).
 *
 * Profiles (AGENTS.md SIGLA Database Access):
 *  - Default DRY-RUN connects read-only via the EXPLORADOR_DATOS profile
 *    (`HOLOMEDIC_DB_USER=explorar_datos`); any other explorador user is
 *    refused.
 *  - `--apply` connects with the app's write profile (`DB_*` env vars),
 *    REFUSES the explorador credentials, requires the explicit flag, and
 *    logs every UPDATE it runs.
 *  - Both modes refuse to run against any database other than HOLOMEDIC.
 *
 * The derivation helpers are pure and exported for TDD
 * (scripts/__tests__/crm-normalizar-datos.test.mjs).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import mssql from 'mssql';

/** Alta-modal default cargo (decision 5) — the ONLY backfill value for contactos. */
export const CARGO_DEFAULT = 'Recursos Humanos / Seguridad';

/** Alta-modal default trabajadores (decision 5) — the ONLY backfill value for empresas. */
export const TRABAJADORES_DEFAULT = 30;

/** Read-only exploration profile user (AGENTS.md) — the only dry-run identity. */
const PERFIL_EXPLORADOR = 'explorar_datos';

/** Test-data-only guard (decision 11): the script never touches another DB. */
const BASE_DATOS_REQUERIDA = 'HOLOMEDIC';

/**
 * Build the idempotent write plan from the joined SELECT rows
 * (empresa LEFT JOIN contacto → one row per contacto, plus contactless
 * empresas with `contactoId: null`). Only NULL columns enter the plan;
 * empresa-level ids are deduped so join duplication never double-plans.
 */
export function planificarBackfills(filas) {
  const cargosPorContacto = [];
  const trabajadoresVistos = new Set();
  const trabajadoresPorEmpresa = [];

  for (const fila of filas) {
    if (fila.contactoId !== null && fila.contactoCargo === null) {
      cargosPorContacto.push(fila.contactoId);
    }
    if (
      fila.cantidadTrabajadores === null &&
      !trabajadoresVistos.has(fila.empresaId)
    ) {
      trabajadoresVistos.add(fila.empresaId);
      trabajadoresPorEmpresa.push(fila.empresaId);
    }
  }

  return { cargosPorContacto, trabajadoresPorEmpresa };
}

/**
 * Aggregate the dry-run report: backfill counts (plan-shaped, so the
 * report and the writes can never drift) plus the sin-sector /
 * sin-telefono findings by razonSocial (deduped, row order).
 */
export function construirInforme(filas) {
  const plan = planificarBackfills(filas);
  const empresasVistas = new Set();
  const contactosVistos = new Set();
  const sinSector = new Set();
  const sinTelefono = new Set();

  for (const fila of filas) {
    empresasVistas.add(fila.empresaId);
    if (fila.contactoId !== null) contactosVistos.add(fila.contactoId);
    if (fila.sector === null) sinSector.add(fila.razonSocial);
    if (fila.contactoId !== null && fila.telefono === null) {
      sinTelefono.add(fila.razonSocial);
    }
  }

  return {
    totalEmpresas: empresasVistas.size,
    totalContactos: contactosVistos.size,
    porBackfillCargo: plan.cargosPorContacto.length,
    porBackfillTrabajadores: plan.trabajadoresPorEmpresa.length,
    sinSector: [...sinSector],
    sinTelefono: [...sinTelefono],
  };
}

const CONSULTA_FILAS = `
    SELECT e.id AS empresaId, e.razonSocial, e.sector, e.cantidadTrabajadores,
           c.id AS contactoId, c.cargo AS contactoCargo, c.telefono
    FROM dbo.CRM_Empresas e
    LEFT JOIN dbo.CRM_Contactos c ON c.empresaId = e.id
    ORDER BY e.id, c.id
  `;

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
function resolverConfig(aplicar) {
  const prefijo = aplicar ? 'DB_' : 'HOLOMEDIC_DB_';
  const host = process.env[`${prefijo}HOST`];
  const usuario = process.env[`${prefijo}USER`];
  const password = process.env[`${prefijo}PASSWORD`];
  // Same database in both modes (getHolomedicPool precedent): the name
  // comes from HOLOMEDIC_DB_NAME/default; only the CONNECTION SETTINGS
  // switch with the profile (DB_* = write profile for --apply).
  const base = process.env.HOLOMEDIC_DB_NAME ?? 'HOLOMEDIC';

  if (!host || !usuario || !password) {
    console.error(
      `Faltan credenciales: se requieren ${prefijo}HOST, ${prefijo}USER y ${prefijo}PASSWORD en .env.local.`,
    );
    process.exit(1);
  }
  if (!aplicar && usuario !== PERFIL_EXPLORADOR) {
    console.error(
      `El dry-run debe usar el perfil EXPLORADOR_DATOS (HOLOMEDIC_DB_USER=${PERFIL_EXPLORADOR}); se recibió "${usuario}".`,
    );
    process.exit(1);
  }
  if (aplicar && usuario === PERFIL_EXPLORADOR) {
    console.error('Perfil de solo lectura recibido para --apply; se rechaza la escritura.');
    process.exit(1);
  }
  if (base !== BASE_DATOS_REQUERIDA) {
    console.error(
      `Solo se normaliza la base de pruebas ${BASE_DATOS_REQUERIDA} (decisión 11); se recibió "${base}".`,
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
  const aplicar = process.argv.includes('--apply');
  cargarEnvLocal();
  const config = resolverConfig(aplicar);
  const pool = new mssql.ConnectionPool(config);
  await pool.connect();

  const { recordset: filas } = await pool.request().query(CONSULTA_FILAS);
  const plan = planificarBackfills(filas);
  const informe = construirInforme(filas);

  console.log(
    `[${aplicar ? 'APPLY' : 'DRY-RUN'}] ${informe.totalEmpresas} empresas / ${informe.totalContactos} contactos.`,
  );
  console.log(`Backfill cargo: ${informe.porBackfillCargo} contacto(s).`);
  console.log(`Backfill trabajadores: ${informe.porBackfillTrabajadores} empresa(s).`);
  console.log(`Sin sector (dato manual, no se autocompleta): ${informe.sinSector.join('; ') || 'ninguna'}`);
  console.log(`Sin telefono: ${informe.sinTelefono.join('; ') || 'ninguno'}`);

  if (!aplicar) {
    console.log('Dry-run: no se escribieron datos. Ejecute con --apply para normalizar.');
  } else {
    for (const contactoId of plan.cargosPorContacto) {
      await pool
        .request()
        .input('id', mssql.Int, contactoId)
        .input('cargo', mssql.VarChar(50), CARGO_DEFAULT)
        .query('UPDATE dbo.CRM_Contactos SET cargo = @cargo WHERE id = @id AND cargo IS NULL');
      console.log(`UPDATE CRM_Contactos id=${contactoId} cargo="${CARGO_DEFAULT}"`);
    }
    for (const empresaId of plan.trabajadoresPorEmpresa) {
      await pool
        .request()
        .input('id', mssql.Int, empresaId)
        .input('cantidad', mssql.Int, TRABAJADORES_DEFAULT)
        .query('UPDATE dbo.CRM_Empresas SET cantidadTrabajadores = @cantidad WHERE id = @id AND cantidadTrabajadores IS NULL');
      console.log(`UPDATE CRM_Empresas id=${empresaId} cantidadTrabajadores=${TRABAJADORES_DEFAULT}`);
    }
    console.log(`Apply completo: ${plan.cargosPorContacto.length + plan.trabajadoresPorEmpresa.length} actualización(es).`);
  }

  await pool.close();
}

main().catch((error) => {
  console.error('crm-normalizar-datos falló:', error.message);
  process.exit(1);
});
