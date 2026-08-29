/**
 * SDK true-mirror sync engine — pure plan core.
 *
 * U1 slice (SDD change "en un worktree trabaja eso"): this file currently
 * contains ONLY the side-effect-free domain core — exclude/protected matching,
 * mirror-plan computation, and repo-root resolution. Zero fs imports: every
 * function is testable with in-memory entries
 * (see scripts/__tests__/sync-sdk.test.ts).
 *
 * The executor adapters (walkTree / executeMirrorPlan) and the CLI composition
 * root land in later slices (U2/U3) and will be appended below this section.
 *
 * Spec "Exclude List Authority": the engine walks the filesystem, never git;
 * the exclude lists below are the single authority. Excludes filter the SOURCE
 * walk only — only PROTECTED_PATHS shields destination entries from deletion.
 */

import { dirname } from 'node:path';
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
