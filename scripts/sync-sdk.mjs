/**
 * SDK true-mirror sync engine.
 *
 * In-module Ports & Adapters split (design A1): a **pure domain core** on top
 * (exclude/protected matching, mirror-plan computation, repo-root resolution —
 * zero fs usage, testable with in-memory entries) and a **side-effecting
 * executor** below (walk/copy/delete adapters). The CLI composition root lands
 * in U3 and will be appended at the file bottom.
 *
 * Spec "Exclude List Authority": the engine walks the filesystem, never git;
 * the exclude lists below are the single authority. Excludes filter the SOURCE
 * walk only — only PROTECTED_PATHS shields destination entries from deletion.
 */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A file inventory entry. `relPath` uses forward slashes relative to the
 * checkout root; `hash` is the SHA-256 hex digest of the file contents.
 * No mtime: change detection is size + SHA-256 (design A3).
 *
 * @typedef {{ relPath: string, size: number, hash: string }} MirrorEntry
 */

/**
 * The mirror plan: source relPaths to copy to the destination and destination
 * relPaths to remove.
 *
 * @typedef {{ copy: string[], delete: string[] }} MirrorPlan
 */

/**
 * Exclusion configuration: exact directory-name segments plus basename file
 * globs (`*` wildcard).
 *
 * @typedef {{ dirNames: string[], fileGlobs: string[] }} ExcludeConfig
 */

/**
 * Directory names excluded from the SOURCE walk (exact segment match; the
 * walker prunes descent). Spec "Exclude List Authority".
 *
 * @type {readonly string[]}
 */
export const EXCLUDED_DIR_NAMES = Object.freeze([
  'node_modules',
  '.next',
  '.git',
  'openspec',
  'sdd',
  'docs',
  '.gga',
  '.codegraph',
  '.atl',
  'temp',
  'tmp',
]);

/**
 * File globs excluded from the SOURCE walk (matched on the basename; `*` is a
 * wildcard). `.env` is listed separately because `.env.*` does not match the
 * bare name. Spec "Exclude List Authority".
 *
 * @type {readonly string[]}
 */
export const EXCLUDED_FILE_GLOBS = Object.freeze([
  '*.zip',
  'tsconfig.tsbuildinfo',
  '*.xlsx',
  '.env',
  '.env.*',
  '.pr-*.md',
]);

/**
 * Destination paths shielded from DELETION only (exact match or `path/`
 * prefix). Protection never forces a copy and never blocks an update.
 *
 * @type {readonly string[]}
 */
export const PROTECTED_PATHS = Object.freeze(['sigla-cli', '.env.local']);

/** @type {Map<string, RegExp>} */
const globRegExpCache = new Map();

/**
 * Compile a basename glob (`*` wildcard) into an anchored RegExp. Compiled
 * patterns are memoized: matching runs per entry, globs are few and fixed.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  let regex = globRegExpCache.get(glob);
  if (!regex) {
    const escaped = glob.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '.*');
    regex = new RegExp(`^${escaped}$`);
    globRegExpCache.set(glob, regex);
  }
  return regex;
}

/**
 * Pure: true when relPath is excluded by an exact directory-name segment or by
 * a basename file glob.
 *
 * @param {string} relPath
 * @param {ExcludeConfig} excludes
 * @returns {boolean}
 */
export function matchesExclude(relPath, excludes) {
  const segments = relPath.split('/');
  if (excludes.dirNames.some((name) => segments.includes(name))) return true;
  const basename = segments[segments.length - 1];
  return excludes.fileGlobs.some((glob) => globToRegExp(glob).test(basename));
}

/**
 * Pure: true when relPath equals a protected path or lives under one
 * (`p + '/'` prefix; segment boundary respected).
 *
 * @param {string} relPath
 * @param {readonly string[]} protectedPaths
 * @returns {boolean}
 */
export function isProtected(relPath, protectedPaths) {
  return protectedPaths.some((p) => relPath === p || relPath.startsWith(`${p}/`));
}

/**
 * Pure: compute the mirror plan.
 *
 * copy = source entries (post-exclude) absent at the destination or changed.
 * Change detection compares size first and the SHA-256 hash only when sizes
 * are equal (design A3 — the `||` short-circuit skips hashing on size miss).
 *
 * delete = destination relPaths absent from the post-exclude source manifest,
 * minus protected paths. Excludes apply to the source only: destination
 * entries under excluded directories are deleted, not shielded (spec R5S2).
 *
 * @param {readonly MirrorEntry[]} sourceEntries
 * @param {readonly MirrorEntry[]} destEntries
 * @param {ExcludeConfig} excludes
 * @param {readonly string[]} protectedPaths
 * @returns {MirrorPlan}
 */
