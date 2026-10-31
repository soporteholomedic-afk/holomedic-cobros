import { describe, expect, it } from 'vitest';

import { migrate } from '../migrate';
import { ETAPAS } from '../../../domain/entities';

/**
 * Schema contract for `dbo.CrmEmpresa`. The fake pool captures the SQL so
 * the suite pins exactly what ships in `migrate.ts`; the real creation is
 * verified by running `migrate()` against HOLOMEDIC.
 */

function makePool(calls: string[]) {
  return {
    request: () => ({
      batch: async (sql: string): Promise<{ recordset: unknown[]; rowsAffected: number[] }> => {
        calls.push(sql);
        return { recordset: [], rowsAffected: [0] };
      },
    }),
  } as unknown as import('mssql').ConnectionPool;
}

async function sqlDeMigrate(): Promise<string> {
  const calls: string[] = [];
  await migrate(makePool(calls));
  expect(calls).toHaveLength(1);
  return calls[0] ?? '';
}

describe('sqlserver crm migrate()', () => {
  it('creates dbo.CrmEmpresa once, guarded by IF NOT EXISTS on sys.tables', async () => {
    const sql = await sqlDeMigrate();
    expect(sql.match(/CREATE\s+TABLE/gi)).toHaveLength(1);
    expect(sql).toMatch(/CREATE\s+TABLE\s+dbo\.CrmEmpresa\s*\(/i);
    expect(sql).toMatch(
      /IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.tables\s+WHERE\s+name\s*=\s*'CrmEmpresa'/i,
    );
  });

  it('never touches the old CRM_* namespace (production still recreates those tables)', async () => {
    const sql = await sqlDeMigrate();
    expect(sql).not.toMatch(/CRM_/i);
  });

  it('is purely additive: no DROP, DELETE, TRUNCATE or ALTER', async () => {
    const sql = await sqlDeMigrate();
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER)\b/i);
  });

  it('enforces a unique RUC of exactly 11 digits in the database', async () => {
    const sql = await sqlDeMigrate();
    expect(sql).toMatch(/ruc\s+VARCHAR\(11\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/UNIQUE\s*\(\s*ruc\s*\)/i);
    // CHAR(11) would silently pad a 10-digit RUC with a space; the CHECK
    // must reject anything that is not eleven digits.
    const check = sql.match(/CHECK\s*\(\s*ruc\s+LIKE\s+'([^']*)'\s*\)/i);
    expect(check, 'expected a CHECK (ruc LIKE ...) constraint').not.toBeNull();
    expect(check?.[1]).toBe('[0-9]'.repeat(11));
  });

  it('restricts etapa to exactly the four board columns', async () => {
    const sql = await sqlDeMigrate();
    const check = sql.match(/CHECK\s*\(\s*etapa\s+IN\s*\(([^)]*)\)\s*\)/i);
    expect(check, 'expected a CHECK (etapa IN (...)) constraint').not.toBeNull();
    const valores = [...(check?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(valores).toEqual([...ETAPAS]);
  });

  it('requires the empresa and contact fields the form marks as required', async () => {
    const sql = await sqlDeMigrate();
    for (const col of ['razonSocial', 'contactoNombre', 'contactoTelefono']) {
      expect(sql).toMatch(new RegExp(`${col}\\s+NVARCHAR\\(\\d+\\)\\s+NOT\\s+NULL`, 'i'));
    }
    for (const col of ['sector', 'contactoCorreo', 'notas']) {
      expect(sql).toMatch(new RegExp(`${col}\\s+NVARCHAR\\((\\d+|MAX)\\)\\s+NULL`, 'i'));
    }
  });
});
