// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  computeMirrorPlan,
  EXCLUDED_DIR_NAMES,
  EXCLUDED_FILE_GLOBS,
  executeMirrorPlan,
  PROTECTED_PATHS,
  walkTree,
} from '../sync-sdk.mjs';

// ─── Spec authority (sdk-mirror-sync) ────────────────────────────────────────

const specExcludes = (): { dirNames: string[]; fileGlobs: string[] } => ({
  dirNames: [...EXCLUDED_DIR_NAMES],
  fileGlobs: [...EXCLUDED_FILE_GLOBS],
});

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

// ─── Real fs fixtures (fs.mkdtemp trees, zero mocks) ─────────────────────────

const cleanupRoots: string[] = [];

async function tempBase(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'sync-executor-'));
  cleanupRoots.push(base);
  return base;
}

afterAll(async () => {
  await Promise.all(cleanupRoots.map((root) => rm(root, { recursive: true, force: true })));
});

/** Write a { relPath → content } map as a real file tree under root. */
async function makeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, relPath)), { recursive: true });
    await writeFile(join(root, relPath), content);
  }
}

/** Full mirror pipeline against real trees: walk source + dest → plan → execute. */
async function mirror(srcRoot: string, destRoot: string): Promise<void> {
  const [sourceEntries, destEntries] = await Promise.all([
    walkTree(srcRoot, specExcludes()),
    walkTree(destRoot),
  ]);
  const plan = computeMirrorPlan(sourceEntries, destEntries, specExcludes(), PROTECTED_PATHS);
  await executeMirrorPlan(srcRoot, destRoot, plan);
}

/** Assert the destination file set and contents exactly mirror the source. */
async function expectMirrors(srcRoot: string, destRoot: string): Promise<void> {
  const [source, mirrored] = await Promise.all([
    walkTree(srcRoot, specExcludes()),
    walkTree(destRoot),
  ]);
  expect(mirrored.map((entry) => entry.relPath)).toEqual(source.map((entry) => entry.relPath));
  for (const entry of source) {
    expect(await readFile(join(destRoot, entry.relPath), 'utf8')).toBe(
      await readFile(join(srcRoot, entry.relPath), 'utf8'),
    );
  }
}

// ─── walkTree ────────────────────────────────────────────────────────────────

describe('walkTree', () => {
  it('inventories a real tree: lexicographic DFS order, byte sizes, sha256 hex hashes, dotfiles in, excluded dirs pruned', async () => {
    const src = join(await tempBase(), 'src');
    await makeTree(src, {
      'src/app/page.tsx': 'page',
      'README.md': 'readme',
      '.gitignore': 'ign',
      'node_modules/pkg/index.js': 'dep',
      '.codegraph/index.json': '{}',
      'sigla-cli/SIGLA.PdfCli.exe': 'exe-bytes',
      'informes/informe final.pdf': 'pdf',
    });

    const entries = await walkTree(src, specExcludes());

    expect(entries.map((entry) => entry.relPath)).toEqual([
      '.gitignore',
      'README.md',
      'informes/informe final.pdf',
      'sigla-cli/SIGLA.PdfCli.exe',
      'src/app/page.tsx',
    ]);
    expect(entries.find((entry) => entry.relPath === '.gitignore')).toEqual({
      relPath: '.gitignore',
      size: 3,
      hash: sha256('ign'),
    });
    expect(entries.find((entry) => entry.relPath === 'sigla-cli/SIGLA.PdfCli.exe')).toEqual({
      relPath: 'sigla-cli/SIGLA.PdfCli.exe',
      size: 9,
      hash: sha256('exe-bytes'),
    });
  });

  it('skips symlinks instead of following them', async () => {
    const src = join(await tempBase(), 'src');
    await makeTree(src, { 'real.txt': 'content' });
    await symlink(join(src, 'real.txt'), join(src, 'link.txt'));

    const entries = await walkTree(src, specExcludes());

    expect(entries.map((entry) => entry.relPath)).toEqual(['real.txt']);
  });
});

// ─── executeMirrorPlan (mirror pipeline on real trees) ───────────────────────