export function computeMirrorPlan(sourceEntries, destEntries, excludes, protectedPaths) {
  const keptSource = sourceEntries.filter((e) => !matchesExclude(e.relPath, excludes));
  const keptPaths = new Set(keptSource.map((e) => e.relPath));
  const destByPath = new Map(destEntries.map((e) => [e.relPath, e]));

  /** @type {string[]} */
  const copy = [];
  for (const source of keptSource) {
    const atDest = destByPath.get(source.relPath);
    const changed = !atDest || atDest.size !== source.size || atDest.hash !== source.hash;
    if (changed) copy.push(source.relPath);
  }

  const remove = destEntries
    .map((e) => e.relPath)
    .filter((relPath) => !keptPaths.has(relPath) && !isProtected(relPath, protectedPaths));

  return { copy, delete: remove };
}

/**
 * Pure: resolve the checkout root from this script's own module URL. The
 * script lives at `<root>/scripts/`, so the root is dirname twice. Never
 * derived from CWD or argv (design: destructive-op safety).
 *
 * @param {string} importMetaUrl
 * @returns {string}
 */
export function resolveRepoRoot(importMetaUrl) {
  return dirname(dirname(fileURLToPath(importMetaUrl)));
}

// ─── Executor adapters (U2) ──────────────────────────────────────────────────
// Side-effecting adapters below this line. Only these functions touch the
// filesystem; the core above stays pure.

/**
 * Adapter: walk a real file tree into {@link MirrorEntry}s. Deterministic
 * depth-first order (readdir results sorted lexicographically per level),
 * forward-slash relPaths, dotfiles included, symlinks skipped (no cycles, no
 * SMB reparse surprises), directories named in `excludes.dirNames` pruned from
 * descent, files matching `excludes.fileGlobs` dropped. Hash: SHA-256 hex of
 * the full contents (design A3).
 *
 * @param {string} root
 * @param {ExcludeConfig} [excludes] defaults to an empty config (dest walks)
 * @returns {Promise<MirrorEntry[]>}
 */
export async function walkTree(root, excludes = { dirNames: [], fileGlobs: [] }) {
  /** @type {MirrorEntry[]} */
  const entries = [];

  /**
   * @param {string} dir absolute directory currently walked
   * @param {string} prefix forward-slash relPath prefix ('' at the root)
   */
  async function walk(dir, prefix) {
    const items = await readdir(dir, { withFileTypes: true });
    items.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const item of items) {
      if (item.isSymbolicLink()) continue;
      const relPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) {
        if (excludes.dirNames.includes(item.name)) continue;
        await walk(join(dir, item.name), relPath);
      } else if (item.isFile()) {
        if (matchesExclude(relPath, excludes)) continue;
        const contents = await readFile(join(dir, item.name));
        entries.push({
          relPath,
          size: contents.byteLength,
          hash: createHash('sha256').update(contents).digest('hex'),
        });
      }
    }
  }

  await walk(root, '');
  return entries;
}

/**
 * Adapter: apply a mirror plan to the destination — COPY-FIRST (design A4: a
 * mid-run failure must leave the destination a working superset, never a
 * broken subset), then delete deepest-first and prune directories emptied by
 * the deletions. Fails fast: the first file error throws with relPath
 * context; convergence on re-run is the recovery story (no journal needed).
 *
 * @param {string} root source checkout root
 * @param {string} dest destination root (created on demand)
 * @param {MirrorPlan} plan
 * @returns {Promise<void>}
 */
export async function executeMirrorPlan(root, dest, plan) {
  for (const relPath of plan.copy) {
    const destAbs = join(dest, relPath);
    try {
      await mkdir(dirname(destAbs), { recursive: true });
      await copyFile(join(root, relPath), destAbs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`sync-sdk: failed to copy '${relPath}': ${message}`, { cause: err });
    }
  }

  const deletions = [...plan.delete].sort(
    (a, b) => b.split('/').length - a.split('/').length,
  );
  for (const relPath of deletions) {
    try {
      await rm(join(dest, relPath));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`sync-sdk: failed to delete '${relPath}': ${message}`, { cause: err });
    }
  }

  for (const relPath of deletions) {
    let dir = dirname(relPath);
    while (dir !== '.' && dir !== '/') {
      try {
        await rmdir(join(dest, dir));
      } catch {
        break; // not empty (or already gone): nothing more to prune up this chain
      }
      dir = dirname(dir);
    }
  }
}
