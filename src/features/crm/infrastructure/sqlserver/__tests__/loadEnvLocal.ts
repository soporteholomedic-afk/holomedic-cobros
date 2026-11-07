import fs from 'node:fs';
import path from 'node:path';

/**
 * Test-only helper: loads `KEY=VALUE` pairs from the repo-root
 * `.env.local` into `process.env` WITHOUT overwriting variables that
 * are already set (CLI/exported values win).
 *
 * Vitest does not load `.env.local` (only the Next.js runtime does),
 * and the DB integration suites (`migrate.test.ts`,
 * `withCrmTransaction.test.ts`) need the `HOLOMEDIC_DB_*` credentials
 * to reach the local SQL Server through `getHolomedicPool()`. Values
 * are never logged — this helper only populates the environment.
 */
export function loadEnvLocal(fileName = '.env.local'): void {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
