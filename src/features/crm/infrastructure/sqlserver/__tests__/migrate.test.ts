import { describe, expect, it } from 'vitest';

import { migrate } from '../migrate';
import { ETAPAS, MEDIOS, MOTIVO_CATEGORIAS, SECTORES_INICIALES } from '../../../domain/entities';

/**
 * Schema contract for `dbo.CrmSector`, `dbo.CrmEmpresa` and `dbo.CrmContacto`.
 * The fake pool captures the SQL so the suite pins exactly what ships in
 * `migrate.ts`; the real creation is verified against HOLOMEDIC inside a
 * transaction that is rolled back.
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

/** The body of one `CREATE TABLE dbo.<name> ( ... );` statement. */
function tabla(sql: string, nombre: string): string {
  const inicio = sql.search(new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${nombre}\\s*\\(`, 'i'));
  expect(inicio, `expected CREATE TABLE dbo.${nombre}`).toBeGreaterThanOrEqual(0);
  const resto = sql.slice(inicio);
  const fin = resto.search(/\n\s*\)\s*;/);
  return resto.slice(0, fin);
}

function valoresCheck(cuerpo: string, columna: string): string[] {
  const m = cuerpo.match(new RegExp(`CHECK\\s*\\(\\s*${columna}\\s+IN\\s*\\(([^)]*)\\)`, 'i'));
  expect(m, `expected CHECK (${columna} IN (...))`).not.toBeNull();
  return [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1] ?? '');
}

describe('sqlserver crm migrate()', () => {
  it('creates the three tables, each guarded by IF NOT EXISTS on sys.tables', async () => {
    const sql = await sqlDeMigrate();
    expect(sql.match(/CREATE\s+TABLE/gi)).toHaveLength(3);
    for (const nombre of ['CrmSector', 'CrmEmpresa', 'CrmContacto']) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${nombre}\\s*\\(`, 'i'));
      expect(sql).toMatch(
        new RegExp(
          `IF\\s+NOT\\s+EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+sys\\.tables\\s+WHERE\\s+name\\s*=\\s*'${nombre}'`,
          'i',
        ),
      );
    }
  });

  it('never touches the old CRM_* namespace (production still recreates those tables)', async () => {
    const sql = await sqlDeMigrate();
    expect(sql).not.toMatch(/CRM_/i);
  });

  it('is purely additive: no DROP, DELETE, TRUNCATE or ALTER statement', async () => {
    // `ON DELETE CASCADE` is a constraint on the new table, not a delete.
    const sql = (await sqlDeMigrate()).replace(/ON\s+DELETE\s+CASCADE/gi, '');
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER)\b/i);
  });

  it('enforces a unique RUC of exactly 11 digits in the database', async () => {
    const empresa = tabla(await sqlDeMigrate(), 'CrmEmpresa');
    expect(empresa).toMatch(/ruc\s+VARCHAR\(11\)\s+NOT\s+NULL/i);
    expect(empresa).toMatch(/UNIQUE\s*\(\s*ruc\s*\)/i);
    // CHAR(11) would silently pad a 10-digit RUC with a space; the CHECK
    // must reject anything that is not eleven digits.
    const check = empresa.match(/CHECK\s*\(\s*ruc\s+LIKE\s+'([^']*)'\s*\)/i);
    expect(check, 'expected a CHECK (ruc LIKE ...) constraint').not.toBeNull();
    expect(check?.[1]).toBe('[0-9]'.repeat(11));
  });

  it('restricts etapa to exactly the five board columns', async () => {
    const empresa = tabla(await sqlDeMigrate(), 'CrmEmpresa');
    expect(valoresCheck(empresa, 'etapa')).toEqual([...ETAPAS]);
  });

  it('restricts medio and the loss reason category to the known values', async () => {
    const empresa = tabla(await sqlDeMigrate(), 'CrmEmpresa');
    expect(valoresCheck(empresa, 'medio')).toEqual([...MEDIOS]);
    expect(valoresCheck(empresa, 'motivoCategoria')).toEqual([...MOTIVO_CATEGORIAS]);
  });

  it('keeps the loss reason coherent with the stage inside the database', async () => {
    const empresa = tabla(await sqlDeMigrate(), 'CrmEmpresa');
    // Only "perdido" carries a reason, and it must carry one.
    expect(empresa).toMatch(
      /CHECK\s*\(\s*\(\s*etapa\s*=\s*'perdido'\s+AND\s+motivoCategoria\s+IS\s+NOT\s+NULL\s*\)\s+OR\s+\(\s*etapa\s*<>\s*'perdido'\s+AND\s+motivoCategoria\s+IS\s+NULL\s*\)\s*\)/i,
    );
    // "por_contactar" never has a medium.
    expect(empresa).toMatch(
      /CHECK\s*\(\s*etapa\s*<>\s*'por_contactar'\s+OR\s+medio\s+IS\s+NULL\s*\)/i,
    );
  });

  it('requires the empresa fields the form marks as required and allows the optional ones to be NULL', async () => {
    const empresa = tabla(await sqlDeMigrate(), 'CrmEmpresa');
    expect(empresa).toMatch(/razonSocial\s+NVARCHAR\(\d+\)\s+NOT\s+NULL/i);
    expect(empresa).toMatch(/notas\s+NVARCHAR\((\d+|MAX)\)\s+NULL/i);
    expect(empresa).toMatch(/idSector\s+INT\s+NULL/i);
    expect(empresa).toMatch(/FOREIGN\s+KEY\s*\(\s*idSector\s*\)\s+REFERENCES\s+dbo\.CrmSector/i);
  });

  it('stores contacts in their own table: many per empresa, deleted with it, at most one principal', async () => {
    const sql = await sqlDeMigrate();
    const contacto = tabla(sql, 'CrmContacto');
    for (const col of ['nombre', 'telefono']) {
      expect(contacto).toMatch(new RegExp(`${col}\\s+NVARCHAR\\(\\d+\\)\\s+NOT\\s+NULL`, 'i'));
    }
    expect(contacto).toMatch(/correo\s+NVARCHAR\(\d+\)\s+NULL/i);
    expect(contacto).toMatch(/esPrincipal\s+BIT\s+NOT\s+NULL/i);
    expect(contacto).toMatch(
      /FOREIGN\s+KEY\s*\(\s*idEmpresa\s*\)\s+REFERENCES\s+dbo\.CrmEmpresa\s*\(\s*idEmpresa\s*\)\s+ON\s+DELETE\s+CASCADE/i,
    );
    // Filtered unique index: a second principal for the same empresa is rejected.
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+\w+\s+ON\s+dbo\.CrmContacto\s*\(\s*idEmpresa\s*\)\s+WHERE\s+esPrincipal\s*=\s*1/i,
    );
  });

  it('keeps sector names unique and seeds the six initial sectors only when it creates the table', async () => {
    const sql = await sqlDeMigrate();
    const sector = tabla(sql, 'CrmSector');
    expect(sector).toMatch(/nombre\s+NVARCHAR\(50\)\s+NOT\s+NULL/i);
    expect(sector).toMatch(/UNIQUE\s*\(\s*nombre\s*\)/i);
    for (const s of SECTORES_INICIALES) expect(sql).toContain(`N'${s}'`);
    // The seed sits in the same guarded block as the CREATE TABLE.
    const bloque = sql.slice(sql.search(/CREATE\s+TABLE\s+dbo\.CrmSector/i));
    const hastaSiguienteIf = bloque.search(/IF\s+NOT\s+EXISTS[\s\S]*?CrmEmpresa/i);
    expect(bloque.slice(0, hastaSiguienteIf)).toContain(`N'${SECTORES_INICIALES[0]}'`);
  });
});
