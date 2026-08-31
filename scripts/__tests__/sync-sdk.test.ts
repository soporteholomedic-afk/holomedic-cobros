// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  computeMirrorPlan,
  EXCLUDED_DIR_NAMES,
  EXCLUDED_FILE_GLOBS,
  isProtected,
  matchesExclude,
  PROTECTED_PATHS,
  resolveRepoRoot,
  type MirrorEntry,
} from '../sync-sdk.mjs';

// ─── Spec authority (sdk-mirror-sync "Exclude List Authority") ───────────────

const SPEC_EXCLUDED_DIR_NAMES = [
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
] as const;

const SPEC_EXCLUDED_FILE_GLOBS = [
  '*.zip',
  'tsconfig.tsbuildinfo',
  '*.xlsx',
  '.env',
  '.env.*',
  '.pr-*.md',
] as const;

const SPEC_PROTECTED_PATHS = ['sigla-cli', '.env.local'] as const;

/** Fresh spec-faithful exclude config for plan inputs. */
const specExcludes = (): { dirNames: string[]; fileGlobs: string[] } => ({
  dirNames: [...SPEC_EXCLUDED_DIR_NAMES],
  fileGlobs: [...SPEC_EXCLUDED_FILE_GLOBS],
});

// ─── In-memory fixtures (zero fs, zero mocks) ────────────────────────────────

interface EntryOptions {
  size?: number;
  hash?: string;
}

const entry = (relPath: string, options: EntryOptions = {}): MirrorEntry => ({
  relPath,
  size: options.size ?? 10,
  hash: options.hash ?? `hash:${relPath}`,
});

// ─── Constants pinned to the spec enumeration ────────────────────────────────

describe('spec authority constants', () => {
  it('EXCLUDED_DIR_NAMES equals the spec directory enumeration', () => {
    expect([...EXCLUDED_DIR_NAMES].sort()).toEqual([...SPEC_EXCLUDED_DIR_NAMES].sort());
  });

  it('EXCLUDED_FILE_GLOBS equals the spec file-glob enumeration', () => {
    expect([...EXCLUDED_FILE_GLOBS].sort()).toEqual([...SPEC_EXCLUDED_FILE_GLOBS].sort());
  });

  it('PROTECTED_PATHS equals the spec protected enumeration', () => {
    expect([...PROTECTED_PATHS]).toEqual([...SPEC_PROTECTED_PATHS]);
  });
});

// ─── Copy set ────────────────────────────────────────────────────────────────

describe('computeMirrorPlan — copy set', () => {
  it('copies new files absent at the destination (R1S1)', () => {
    const plan = computeMirrorPlan(
      [entry('src/app/page.tsx', { size: 1, hash: 'a' }), entry('src/new.ts', { size: 2, hash: 'b' })],
      [entry('src/app/page.tsx', { size: 1, hash: 'a' })],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.copy).toEqual(['src/new.ts']);
    expect(plan.delete).toEqual([]);
  });

  it('copies files whose size differs even when the hash field is stale (A3: size short-circuit)', () => {
    const plan = computeMirrorPlan(
      [entry('package.json', { size: 20, hash: 'same-hash' })],
      [entry('package.json', { size: 18, hash: 'same-hash' })],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.copy).toEqual(['package.json']);
  });

  it('copies same-size files whose SHA-256 differs (A3: equal-length edits)', () => {
    const plan = computeMirrorPlan(
      [entry('package.json', { size: 20, hash: 'new-content' })],
      [entry('package.json', { size: 20, hash: 'old-content' })],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.copy).toEqual(['package.json']);
  });

  it('leaves identical files out of the copy set while still copying the changed sibling', () => {
    const plan = computeMirrorPlan(
      [entry('src/unchanged.ts'), entry('src/changed.ts', { hash: 'v2' })],
      [entry('src/unchanged.ts'), entry('src/changed.ts', { hash: 'v1' })],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.copy).toEqual(['src/changed.ts']);
    expect(plan.delete).toEqual([]);
  });

  it('plans a full copy with space-bearing paths when the destination is missing (R1S4, R1S5)', () => {
    const plan = computeMirrorPlan(
      [entry('package.json'), entry('informes/informe final.pdf'), entry('sigla-cli/SIGLA.PdfCli.exe')],
      [],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.copy).toEqual(['package.json', 'informes/informe final.pdf', 'sigla-cli/SIGLA.PdfCli.exe']);
    expect(plan.delete).toEqual([]);
  });

  it('copies sigla-cli and skips .codegraph regardless of gitignore status (R5S1)', () => {
    const plan = computeMirrorPlan(
      [entry('sigla-cli/SIGLA.PdfCli.exe'), entry('sigla-cli/rpt/Factura.rpt'), entry('.codegraph/index.sqlite')],
      [],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.copy).toEqual(['sigla-cli/SIGLA.PdfCli.exe', 'sigla-cli/rpt/Factura.rpt']);
    expect(plan.copy).not.toContain('.codegraph/index.sqlite');
  });

  it('never copies env files or PR notes, using the exported default excludes (R9S1)', () => {
    const plan = computeMirrorPlan(
      [entry('.env'), entry('.env.local'), entry('.env.production'), entry('.pr-1-body.md'), entry('src/app/page.tsx')],
      [],
      { dirNames: [...EXCLUDED_DIR_NAMES], fileGlobs: [...EXCLUDED_FILE_GLOBS] },
      [...PROTECTED_PATHS],
    );
    expect(plan.copy).toEqual(['src/app/page.tsx']);
  });
});

