// @vitest-environment node
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * CLI composition-root tests (U3): drive the REAL engine as a subprocess —
 * `node scripts/sync-sdk.mjs` — exactly as the wrappers do. The destination is
 * redirected to a temp tree via the SDK_DEST_DIR seam and the source to a
 * synthetic checkout via the SDK_SOURCE_DIR test seam (deviation: seam added
 * for testability; the default source remains resolveRepoRoot(import.meta.url)).
 * cwd is set OUTSIDE the repo on purpose: root resolution must never depend on
 * the working directory (spec R4).
 */

const execFileAsync = promisify(execFile);
const CLI_PATH = fileURLToPath(new URL('../sync-sdk.mjs', import.meta.url));

const cleanupRoots: string[] = [];

async function tempBase(prefix: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), `sync-cli-${prefix}-`));
  cleanupRoots.push(base);
  return base;
}

async function makeTree(root: string, files: Record<string, string>): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, relPath)), { recursive: true });
    await writeFile(join(root, relPath), content);
  }
}

interface CliRunOptions {
  source: string;
  dest: string;
  args?: string[];
  cwd?: string;
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(options: CliRunOptions): Promise<CliResult> {
  const env = { ...process.env, SDK_SOURCE_DIR: options.source, SDK_DEST_DIR: options.dest };
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_PATH, ...(options.args ?? [])], {
      env,
      cwd: options.cwd,
      maxBuffer: 8 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const failure = err as { code?: unknown; stdout?: string; stderr?: string; message?: string };
    if (typeof failure.code !== 'number') {
      throw new Error(`sync-cli.test: subprocess failed to run: ${failure.message ?? String(err)}`);
    }
    return { code: failure.code, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

afterAll(async () => {
  await Promise.all(cleanupRoots.map((root) => rm(root, { recursive: true, force: true })));
});

/** Synthetic source with the pre-flight exe present (healthy checkout). */
const HEALTHY_SOURCE_FILES: Record<string, string> = {
  'sigla-cli/SIGLA.PdfCli.exe': 'fake exe bytes',
  'sigla-cli/Negocio.dll': 'fake dll',
  'package.json': '{"name":"sdk-sync-fixture"}',
  'src/app/page.tsx': 'export default function Page() { return null }',
  'informes/informe final.pdf': 'pdf with spaces in path',
};

describe('sync-sdk CLI composition root', () => {
  it('aborts with exit 2, an explanatory stderr and an UNTOUCHED destination when the source lacks sigla-cli/SIGLA.PdfCli.exe (R3S1, A7)', async () => {
    const base = await tempBase('preflight');
    const source = join(base, 'src');
    const dest = join(base, 'dest');
    await makeTree(source, { 'src/app/page.tsx': 'no exe here' });
    await makeTree(dest, { 'mantener.txt': 'sentinel that must survive' });

    const result = await runCli({ source, dest, cwd: base });

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('sigla-cli');
    expect(result.stderr).toMatch(/missing or incomplete/i);
    await expect(readFile(join(dest, 'mantener.txt'), 'utf8')).resolves.toBe('sentinel that must survive');
    // Nothing was copied and nothing was deleted: the destination is untouched.
    expect(await readdir(dest)).toEqual(['mantener.txt']);
  });

  it('runs a healthy source to completion: exit 0, destination mirrors source, ghost deleted with announce, dest-resident .env.local survives (R3S2, R6, A7)', async () => {
    const base = await tempBase('healthy');
    const source = join(base, 'src');
    const dest = join(base, 'dest');
    await makeTree(source, HEALTHY_SOURCE_FILES);
    await makeTree(dest, {
      'src/old/legacy.ts': 'ghost absent from source',
      '.env.local': 'DB_SECRET=keep-me',
    });

    const result = await runCli({ source, dest, cwd: base });

    expect(result.code).toBe(0);
    // Ghost-cleanup announce (R6): the deletion is printed before it happens.
    expect(result.stdout).toContain('src/old/legacy.ts');
    // Final summary exists.
    expect(result.stdout).toMatch(/complete/i);
    // Destination now mirrors the source.
    for (const [relPath, content] of Object.entries(HEALTHY_SOURCE_FILES)) {
      await expect(readFile(join(dest, relPath), 'utf8')).resolves.toBe(content);
    }
    // The ghost is gone...
    await expect(readFile(join(dest, 'src/old/legacy.ts'), 'utf8')).rejects.toThrow();
    // ...but the destination-resident protected env file survives (R2S2).
    await expect(readFile(join(dest, '.env.local'), 'utf8')).resolves.toBe('DB_SECRET=keep-me');
  });

  it('with --dry-run prints the full plan including the deletion announce and mutates NOTHING at the destination (A5, R8)', async () => {
    const base = await tempBase('dryrun');
    const source = join(base, 'src');
    const dest = join(base, 'dest');
    await makeTree(source, HEALTHY_SOURCE_FILES);
    await makeTree(dest, { 'ghost.txt': 'to be announced, not deleted' });

    const result = await runCli({ source, dest, args: ['--dry-run'], cwd: base });

    expect(result.code).toBe(0);
    // Full plan listing: copies AND deletions are announced.
    expect(result.stdout).toContain('src/app/page.tsx');
    expect(result.stdout).toContain('sigla-cli/SIGLA.PdfCli.exe');
    expect(result.stdout).toContain('informes/informe final.pdf');
    expect(result.stdout).toContain('ghost.txt');
    expect(result.stdout).toMatch(/dry-run/i);
    // The destination is byte-identical: the ghost survives, nothing was copied.
    await expect(readFile(join(dest, 'ghost.txt'), 'utf8')).resolves.toBe('to be announced, not deleted');
    expect(await readdir(dest)).toEqual(['ghost.txt']);
  });

  it('exits 1 with relPath context when a file operation fails at the destination (A7)', async () => {
    const base = await tempBase('failop');
    const source = join(base, 'src');
    const dest = join(base, 'dest');
    await makeTree(source, { 'a.txt': 'writable-source file', 'sigla-cli/SIGLA.PdfCli.exe': 'fake exe bytes' });
    await mkdir(dest);
    await chmod(dest, 0o555); // read-only destination: every copy must fail

    try {
      const result = await runCli({ source, dest, cwd: base });
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/failed to copy 'a\.txt'/);
    } finally {
      await chmod(dest, 0o755); // restore so afterAll cleanup can remove it
    }
  });
});