describe('executeMirrorPlan', () => {
  it('R2S1: sigla-cli survives every run — changed exe updated, dest-only dll kept', async () => {
    const base = await tempBase();
    const src = join(base, 'src');
    const dest = join(base, 'dest');
    await makeTree(src, {
      'sigla-cli/SIGLA.PdfCli.exe': 'exe-v2',
      'sigla-cli/rpt/reporte.rpt': 'template',
    });
    await makeTree(dest, { 'sigla-cli/SIGLA.PdfCli.exe': 'exe-v1', 'sigla-cli/old.dll': 'ancient' });

    await mirror(src, dest);

    expect(await readFile(join(dest, 'sigla-cli/SIGLA.PdfCli.exe'), 'utf8')).toBe('exe-v2');
    expect(await readFile(join(dest, 'sigla-cli/old.dll'), 'utf8')).toBe('ancient');
  });

  it('R2S2: dest-resident .env.local is byte-identical after the run', async () => {
    const base = await tempBase();
    const src = join(base, 'src');
    const dest = join(base, 'dest');
    const envContent = 'HOLOMEDIC_DB_USER=explorar_datos\nDB_PASS=secret';
    await makeTree(src, { 'src/app/page.tsx': 'page' });
    await makeTree(dest, { '.env.local': envContent, 'src/app/page.tsx': 'page' });

    await mirror(src, dest);

    expect(await readFile(join(dest, '.env.local'), 'utf8')).toBe(envContent);
  });

  it('R1S2: ghost files deleted deepest-first and emptied directories pruned', async () => {
    const base = await tempBase();
    const src = join(base, 'src');
    const dest = join(base, 'dest');
    await makeTree(src, { 'src/app/page.tsx': 'page', 'keep.txt': 'keep' });
    await makeTree(dest, {
      'src/components/email/SignatureEditor.tsx': 'ghost',
      'a/b/c/deep.txt': 'ghost',
      'src/app/page.tsx': 'page',
      'keep.txt': 'keep',
    });

    await mirror(src, dest);

    expect(existsSync(join(dest, 'src/components/email/SignatureEditor.tsx'))).toBe(false);
    expect(existsSync(join(dest, 'src/components'))).toBe(false);
    expect(existsSync(join(dest, 'a/b/c/deep.txt'))).toBe(false);
    expect(existsSync(join(dest, 'a'))).toBe(false);
    expect(await readFile(join(dest, 'keep.txt'), 'utf8')).toBe('keep');
    expect(await readFile(join(dest, 'src/app/page.tsx'), 'utf8')).toBe('page');
  });

  it('R1S3: changed file overwritten — same size, different bytes (hash comparison path)', async () => {
    const base = await tempBase();
    const src = join(base, 'src');
    const dest = join(base, 'dest');
    await makeTree(src, { 'package.json': '{"a":2}' });
    await makeTree(dest, { 'package.json': '{"a":1}' });

    await mirror(src, dest);

    expect(await readFile(join(dest, 'package.json'), 'utf8')).toBe('{"a":2}');
  });

  it('R1S5: paths with spaces are copied and deleted without path-splitting errors', async () => {
    const base = await tempBase();
    const src = join(base, 'src');
    const dest = join(base, 'dest');
    await makeTree(src, { 'informes/informe final.pdf': 'pdf-final' });
    await makeTree(dest, { 'informes/informe viejo.pdf': 'pdf-old' });

    await mirror(src, dest);

    expect(await readFile(join(dest, 'informes/informe final.pdf'), 'utf8')).toBe('pdf-final');
    expect(existsSync(join(dest, 'informes/informe viejo.pdf'))).toBe(false);
  });

  it('R1S4: missing destination → full copy and the executor resolves normally', async () => {
    const base = await tempBase();
    const src = join(base, 'src');
    const dest = join(base, 'dest'); // deliberately never created
    await makeTree(src, { 'package.json': '{}', 'src/app/page.tsx': 'page' });

    const sourceEntries = await walkTree(src, specExcludes());
    const plan = computeMirrorPlan(sourceEntries, [], specExcludes(), PROTECTED_PATHS);
    expect(plan.copy).toEqual(['package.json', 'src/app/page.tsx']);

    await expect(executeMirrorPlan(src, dest, plan)).resolves.toBeUndefined();
    await expectMirrors(src, dest);
  });

  it('A4: copies complete before any deletion runs', async () => {
    const base = await tempBase();
    const src = join(base, 'src');
    const dest = join(base, 'dest');
    await makeTree(src, { 'fresh.txt': 'new' });
    await makeTree(dest, { 'placeholder.txt': 'old' });
    // A path in BOTH sets is unreachable from computeMirrorPlan but is a legal
    // plan input — the observable ordering probe: copy-first lands fresh.txt and
    // the subsequent delete removes it, so it must end ABSENT. A delete-first
    // executor would leave the fresh copy in place (present).
    const plan = { copy: ['fresh.txt'], delete: ['placeholder.txt', 'fresh.txt'] };

    await executeMirrorPlan(src, dest, plan);

    expect(existsSync(join(dest, 'fresh.txt'))).toBe(false);
    expect(existsSync(join(dest, 'placeholder.txt'))).toBe(false);
  });

  it('fail-fast: copy error throws with relPath context, leaving partial state; re-run converges idempotently', async () => {
    const base = await tempBase();
    const src = join(base, 'src');
    const dest = join(base, 'dest');
    await makeTree(src, { 'a-done/first.txt': 'one', 'z-locked/second.txt': 'two' });
    await mkdir(join(dest, 'a-done'), { recursive: true });
    await mkdir(join(dest, 'z-locked'), { recursive: true });
    await chmod(join(dest, 'z-locked'), 0o555); // unwritable for uid != 0

    const sourceEntries = await walkTree(src, specExcludes());
    const plan = computeMirrorPlan(sourceEntries, [], specExcludes(), PROTECTED_PATHS);

    await expect(executeMirrorPlan(src, dest, plan)).rejects.toThrow(/z-locked\/second\.txt/);

    // Partial-run state: earlier copy landed, locked copy did not (copy-first).
    expect(await readFile(join(dest, 'a-done/first.txt'), 'utf8')).toBe('one');
    expect(existsSync(join(dest, 'z-locked/second.txt'))).toBe(false);

    // Convergence: re-running the SAME plan repairs the partial state.
    await chmod(join(dest, 'z-locked'), 0o755);
    await executeMirrorPlan(src, dest, plan);
    await expectMirrors(src, dest);

    // Idempotency: a freshly computed plan is now empty and executes as a no-op.
    const [srcEntries, destEntries] = await Promise.all([
      walkTree(src, specExcludes()),
      walkTree(dest),
    ]);
    const settled = computeMirrorPlan(srcEntries, destEntries, specExcludes(), PROTECTED_PATHS);
    expect(settled).toEqual({ copy: [], delete: [] });
    await executeMirrorPlan(src, dest, settled);
    await expectMirrors(src, dest);
  });
});
