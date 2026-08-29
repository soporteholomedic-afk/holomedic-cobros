/**
 * Type surface for the pure mirror-plan core (scripts/sync-sdk.mjs).
 *
 * The `.mjs` engine intentionally stays outside the tsconfig type graph
 * (design A2); this paired declaration file is what TypeScript resolves for
 * `import ... from '../sync-sdk.mjs'` under `moduleResolution: bundler`,
 * giving the test file exact types without eslint-disables.
 */

/** A file inventory entry. relPath uses forward slashes; hash is a SHA-256 hex digest. */
export interface MirrorEntry {
  relPath: string;
  size: number;
  hash: string;
}

/** The mirror plan: source relPaths to copy, destination relPaths to remove. */
export interface MirrorPlan {
  copy: string[];
  delete: string[];
}

/** Exclusion config: exact dir-name segments plus basename file globs. */
export interface ExcludeConfig {
  dirNames: readonly string[];
  fileGlobs: readonly string[];
}

export declare const EXCLUDED_DIR_NAMES: readonly string[];
export declare const EXCLUDED_FILE_GLOBS: readonly string[];
export declare const PROTECTED_PATHS: readonly string[];

export declare function computeMirrorPlan(
  sourceEntries: readonly MirrorEntry[],
  destEntries: readonly MirrorEntry[],
  excludes: ExcludeConfig,
  protectedPaths: readonly string[],
): MirrorPlan;

export declare function matchesExclude(relPath: string, excludes: ExcludeConfig): boolean;

export declare function isProtected(relPath: string, protectedPaths: readonly string[]): boolean;

export declare function resolveRepoRoot(importMetaUrl: string): string;

/**
 * Walk a real file tree into entries (forward-slash relPaths, SHA-256 hex
 * hashes). Dotfiles included, symlinks skipped, excluded dir segments pruned.
 */
export declare function walkTree(root: string, excludes?: ExcludeConfig): Promise<MirrorEntry[]>;

/** Apply the plan copy-first, then delete deepest-first and prune empty dirs. */
export declare function executeMirrorPlan(root: string, dest: string, plan: MirrorPlan): Promise<void>;
