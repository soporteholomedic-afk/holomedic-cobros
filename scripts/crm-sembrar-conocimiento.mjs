#!/usr/bin/env node
/**
 * Knowledge-base seed script for the CRM AI agent (agente-ia-crm
 * E2·T1). Loads the initial curated KB into `CRM_Conocimiento`
 * (~12 entries with REAL Holomedic facts extracted from the repo docs
 * — README.md, docs/ocupacare-design-reference.html,
 * docs/modules/envio-resultados.md — nothing invented).
 *
 * Modes:
 *  - Default DRY-RUN: reads the current titulos, prints the seeding
 *    plan (what exists, what would be inserted) and writes NOTHING.
 *  - `--apply`: writes ONLY the missing entries — each INSERT is an
 *    `INSERT … SELECT … WHERE NOT EXISTS` by titulo, so re-runs are
 *    no-ops (idempotent).
 *  - `--limpiar`: removes ONLY entries whose `etiquetas` contain the
 *    `semilla` tag as a CSV element (curated E5 content and probe
 *    rows are never touched).
 *
 * Profiles (AGENTS.md SIGLA Database Access):
 *  - Default DRY-RUN connects read-only via the EXPLORADOR_DATOS
 *    profile (`HOLOMEDIC_DB_USER=explorar_datos`); any other
 *    explorador user is refused.
 *  - `--apply`/`--limpiar` connect with the app's write profile
 *    (`DB_*` env vars), REFUSE the explorador credentials, and log
 *    every statement they run.
 *  - Both modes refuse to run against any database other than
 *    HOLOMEDIC.
 *
 * The plan/arg helpers are pure and exported for TDD
 * (scripts/__tests__/crm-sembrar-conocimiento.test.mjs).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import mssql from 'mssql';

/** Marker tag carried by EVERY seeded entry — `--limpiar`'s only target. */
export const ETIQUETA_SEMILLA = 'semilla';

/** Read-only exploration profile user (AGENTS.md) — the only dry-run identity. */
const PERFIL_EXPLORADOR = 'explorar_datos';

/** Shared dev database guard — the script never touches another DB. */
const BASE_DATOS_REQUERIDA = 'HOLOMEDIC';

/**
 * CSV-safe seed-row predicate: the tag must appear as an exact
 * comma-separated ELEMENT ('no_semilla' or 'semillero' never match).
 */
export const PREDICADO_SEMILLA = `(',' + etiquetas + ',') LIKE '%,${ETIQUETA_SEMILLA},%'`;

/** Idempotent per-entry insert: guarded by `WHERE NOT EXISTS` on titulo. */
export const SQL_INSERTAR_ENTRADA = `
  INSERT INTO dbo.CRM_Conocimiento (titulo, contenido, etiquetas)
  SELECT @titulo, @contenido, @etiquetas
  WHERE NOT EXISTS (SELECT 1 FROM dbo.CRM_Conocimiento WHERE titulo = @titulo)
`;

/** Seed cleanup: ONLY rows tagged 'semilla' (CSV element match). */
export const SQL_LIMPIAR_SEMILLA = `DELETE FROM dbo.CRM_Conocimiento WHERE ${PREDICADO_SEMILLA}`;

/**
 * Seed entries — every fact is verifiable in the repo docs (see the
 * header). Spanish, client-facing (la Guía quotes this content);
 * every entry carries `semilla` plus topic tags.
 */
export const ENTRADAS_SEMILLA = [
  {
    titulo: 'Certificados médicos en 24 horas',
    contenido:
      'En Holomedic los certificados médicos están listos en 24 horas. La entrega es súper rápida para que el personal de la empresa no detenga sus labores esperando los documentos.',
    etiquetas: 'semilla,servicios,tiempos',
  },
  {
    titulo: 'Exámenes ocupacionales de ingreso, periódicos y de salida',
    contenido:
      'Realizamos exámenes médicos para trabajadores: de ingreso (cuando entra personal nuevo), chequeos anuales periódicos y de salida.',
    etiquetas: 'semilla,servicios,examenes',
  },
  {
    titulo: 'Exámenes especiales según el tipo de trabajo',
    contenido:
      'Ofrecemos exámenes especiales según el trabajo que realiza el colaborador: altura, manipulación de alimentos, ruido, polvo o esfuerzo físico.',
    etiquetas: 'semilla,servicios,examenes',
  },
  {
    titulo: 'Campañas médicas en las oficinas del cliente',
    contenido:
      'Si la empresa tiene varios trabajadores, nuestro equipo médico puede ir directamente a sus propias oficinas o locales para realizar las campañas de exámenes.',
    etiquetas: 'semilla,servicios,campanas',
  },
  {
    titulo: 'Entrega inmediata de resultados',
    contenido:
      'Atendemos al personal de las empresas de forma muy ágil para que no pierdan horas esperando, y los resultados se entregan de inmediato.',
    etiquetas: 'semilla,resultados',
  },
  {
    titulo: 'Envío de resultados CAMO y EMO por correo',
    contenido:
      'El equipo de Holomedic envía por correo electrónico los resultados médicos (CAMO/EMO) de los pacientes de una empresa, como consolidado con sus archivos adjuntos. Cada envío queda registrado en un historial auditable.',
    etiquetas: 'semilla,resultados,envio',
  },
  {
    titulo: 'Cotización para empresas',
    contenido:
      'Podemos coordinar una breve llamada de 5 minutos o enviar una cotización sin ningún compromiso.',
    etiquetas: 'semilla,cotizacion,contacto',
  },
  {
    titulo: 'Beneficios de mantener los exámenes al día',
    contenido:
      'Mantener al día los exámenes médicos de los colaboradores permite estar tranquilos ante cualquier revisión laboral del ministerio.',
    etiquetas: 'semilla,servicios,beneficios',
  },
  {
    titulo: 'Folleto informativo por sector',
    contenido:
      'Disponemos de un folleto informativo con todo el detalle para empresas de cada sector: construcción, minería y energía, fábrica y producción, transporte y almacén, comercio y tiendas, y oficinas y servicios.',
    etiquetas: 'semilla,servicios,folleto',
  },
  {
    titulo: 'Canales de contacto con el equipo',
    contenido:
      'Los clientes pueden comunicarse con el Equipo de Atención a Empresas de la Clínica de Salud Ocupacional por teléfono, WhatsApp o correo electrónico.',
    etiquetas: 'semilla,contacto',
  },
  {
    titulo: 'Quiénes somos',
    contenido:
      'Holomedic S.A.C. es una clínica de salud ocupacional. Su plataforma web centraliza la gestión de facturación, cobranza y envío de resultados médicos de las empresas clientes.',
    etiquetas: 'semilla,empresa',
  },
  {
    titulo: 'Facturación y cobranza',
    contenido:
      'Holomedic centraliza los reportes contables, audita los saldos por cliente y gestiona la cobranza de las empresas clientes, con valoraciones automatizadas.',
    etiquetas: 'semilla,pago,facturacion',
  },
];

