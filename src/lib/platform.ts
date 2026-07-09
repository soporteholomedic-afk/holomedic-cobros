import * as path from 'node:path';

/**
 * Cross-platform runtime detection and path resolution.
 *
 * The app runs on two hosts:
 *
 * - **Windows** (production): the LAN file share is reached via its UNC
 *   path (`\\172.16.10.12\sigla`) and Node `fs` resolves it natively; the
 *   `SIGLA.PdfCli.exe` .NET binary is invoked to generate PDFs.
 * - **Linux/Debian** (dev/ops): the same SMB share is mounted at
 *   `/mnt/sigla` (cifs-utils, SMB3) and reached through the mount point;
 *   the .NET CLI cannot run here, so the generate routes short-circuit
 *   with a clear `CLI_NOT_FOUND`-style 502.
 *
 * This module is the SINGLE source of truth for three values every
 * file-touching module needs:
 *
 * - `isWindows` — `process.platform === 'win32'`. Gates whether the
 *   .NET CLI may be invoked.
 * - `FILE_SERVER_BASE_PATH` — the root of the patient archive share.
 *   The `FILE_SERVER_BASE_PATH` env var always wins; otherwise the
 *   platform default is used (`\\172.16.10.12\sigla` on Windows,
 *   `/mnt/sigla` on Linux).
 * - `pathOs` — the `path.PlatformPath` module (`path.win32` or
 *   `path.posix`) used to COMPOSE paths under the share. It is selected
 *   by the FORMAT of the base path (backslash-present → `win32`,
 *   otherwise → `posix`), NOT by `process.platform`.
 *
 * The format-based selection is deliberate: existing unit tests inject a
 * Windows UNC path (`\\\\172.16.10.12\\sigla`) and assert backslash-joined
 * results. Selecting `pathOs` by format keeps those tests passing on a
 * POSIX test runner — a backslash base path yields `path.win32` semantics
 * regardless of the host OS — while production Linux (mounted at
 * `/mnt/sigla`) correctly gets `path.posix`.
 */
export const isWindows = process.platform === 'win32';

const DEFAULT_FILE_SERVER_BASE_PATH = isWindows
  ? '\\\\172.16.10.12\\sigla'
  : '/mnt/sigla';

/**
 * Root of the LAN share where patient archive documents live. The env
 * var `FILE_SERVER_BASE_PATH` always wins over the platform default.
 * Import this instead of re-reading `process.env` so the value is
 * consistent across every adapter and route.
 */
export const FILE_SERVER_BASE_PATH =
  process.env.FILE_SERVER_BASE_PATH ?? DEFAULT_FILE_SERVER_BASE_PATH;

/**
 * The `path.PlatformPath` module to use when COMPOSING paths under the
 * share. Selected by the format of `FILE_SERVER_BASE_PATH`:
 *
 * - contains a backslash (UNC path) → `path.win32`
 * - otherwise (POSIX mount point) → `path.posix`
 *
 * NOTE: this is NOT used by `src/lib/sanitize-filename.ts`, which keeps
 * `path.win32.basename` unconditionally as a security defense (it strips
 * BOTH `/` and `\` from user-supplied filenames regardless of host OS).
 */
export const pathOs: path.PlatformPath = FILE_SERVER_BASE_PATH.includes('\\')
  ? path.win32
  : path.posix;

/**
 * Location of the SQLite database that backs the email template editor
 * (`templates` + `template_versions` tables). The env var
 * `SQLITE_DB_PATH` always wins over the platform default so ops can
 * point at a persistent volume in production.
 *
 * - Windows default: `%APPDATA%/holomedic/templates.db`
 * - Linux default: `./data/holomedic-templates.db` (relative to the
 *   process cwd; the factory ensures the `data/` dir exists)
 *
 * Mirrors the `FILE_SERVER_BASE_PATH` env-overridable pattern so there is
 * a single source of truth for the SQLite file location.
 */
const DEFAULT_SQLITE_DB_PATH = isWindows
  ? path.join(process.env.APPDATA ?? '.', 'holomedic', 'templates.db')
  : './data/holomedic-templates.db';

export const SQLITE_DB_PATH =
  process.env.SQLITE_DB_PATH ?? DEFAULT_SQLITE_DB_PATH;

/**
 * Which `ITemplateRepository` adapter the factory (`getTemplateDb`)
 * should build. `'better-sqlite3'` is the primary (sync native, best for
 * a read-heavy config table); `'sql.js'` is the WASM fallback used when
 * the native addon cannot be built for the host Node version. Swap is
 * config, not code — both adapters implement the same port. Defaults to
 * `'better-sqlite3'` when the env var is unset.
 */
export type TemplateDbDriver = 'better-sqlite3' | 'sql.js';

export const TEMPLATE_DB_DRIVER: TemplateDbDriver =
  (process.env.TEMPLATE_DB_DRIVER as TemplateDbDriver | undefined) ??
  'better-sqlite3';