// ─── Delete set ──────────────────────────────────────────────────────────────

describe('computeMirrorPlan — delete set', () => {
  it('marks destination ghosts for deletion while keeping in-sync files (R1S2)', () => {
    const plan = computeMirrorPlan(
      [entry('src/valoracionesExcelReport.ts')],
      [
        entry('src/valoracionesExcelReport.ts'),
        entry('src/components/email/SignatureEditor.tsx'),
        entry('src/lib/formato35.ts'),
      ],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.delete).toEqual(['src/components/email/SignatureEditor.tsx', 'src/lib/formato35.ts']);
    expect(plan.copy).toEqual([]);
  });

  it('never puts protected paths in the delete set (R1S6, R2)', () => {
    const plan = computeMirrorPlan(
      [entry('src/kept.ts')],
      [entry('sigla-cli/SIGLA.PdfCli.exe'), entry('.env.local'), entry('src/ghost.ts')],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.delete).toEqual(['src/ghost.ts']);
  });

  it('still updates a protected path when the source changed it (protection blocks deletion only)', () => {
    const plan = computeMirrorPlan(
      [entry('sigla-cli/Negocio.dll', { hash: 'v2' })],
      [entry('sigla-cli/Negocio.dll', { hash: 'v1' })],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.copy).toEqual(['sigla-cli/Negocio.dll']);
    expect(plan.delete).toEqual([]);
  });

  it('deletes destination entries under excluded dirs instead of shielding them (R5S2)', () => {
    const plan = computeMirrorPlan(
      [entry('src/app/page.tsx', { hash: 'v2' }), entry('temp/cache/deep.txt')],
      [entry('src/app/page.tsx', { hash: 'v1' }), entry('temp/cache/deep.txt'), entry('temp/log.txt')],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.copy).toEqual(['src/app/page.tsx']);
    expect(plan.delete).toEqual(['temp/cache/deep.txt', 'temp/log.txt']);
  });

  it('announces deletion of every leaked artifact class from the first live run (ghost cleanup)', () => {
    const plan = computeMirrorPlan(
      [],
      [
        entry('.codegraph/index.sqlite'),
        entry('temp/cache.txt'),
        entry('docs/runbook.md'),
        entry('openspec/old.md'),
        entry('.gga'),
        entry('.pr-1-body.md'),
      ],
      specExcludes(),
      [...SPEC_PROTECTED_PATHS],
    );
    expect(plan.delete).toEqual([
      '.codegraph/index.sqlite',
      'temp/cache.txt',
      'docs/runbook.md',
      'openspec/old.md',
      '.gga',
      '.pr-1-body.md',
    ]);
  });
});

// ─── Exclude matching ────────────────────────────────────────────────────────