/**
 * Parse CLI args: DRY-RUN by default (no flags), `--apply` writes the
 * missing seed entries, `--limpiar` removes the seed rows. Unknown
 * flags are returned so `main` can refuse them (never guessed).
 */
export function parsearArgumentos(argv) {
  const aplicar = argv.includes('--apply');
  const limpiar = argv.includes('--limpiar');
  const desconocidos = argv.filter((arg) => arg !== '--apply' && arg !== '--limpiar');
  return { aplicar, limpiar, desconocidos };
}

/**
 * Idempotency plan: only the entries whose titulo is NOT already in
 * the table (the SQL's `WHERE NOT EXISTS` is the race backstop for
 * the same predicate).
 */
export function planificarSiembra(entradas, titulosExistentes) {
  const existentes = new Set(titulosExistentes);
  return entradas.filter((entrada) => !existentes.has(entrada.titulo));
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
  // Same database in both modes (getHolomedicPool precedent): only the
  // CONNECTION SETTINGS switch with the profile (DB_* = write profile
  // for --apply / --limpiar).
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
      `Solo se siembra la base de pruebas ${BASE_DATOS_REQUERIDA}; se recibió "${base}".`,
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
    console.error(`Flag(s) no reconocido(s): ${args.desconocidos.join(', ')}. Uso: --apply | --limpiar.`);
    process.exit(1);
  }
  if (args.aplicar && args.limpiar) {
    console.error('--apply y --limpiar son mutuamente excluyentes; ejecute uno a la vez.');
    process.exit(1);
  }

  cargarEnvLocal();
  const config = resolverConfig(args.aplicar || args.limpiar);
  const pool = new mssql.ConnectionPool(config);
  await pool.connect();

  if (args.limpiar) {
    const conteo = await pool
      .request()
      .query(`SELECT COUNT(*) AS total FROM dbo.CRM_Conocimiento WHERE ${PREDICADO_SEMILLA}`);
    const total = conteo.recordset[0]?.total ?? 0;
    const borrado = await pool.request().query(SQL_LIMPIAR_SEMILLA);
    console.log(
      `Limpieza: ${borrado.rowsAffected[0] ?? 0} entrada(s) con etiqueta "${ETIQUETA_SEMILLA}" eliminadas (de ${total} detectadas). Las entradas curadas quedan intactas.`,
    );
    await pool.close();
    return;
  }

  const { recordset: filas } = await pool
    .request()
    .query('SELECT titulo FROM dbo.CRM_Conocimiento');
  const titulosExistentes = filas.map((fila) => fila.titulo);
  const plan = planificarSiembra(ENTRADAS_SEMILLA, titulosExistentes);

  console.log(
    `[${args.aplicar ? 'APPLY' : 'DRY-RUN'}] Semilla KB: ${ENTRADAS_SEMILLA.length} entrada(s) — ` +
      `${ENTRADAS_SEMILLA.length - plan.length} ya presente(s), ${plan.length} por insertar.`,
  );
  for (const entrada of ENTRADAS_SEMILLA) {
    const estado = plan.some((p) => p.titulo === entrada.titulo) ? 'por insertar' : 'ya presente';
    console.log(` - [${estado}] ${entrada.titulo} (${entrada.etiquetas})`);
  }

  if (!args.aplicar) {
    console.log('Dry-run: no se escribieron datos. Ejecute con --apply para sembrar o --limpiar para retirar la semilla.');
  } else {
    for (const entrada of plan) {
      await pool
        .request()
        .input('titulo', mssql.NVarChar(200), entrada.titulo)
        .input('contenido', mssql.NVarChar(mssql.MAX), entrada.contenido)
        .input('etiquetas', mssql.NVarChar(300), entrada.etiquetas)
        .query(SQL_INSERTAR_ENTRADA);
      console.log(`INSERT CRM_Conocimiento titulo="${entrada.titulo}" etiquetas="${entrada.etiquetas}"`);
    }
    console.log(`Apply completo: ${plan.length} entrada(s) sembrada(s).`);
  }

  await pool.close();
}

// Run only when executed directly (crm-normalizar-datos precedent),
// guarded so the unit test's import never opens a DB connection.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error('crm-sembrar-conocimiento falló:', error.message);
    process.exit(1);
  });
}
