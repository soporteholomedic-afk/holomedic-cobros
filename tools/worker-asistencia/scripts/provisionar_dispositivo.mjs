/**
 * Device provisioning CLI for asistencia-rrhh (REQ-F1-15, ADR-7, ADR-10).
 *
 * Registers (or rotates the token of) a ZKTeco device row in
 * dbo.dispositivos. Security contract:
 * - the API token is 32 random bytes, encoded base64url;
 * - ONLY the SHA-256 hash (exactly 32 bytes, VarBinary(32) — ADR-7)
 *   is ever persisted; the plain token is NEVER bound to a query,
 *   NEVER written to a file and printed EXACTLY ONCE to stdout;
 * - re-running without --rotar is a no-op (idempotent) and prints no
 *   token; --rotar replaces the stored hash of an existing device.
 *
 * Connection env mirrors src/lib/db.ts: HOLOMEDIC_DB_HOST/PORT/USER/
 * PASSWORD with the legacy DB_* fallback; when the process env has
 * nothing, the repo-root .env.local is parsed as a last resort.
 *
 * Usage:
 *   node tools/worker-asistencia/scripts/provisionar_dispositivo.mjs \
 *     --codigo K20-SEDE1 --sede "Sede 1" --ip 192.168.1.50 [--rotar]
 *
 * Pure helpers are exported for provisionar.test.mts (fake pool — the
 * suite never opens a real SQL Server connection).
 */

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import sql from 'mssql';

/** SHA-256 of the token — exactly 32 bytes (ADR-7), stored as VarBinary(32). */
export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest();
}

/** 32 random bytes as unpadded base64url (43 URL-safe chars). */
export function nuevoTokenBase64url(bytes = randomBytes(32)) {
  return bytes.toString('base64url');
}

/** Parse a .env.local-style text: skips comments/blanks, trims, drops empties. */
export function parsearEnvLocal(texto) {
  const valores = {};
  for (const linea of texto.split(/\r?\n/)) {
    const limpio = linea.trim();
    if (!limpio || limpio.startsWith('#')) continue;
    const igual = limpio.indexOf('=');
    if (igual <= 0) continue;
    const clave = limpio.slice(0, igual).trim();
    const valor = limpio.slice(igual + 1).trim();
    if (!clave || valor === '') continue;
    valores[clave] = valor;
  }
  return valores;
}

/** CLI argv parser: --codigo/--sede/--ip required, --rotar optional flag. */
export function parsearArgs(argv) {
  const args = { rotar: false };
  for (let i = 0; i < argv.length; i++) {
    const bandera = argv[i];
    if (bandera === '--rotar') {
      args.rotar = true;
    } else if (bandera === '--codigo' || bandera === '--sede' || bandera === '--ip') {
      const valor = argv[i + 1];
      if (!valor || valor.startsWith('--')) throw new Error(`${bandera} requiere un valor`);
      args[bandera.slice(2)] = valor;
      i++;
    } else {
      throw new Error(`Argumento desconocido: ${bandera}`);
    }
  }
  if (!args.codigo) throw new Error('Falta el argumento requerido --codigo');
  if (!args.sede) throw new Error('Falta el argumento requerido --sede');
  if (!args.ip) throw new Error('Falta el argumento requerido --ip');
  return args;
}

const PREFIJOS_DB = ['HOLOMEDIC_DB_', 'DB_'];

/** Resolve {server, user, password, database}: env prefixes, then .env.local. */
export function resolverConfigDb(env, textoEnvLocal) {
  const local = textoEnvLocal !== undefined ? parsearEnvLocal(textoEnvLocal) : {};
  // Process env wins WHOLE over the file (any prefix): explicit env
  // beats .env.local, mirroring getHolomedicPool()'s prefix selection.
  const leer = (campo) => {
    for (const fuente of [env, local]) {
      for (const prefijo of PREFIJOS_DB) {
        const valor = fuente[`${prefijo}${campo}`];
        if (valor) return valor;
      }
    }
    return undefined;
  };
  const server = leer('HOST');
  const user = leer('USER');
  const password = leer('PASSWORD');
  if (!server || !user || !password) {
    throw new Error(
      'Faltan datos de conexión: define HOLOMEDIC_DB_HOST/USER/PASSWORD (o DB_*) en el entorno o en .env.local',
    );
  }
  const database =
    env.HOLOMEDIC_DB_NAME ?? local.HOLOMEDIC_DB_NAME ?? 'HOLOMEDIC';
  return { server, user, password, database };
}

/**
 * Core provisioning against an injected pool (testable with a fake).
 * Returns {accion, token}; token is present ONLY when a new token took
 * effect ('creado' | 'rotado') so no-op runs have nothing to leak.
 */
export async function provisionarDispositivo(pool, { codigo, sede, ip, rotar = false, token }) {
  const hash = hashToken(token);

  const existencia = await pool
    .request()
    .input('codigo', sql.VarChar(30), codigo)
    .query('SELECT id FROM dbo.dispositivos WHERE codigo = @codigo');

  if (existencia.recordset.length === 0) {
    await pool
      .request()
      .input('codigo', sql.VarChar(30), codigo)
      .input('sede', sql.NVarChar(100), sede)
      .input('ip', sql.VarChar(45), ip)
      .input('hash', sql.VarBinary(32), hash)
      .query(
        'INSERT INTO dbo.dispositivos (codigo, sede, ip, apiTokenHash, activo)' +
          ' VALUES (@codigo, @sede, @ip, @hash, 1)',
      );
    return { accion: 'creado', token };
  }

  if (!rotar) {
    return { accion: 'sin_cambios', token: undefined };
  }

  await pool
    .request()
    .input('hash', sql.VarBinary(32), hash)
    .input('id', sql.Int, existencia.recordset[0].id)
    .query(
      'UPDATE dbo.dispositivos SET apiTokenHash = @hash, updatedAt = SYSDATETIME() WHERE id = @id',
    );
  return { accion: 'rotado', token };
}

function cargarTextoEnvLocal() {
  try {
    return readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  } catch {
    return undefined;
  }
}

async function main() {
  const args = parsearArgs(process.argv.slice(2));
  const config = resolverConfigDb(process.env, cargarTextoEnvLocal());
  const port = Number(process.env.HOLOMEDIC_DB_PORT ?? process.env.DB_PORT ?? 1433);
  const pool = new sql.ConnectionPool({
    ...config,
    port,
    options: { encrypt: false, trustServerCertificate: true },
  });
  await pool.connect();

  const token = nuevoTokenBase64url();
  const resultado = await provisionarDispositivo(pool, { ...args, token });
  await pool.close();

  if (resultado.token) {
    console.log(`Accion: ${resultado.accion}`);
    console.log(
      'TOKEN (se muestra UNA sola vez; guardalo en el DEVICE_TOKEN del worker — nunca se persiste en claro):',
    );
    console.log(resultado.token);
  } else {
    console.log(
      `Sin cambios: el dispositivo ${args.codigo} ya existe. Usa --rotar para girar el token.`,
    );
  }
}

const esEntradaDirecta =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (esEntradaDirecta) {
  main().catch((error) => {
    console.error('provisionar_dispositivo:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