describe('matchesExclude', () => {
  const excludes = specExcludes();

  it('excludes by exact directory segment anywhere in the path', () => {
    expect(matchesExclude('node_modules/react/index.js', excludes)).toBe(true);
    expect(matchesExclude('src/.next/cache/1.js', excludes)).toBe(true);
    expect(matchesExclude('docs/readme.md', excludes)).toBe(true);
  });

  it('does not treat directory names as substrings', () => {
    expect(matchesExclude('src/mynode_modules/lib.js', excludes)).toBe(false);
    expect(matchesExclude('node_modules.bak/x.js', excludes)).toBe(false);
    expect(matchesExclude('template/src/app.tsx', excludes)).toBe(false);
  });

  it('excludes root-level files whose single segment matches a dir name (.gga case)', () => {
    expect(matchesExclude('.gga', excludes)).toBe(true);
    expect(matchesExclude('temp', excludes)).toBe(true);
  });

  it('matches file globs on the basename only', () => {
    expect(matchesExclude('informes/final.zip', excludes)).toBe(true);
    expect(matchesExclude('packages/app/tsconfig.tsbuildinfo', excludes)).toBe(true);
    expect(matchesExclude('reportes/valoraciones.xlsx', excludes)).toBe(true);
  });

  it('applies wildcard semantics exactly (.env vs .env.* edges)', () => {
    expect(matchesExclude('.env', excludes)).toBe(true);
    expect(matchesExclude('.env.local', excludes)).toBe(true);
    expect(matchesExclude('.env.production', excludes)).toBe(true);
    expect(matchesExclude('.envelope', excludes)).toBe(false);
    expect(matchesExclude('env.local', excludes)).toBe(false);
    expect(matchesExclude('pr-2.md', excludes)).toBe(false);
    expect(matchesExclude('.pr-1-body.md', excludes)).toBe(true);
  });

  it('leaves normal source files alone', () => {
    expect(matchesExclude('src/app/page.tsx', excludes)).toBe(false);
    expect(matchesExclude('package.json', excludes)).toBe(false);
  });
});

// ─── Protected matching ──────────────────────────────────────────────────────

describe('isProtected', () => {
  const protectedPaths = [...PROTECTED_PATHS];

  it('matches exact paths', () => {
    expect(isProtected('sigla-cli', protectedPaths)).toBe(true);
    expect(isProtected('.env.local', protectedPaths)).toBe(true);
  });

  it('matches paths living under a protected root', () => {
    expect(isProtected('sigla-cli/SIGLA.PdfCli.exe', protectedPaths)).toBe(true);
    expect(isProtected('sigla-cli/rpt/Factura.rpt', protectedPaths)).toBe(true);
  });

  it('does not extend protection past the path boundary', () => {
    expect(isProtected('sigla-cli2/other.txt', protectedPaths)).toBe(false);
    expect(isProtected('sigla-cli.exe', protectedPaths)).toBe(false);
    expect(isProtected('.env.local.bak', protectedPaths)).toBe(false);
  });

  it('leaves ordinary destination files unprotected', () => {
    expect(isProtected('src/ghost.ts', protectedPaths)).toBe(false);
  });
});

// ─── Repo-root resolution ────────────────────────────────────────────────────

describe('resolveRepoRoot', () => {
  it('resolves the repo root from a synthetic worktree script URL (R4S1)', () => {
    const url = 'file:///home/sysadmin/DEV/holomedic-cobros-worktrees/sdk-sync-mirror/scripts/sync-sdk.mjs';
    expect(resolveRepoRoot(url)).toBe('/home/sysadmin/DEV/holomedic-cobros-worktrees/sdk-sync-mirror');
  });

  it('resolves the repo root from the main checkout script URL (R4S2)', () => {
    const url = 'file:///home/sysadmin/DEV/holomedic-cobros/scripts/sync-sdk.mjs';
    expect(resolveRepoRoot(url)).toBe('/home/sysadmin/DEV/holomedic-cobros');
  });
});

// ─── Wrapper content invariants (U4 — R4, R8) ────────────────────────────────
// The wrappers MUST be thin delegates: the Node engine owns walking, planning
// and the mirror; wrappers only forward argv and propagate exit codes. These
// invariants pin the exact regressions being removed: the sh tar-pipe with its
// hardcoded /home/sysadmin root, and the ps1 robocopy with its unconditional
// [OK] (exit-code honesty, R8).

