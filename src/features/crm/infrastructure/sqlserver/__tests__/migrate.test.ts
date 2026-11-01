import { describe, expect, it } from 'vitest';

import { migrate } from '../migrate';
import {
  ACCIONES,
  DIRECCIONES,
  ETAPAS,
  ICONOS_INICIALES,
  ICONOS_SECTOR,
  MEDIOS,
  MOTIVO_CATEGORIAS,
  ORIGENES,
  RESULTADOS,
  SECTORES_INICIALES,
} from '../../../domain/entities';

/**
 * Schema contract for `dbo.CrmSector`, `dbo.CrmEmpresa` and `dbo.CrmContacto`.
 * The fake pool captures the SQL so the suite pins exactly what ships in
 * `migrate.ts`. These are static assertions on the generated script: they do
 * not execute it. Execution was rehearsed separately on a throwaway database
 * of the LOCAL dev server (never on the shared HOLOMEDIC).
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

/** Top-level statements of the script: an `IF ... BEGIN ... END;` block or a loose statement. */
function bloquesRaiz(sql: string): string[] {
  const bloques: string[] = [];
  let actual: string[] = [];
  let profundidad = 0;
  for (const linea of sql.split('\n')) {
    const t = linea.trim();
    if ((!t || t.startsWith('--')) && profundidad === 0) continue;
    actual.push(linea);
    if (/^BEGIN$/i.test(t)) profundidad++;
    if (/^END;$/i.test(t)) profundidad--;
    if (profundidad === 0 && /(END;|;)$/.test(t)) {
      bloques.push(actual.join('\n').trim());
      actual = [];
    }
  }
  return bloques;
}

/** The single top-level block that holds `patron`. */
function bloqueQueContiene(sql: string, patron: RegExp): string {
  const hallados = bloquesRaiz(sql).filter((b) => patron.test(b));
  expect(hallados, `expected exactly one block matching ${patron}`).toHaveLength(1);
  return hallados[0] ?? '';
}