describe('sync-sdk.sh content invariants', () => {
  const script = readFileSync(fileURLToPath(new URL('../../sync-sdk.sh', import.meta.url)), 'utf8');

  it('contains no hardcoded machine-specific path (R4)', () => {
    expect(script).not.toContain('/home/sysadmin');
  });

  it('contains no hardcoded cd into a literal path (R4)', () => {
    expect(script).not.toMatch(/cd\s+["']?\//);
  });

  it('delegates via BASH_SOURCE dirname and exec of the engine, forwarding argv', () => {
    expect(script).toContain('BASH_SOURCE');
    expect(script).toContain('exec node "$SCRIPT_DIR/scripts/sync-sdk.mjs" "$@"');
  });

  it('no longer ships the tar-pipe copy (mirror bug root cause removed)', () => {
    expect(script).not.toMatch(/\btar\b/);
  });

  it('keeps the mount-existence check (U4 task constraint)', () => {
    expect(script).toContain('/mnt/instaladores');
    expect(script).toContain('[ ! -d');
  });
});

describe('sync-sdk.ps1 content invariants', () => {
  const script = readFileSync(fileURLToPath(new URL('../../sync-sdk.ps1', import.meta.url)), 'utf8');

  it('delegates via $PSScriptRoot to the engine, forwarding argv (R4)', () => {
    expect(script).toContain('$PSScriptRoot');
    expect(script).toContain('sync-sdk.mjs');
    expect(script).toContain('@args');
  });

  it('gates [OK] on the engine exit code and ends with exit $LASTEXITCODE (R8)', () => {
    expect(script).toContain('if ($LASTEXITCODE -eq 0)');
    expect(script.trimEnd().endsWith('exit $LASTEXITCODE')).toBe(true);
  });

  it('no longer ships its own robocopy mirror (defect removed)', () => {
    expect(script).not.toContain('robocopy');
    expect(script).not.toContain('C:\\dev\\holomedic_cobros');
  });
});

// ─── Installer bat content invariants (U5 — R7, R9S2) ────────────────────────
// instalar.bat MUST be a self-healing robocopy /MIR that preserves
// runtime-writable paths (node_modules/.next are regenerated by iniciar.bat;
// .env* never travels the network) and translates robocopy's exit-code
// semantics honestly (0-7 = success, >=8 = failure). The iniciar bats MUST
// point the operator to the documented manual-copy procedure instead of the
// share: .env.local is never synced by design, so it cannot be "copied from
// the network" anymore.

describe('instalar.bat content invariants', () => {
  const script = readFileSync(fileURLToPath(new URL('../../instalar.bat', import.meta.url)), 'utf8');

  it('mirrors with robocopy /MIR, excluding runtime-writable and env paths (R7S1/S2)', () => {
    expect(script).toContain(
      'robocopy "%ORIGEN%" "%DESTINO%" /MIR /XD node_modules .next /XF .env* /R:2 /W:2',
    );
  });

  it('treats robocopy 0-7 as success and only >=8 as failure (R8S2 exit semantics)', () => {
    expect(script).toMatch(/%ERRORLEVEL%\s+GEQ\s+8/);
    expect(script).not.toMatch(/%ERRORLEVEL%\s+NEQ\s+0/);
  });

  it('keeps the ORIGEN existence guard and the call iniciar.bat chain', () => {
    expect(script).toContain('if not exist "%ORIGEN%');
    expect(script).toContain('call iniciar.bat');
  });

  it('no longer ships the one-shot xcopy copy (defect removed)', () => {
    expect(script).not.toMatch(/\bxcopy\b/i);
  });
});

describe('env hint honesty — iniciar.bat and iniciar_debug.bat (R9S2)', () => {
  for (const file of ['iniciar.bat', 'iniciar_debug.bat'] as const) {
    it(`${file} points to the documented manual-copy procedure, not the network share`, () => {
      const script = readFileSync(fileURLToPath(new URL(`../../${file}`, import.meta.url)), 'utf8');
      expect(script).not.toContain('Copialo desde la red');
      expect(script).toContain('copiarlo manualmente');
      expect(script).toContain('repositorio');
      expect(script).toContain('AGENTS.md');
    });
  }
});