/** Definition (after the column name) of `ALTER TABLE dbo.<t> ADD <columna> ...;`, guarded by sys.columns. */
function columnaNueva(sql: string, tabla: string, columna: string): string {
  const bloque = bloqueQueContiene(
    sql,
    new RegExp(`ALTER\\s+TABLE\\s+dbo\\.${tabla}\\s+ADD\\s+${columna}\\s`, 'i'),
  );
  expect(bloque).toMatch(
    new RegExp(
      `^IF\\s+NOT\\s+EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+sys\\.columns\\s+WHERE\\s+object_id\\s*=\\s*OBJECT_ID\\('dbo\\.${tabla}'\\)\\s+AND\\s+name\\s*=\\s*'${columna}'`,
      'i',
    ),
  );
  const m = bloque.match(new RegExp(`ADD\\s+${columna}\\s+([\\s\\S]*?);\\s*END;`, 'i'));
  return (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

describe('sqlserver crm migrate()', () => {
  it('creates the four tables, each guarded by IF NOT EXISTS on sys.tables', async () => {
    const sql = await sqlDeMigrate();
    expect(sql.match(/CREATE\s+TABLE/gi)).toHaveLength(4);
    for (const nombre of ['CrmSector', 'CrmEmpresa', 'CrmContacto', 'CrmInteraccion']) {
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${nombre}\\s*\\(`, 'i'));
      expect(sql).toMatch(
        new RegExp(
          `IF\\s+NOT\\s+EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+sys\\.tables\\s+WHERE\\s+name\\s*=\\s*'${nombre}'`,
          'i',
        ),
      );
    }
  });

  it('is atomic and lock-protected: XACT_ABORT ON, BEGIN TRAN, exclusive app lock with return-code check, ends with COMMIT', async () => {
    const sql = (await sqlDeMigrate()).trim();
    expect(sql).toMatch(
      /^SET\s+XACT_ABORT\s+ON;\s*BEGIN\s+TRAN;\s*DECLARE\s+@lock\s+INT;\s*EXEC\s+@lock\s*=\s*sp_getapplock\s+@Resource\s*=\s*N?'crm-migrate',\s*@LockMode\s*=\s*'Exclusive',\s*@LockOwner\s*=\s*'Transaction',\s*@LockTimeout\s*=\s*\d+;\s*IF\s+@lock\s*<\s*0\s+BEGIN\s+THROW\s+\d+,\s*N?'[^']+',\s*1;\s*END;/i,
    );
    expect(sql).toMatch(/\nCOMMIT;$/i);
    // The lock wait must end before the driver's default 15 s request timeout,
    // so a busy lock surfaces as the clear THROW and not as a generic ETIMEOUT
    // (observed on SQL Server 2019, odd/evidence/crm-contactos-rehearsal-2019.md).
    const espera = Number(/@LockTimeout\s*=\s*(\d+)/i.exec(sql)?.[1]);
    expect(espera).toBeGreaterThan(0);
    expect(espera).toBeLessThan(15000);
    expect(sql.match(/\bBEGIN\s+TRAN\b/gi)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT\b/gi)).toHaveLength(1);
    expect(sql).not.toMatch(/\bROLLBACK\b/i);
    // COMMIT is the last statement: every structural change sits between the lock and it.
    expect(sql.lastIndexOf('COMMIT')).toBeGreaterThan(sql.lastIndexOf('CREATE TABLE dbo.CrmInteraccion'));
  });

  it('never touches the old CRM_* namespace (production still recreates those tables)', async () => {
    const sql = await sqlDeMigrate();
    expect(sql).not.toMatch(/CRM_/i);
  });

  it('never drops a table nor deletes or truncates rows (L6: guarded upgrade steps only)', async () => {
    // `ON DELETE CASCADE` is a constraint on a table, not a delete.
    const sql = (await sqlDeMigrate()).replace(/ON\s+DELETE\s+CASCADE/gi, '');
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('runs every ALTER / DROP CONSTRAINT / DROP INDEX inside a guarded IF block', async () => {
    const sql = (await sqlDeMigrate()).replace(/ON\s+DELETE\s+CASCADE/gi, '');
    const bloques = bloquesRaiz(sql);
    const peligrosos = bloques.filter((b) => /\b(ALTER|DROP)\b/i.test(b));
    expect(peligrosos.length).toBeGreaterThan(0);
    for (const b of peligrosos) {
      expect(b, 'unguarded structural change').toMatch(/^IF\s+(NOT\s+)?EXISTS\s*\(/i);
      expect(b).toMatch(/sys\.(columns|indexes|key_constraints|check_constraints|tables)/i);
    }
  });

  it('lets the RUC be NULL, unique only when present, and still exactly 11 digits', async () => {
    const sql = await sqlDeMigrate();
    // Upgrade: NOT NULL -> NULL only while it is still NOT NULL.
    const alter = bloqueQueContiene(sql, /ALTER\s+TABLE\s+dbo\.CrmEmpresa\s+ALTER\s+COLUMN\s+ruc\s+VARCHAR\(11\)\s+NULL/i);
    expect(alter).toMatch(/sys\.columns[\s\S]*name\s*=\s*'ruc'[\s\S]*is_nullable\s*=\s*0/i);
    // The old unique constraint goes away (guarded) ...
    const drop = bloqueQueContiene(sql, /DROP\s+CONSTRAINT\s+UQ_CrmEmpresa_ruc/i);
    expect(drop).toMatch(/sys\.key_constraints[\s\S]*UQ_CrmEmpresa_ruc/i);
    // ... and a filtered unique index replaces it.
    const indice = bloqueQueContiene(
      sql,
      /CREATE\s+UNIQUE\s+INDEX\s+UX_CrmEmpresa_ruc\s+ON\s+dbo\.CrmEmpresa\s*\(\s*ruc\s*\)\s+WHERE\s+ruc\s+IS\s+NOT\s+NULL/i,
    );
    expect(indice).toMatch(/IF\s+NOT\s+EXISTS[\s\S]*sys\.indexes[\s\S]*UX_CrmEmpresa_ruc/i);
    // The 11-digit CHECK stays (NULL passes a LIKE check, bad values do not).
    const empresa = tabla(sql, 'CrmEmpresa');
    const check = empresa.match(/CHECK\s*\(\s*ruc\s+LIKE\s+'([^']*)'\s*\)/i);
    expect(check, 'expected a CHECK (ruc LIKE ...) constraint').not.toBeNull();
    expect(check?.[1]).toBe('[0-9]'.repeat(11));
    expect(sql).not.toMatch(/DROP\s+CONSTRAINT\s+CK_CrmEmpresa_ruc/i);
  });

  it('RUC unique index converges with two independent guards: drop UQ if present, create UX if missing', async () => {
    const sql = await sqlDeMigrate();
    const soltar = bloqueQueContiene(sql, /DROP\s+CONSTRAINT\s+UQ_CrmEmpresa_ruc/i);
    expect(soltar).toMatch(/^IF\s+EXISTS[\s\S]*sys\.key_constraints[\s\S]*UQ_CrmEmpresa_ruc/i);
    expect(soltar).not.toMatch(/CREATE/i);
    const crear = bloqueQueContiene(sql, /CREATE\s+UNIQUE\s+INDEX\s+UX_CrmEmpresa_ruc/i);
    expect(crear).toMatch(/^IF\s+NOT\s+EXISTS[\s\S]*sys\.indexes[\s\S]*UX_CrmEmpresa_ruc/i);
    expect(crear).not.toMatch(/\bDROP\b/i);
    expect(soltar).not.toBe(crear);
  });

  it('drops the old unique constraint before the column becomes NULL-able', async () => {
    const sql = await sqlDeMigrate();
    expect(sql.search(/DROP\s+CONSTRAINT\s+UQ_CrmEmpresa_ruc/i)).toBeLessThan(
      sql.search(/ALTER\s+COLUMN\s+ruc\s+VARCHAR\(11\)\s+NULL/i),
    );
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

  it('accepts medio "otro": two independent guards (drop if it lacks otro, add if missing), plus medioOtro', async () => {
    const sql = await sqlDeMigrate();
    const LITERAL = ['llamada', 'correo', 'whatsapp', 'otro'];
    const soltar = bloqueQueContiene(sql, /DROP\s+CONSTRAINT\s+CK_CrmEmpresa_medio\b/i);
    expect(soltar).toMatch(/^IF\s+EXISTS[\s\S]*sys\.check_constraints[\s\S]*CK_CrmEmpresa_medio/i);
    expect(soltar).toMatch(/NOT\s+LIKE\s+N?'%''otro''%'/i);
    expect(soltar).not.toMatch(/ADD\s+CONSTRAINT/i);
    const agregar = bloqueQueContiene(sql, /ADD\s+CONSTRAINT\s+CK_CrmEmpresa_medio\b/i);
    expect(agregar).toMatch(/^IF\s+NOT\s+EXISTS[\s\S]*sys\.check_constraints[\s\S]*CK_CrmEmpresa_medio/i);
    expect(agregar).not.toMatch(/\bDROP\b/i);
    expect(valoresCheck(agregar.slice(agregar.search(/ADD\s+CONSTRAINT/i)), 'medio')).toEqual(LITERAL);
    expect(valoresCheck(tabla(sql, 'CrmEmpresa'), 'medio')).toEqual(LITERAL);
    expect(sql.search(/DROP\s+CONSTRAINT\s+CK_CrmEmpresa_medio\b/i)).toBeLessThan(
      sql.search(/ADD\s+CONSTRAINT\s+CK_CrmEmpresa_medio\b/i),
    );
    expect(columnaNueva(sql, 'CrmEmpresa', 'medioOtro')).toMatch(/^NVARCHAR\(40\)\s+NULL$/i);
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
  it('lets contact nombre and telefono be NULL (guarded ALTER COLUMN, widths kept)', async () => {
    const sql = await sqlDeMigrate();
    for (const [col, ancho] of [
      ['nombre', 200],
      ['telefono', 50],
    ] as const) {
      const b = bloqueQueContiene(
        sql,
        new RegExp(`ALTER\\s+TABLE\\s+dbo\\.CrmContacto\\s+ALTER\\s+COLUMN\\s+${col}\\s+NVARCHAR\\(${ancho}\\)\\s+NULL`, 'i'),
      );
      expect(b).toMatch(
        new RegExp(`sys\\.columns[\\s\\S]*OBJECT_ID\\('dbo\\.CrmContacto'\\)[\\s\\S]*name\\s*=\\s*'${col}'[\\s\\S]*is_nullable\\s*=\\s*0`, 'i'),
      );
    }
  });

  it('adds the follow-up columns to CrmEmpresa, each guarded by sys.columns, with type, default and CHECK', async () => {
    const sql = await sqlDeMigrate();
    expect(columnaNueva(sql, 'CrmEmpresa', 'intentosSinRespuesta')).toMatch(
      /^INT\s+NOT\s+NULL\s+CONSTRAINT\s+DF_\w+\s+DEFAULT\s+0$/i,
    );
    expect(columnaNueva(sql, 'CrmEmpresa', 'faltaResponderDesde')).toMatch(/^DATETIME2\(3\)\s+NULL$/i);
    expect(columnaNueva(sql, 'CrmEmpresa', 'proximaAccionDetalle')).toMatch(/^NVARCHAR\(80\)\s+NULL$/i);
    expect(columnaNueva(sql, 'CrmEmpresa', 'proximaAccionFecha')).toMatch(/^DATE\s+NULL$/i);
    expect(columnaNueva(sql, 'CrmEmpresa', 'sugerenciaDescartadaEn')).toMatch(/^INT\s+NULL$/i);
    const accion = columnaNueva(sql, 'CrmEmpresa', 'proximaAccionTipo');
    expect(accion).toMatch(/^NVARCHAR\(20\)\s+NULL\s+CONSTRAINT\s+CK_CrmEmpresa_proximaAccionTipo\s+CHECK/i);
    expect(ACCIONES).toEqual(['responder', 'llamar', 'cotizar', 'info', 'whatsapp', 'reunion', 'otro']);
    expect(valoresCheck(accion, 'proximaAccionTipo')).toEqual([...ACCIONES]);
    const origen = columnaNueva(sql, 'CrmEmpresa', 'origen');
    expect(origen).toMatch(/^NVARCHAR\(20\)\s+NULL\s+CONSTRAINT\s+CK_CrmEmpresa_origen\s+CHECK/i);
    expect(ORIGENES).toEqual(['nose', 'referido', 'conocia', 'internet']);
    expect(valoresCheck(origen, 'origen')).toEqual([...ORIGENES]);
  });

  it('adds CrmSector.icono: guarded by sys.columns, NULL-able, CHECK limited to the 12 icon keys', async () => {
    const sql = await sqlDeMigrate();
    const def = columnaNueva(sql, 'CrmSector', 'icono');
    expect(def).toMatch(/^NVARCHAR\(20\)\s+NULL\s+CONSTRAINT\s+CK_CrmSector_icono\s+CHECK/i);
    expect(valoresCheck(def, 'icono')).toEqual([...ICONOS_SECTOR]);
    expect([...ICONOS_SECTOR]).toEqual([
      'edificio', 'casco', 'pico', 'fabrica', 'camion', 'tienda', 'maletin', 'salud', 'agro', 'educacion', 'tecnologia', 'alimentos',
    ]);
    // The fresh-database CREATE TABLE stays as it was: the guarded ADD runs after it.
    expect(tabla(sql, 'CrmSector')).not.toMatch(/icono/i);
    expect(sql.search(/ADD\s+icono\s/i)).toBeGreaterThan(sql.search(/CREATE\s+TABLE\s+dbo\.CrmSector/i));
  });

  it('seeds the icons of the six initial sectors only where icono IS NULL and the name matches, through dynamic SQL', async () => {
    const sql = await sqlDeMigrate();
    expect([...ICONOS_INICIALES]).toEqual(['casco', 'pico', 'fabrica', 'camion', 'tienda', 'maletin']);
    const bloque = bloqueQueContiene(sql, /UPDATE\s+s\s+SET\s+s\.icono/i);
    // A column added in this same batch cannot be referenced by a statically compiled statement.
    expect(bloque).toMatch(/EXEC\s*\(\s*N'/i);
    expect(bloque).toMatch(/^IF\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.columns[\s\S]*dbo\.CrmSector[\s\S]*name\s*=\s*'icono'/i);
    expect(bloque).toMatch(/WHERE\s+s\.icono\s+IS\s+NULL/i);
    SECTORES_INICIALES.forEach((nombre, i) => {
      expect(bloque).toContain(`(N''${nombre}'', ''${ICONOS_INICIALES[i]}'')`);
    });
    expect(bloque).toMatch(/ON\s+s\.nombre\s*=\s*v\.nombre/i);
    // Non-destructive: it only sets icono, never renames or rewrites other columns.
    expect(bloque).not.toMatch(/SET\s+s\.nombre/i);
    expect(bloque.match(/\bSET\b/gi)).toHaveLength(1);
    // Only dynamic SQL touches the new column outside its own ADD.
    const fuera = sql.replace(bloque, '').replace(bloqueQueContiene(sql, /ADD\s+icono\s/i), '');
    expect(fuera).not.toMatch(/\bicono\b/i);
  });

  it('runs the icon ADD before the seed, and both before COMMIT', async () => {
    const sql = (await sqlDeMigrate()).trim();
    const alta = sql.search(/ADD\s+icono\s/i);
    const semilla = sql.search(/UPDATE\s+s\s+SET\s+s\.icono/i);
    expect(alta).toBeGreaterThan(0);
    expect(semilla).toBeGreaterThan(alta);
    expect(sql.lastIndexOf('COMMIT')).toBeGreaterThan(semilla);
    expect(sql.match(/\bBEGIN\s+TRAN\b/gi)).toHaveLength(1);
  });

  it('creates CrmInteraccion with its columns, CHECKs, cascade FK and (idEmpresa, fecha DESC) index', async () => {
    const sql = await sqlDeMigrate();
    expect(sql).toMatch(
      /IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.tables\s+WHERE\s+name\s*=\s*'CrmInteraccion'/i,
    );
    const t = tabla(sql, 'CrmInteraccion');
    expect(t).toMatch(/idInteraccion\s+INT\s+IDENTITY\(1,1\)\s+NOT\s+NULL\s+PRIMARY\s+KEY/i);
    expect(t).toMatch(/idEmpresa\s+NVARCHAR\(50\)\s+NOT\s+NULL/i);
    expect(t).toMatch(/fecha\s+DATETIME2\(3\)\s+NOT\s+NULL\s+DEFAULT\s+SYSUTCDATETIME\(\)/i);
    expect(t).toMatch(/idUsuario\s+NVARCHAR\(50\)\s+NOT\s+NULL/i);
    expect(t).toMatch(/nombreUsuario\s+NVARCHAR\(200\)\s+NOT\s+NULL/i);
    expect(t).toMatch(/direccion\s+NVARCHAR\(10\)\s+NOT\s+NULL/i);
    expect(valoresCheck(t, 'direccion')).toEqual(['saliente', 'entrante']);
    expect([...DIRECCIONES]).toEqual(['saliente', 'entrante']);
    expect(t).toMatch(/medio\s+NVARCHAR\(10\)\s+NOT\s+NULL/i);
    expect(valoresCheck(t, 'medio')).toEqual([...MEDIOS]);
    expect(t).toMatch(/medioOtro\s+NVARCHAR\(40\)\s+NULL/i);
    expect(t).toMatch(/resultado\s+NVARCHAR\(20\)\s+NOT\s+NULL/i);
    expect(valoresCheck(t, 'resultado')).toEqual(['conversamos', 'no_contesto', 'deje_mensaje', 'pendiente', 'respondido']);
    expect([...RESULTADOS]).toEqual(['conversamos', 'no_contesto', 'deje_mensaje', 'pendiente', 'respondido']);
    expect(t).toMatch(/resumen\s+NVARCHAR\(1000\)\s+NULL/i);
    expect(t).toMatch(
      /FOREIGN\s+KEY\s*\(\s*idEmpresa\s*\)\s+REFERENCES\s+dbo\.CrmEmpresa\s*\(\s*idEmpresa\s*\)\s+ON\s+DELETE\s+CASCADE/i,
    );
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+IX_CrmInteraccion_empresa\s+ON\s+dbo\.CrmInteraccion\s*\(\s*idEmpresa\s*,\s*fecha\s+DESC\s*\)/i,
    );
  });
});
