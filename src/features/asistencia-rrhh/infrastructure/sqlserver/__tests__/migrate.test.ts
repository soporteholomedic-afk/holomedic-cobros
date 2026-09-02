import { describe, it, expect } from 'vitest';

import { migrate, seedParametros } from '../migrate';

/**
 * Schema migration tests for the SQL Server asistencia-rrhh schema
 * (REQ-F1-17: empleados, dispositivos, marcaciones_raw, parametros_sistema,
 * alertas, comandos_dispositivo, auditoria), modeled on the cobranza
 * `migrate.test.ts`.
 *
 * The fake pool's `request().batch(sql)` captures the SQL so the suite
 * pins the exact statements that ship in `migrate.ts`. Table creation
 * itself is verified in production by running `migrate()` against a real
 * `HOLOMEDIC` database — the unit suite is the "the right code path is
 * taken + the right SQL is sent" contract.
 */

/** Extracts a single `CREATE TABLE dbo.<table> ( … )` block (up to its guard's END). */
function tableBlock(sql: string, table: string): string {
  const match = sql.match(
    new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${table}\\s*\\([\\s\\S]*?\\nEND;`, 'i'),
  );
  expect(match, `expected a CREATE TABLE block for dbo.${table}`).not.toBeNull();
  return match?.[0] ?? '';
}

describe('sqlserver asistencia migrate()', () => {
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

  it('sends a single batch to the pool (one round-trip for the whole schema)', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    expect(calls).toHaveLength(1);
  });

  it('creates the 7 tables of REQ-F1-17, each guarded by IF NOT EXISTS on sys.tables', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const sql = calls[0] ?? '';
    const creates = sql.match(/CREATE\s+TABLE/gi) ?? [];
    const guards = sql.match(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.tables/gi) ?? [];
    expect(creates).toHaveLength(7);
    expect(guards).toHaveLength(creates.length);
    for (const table of [
      'empleados',
      'dispositivos',
      'marcaciones_raw',
      'parametros_sistema',
      'alertas',
      'comandos_dispositivo',
      'auditoria',
    ]) {
      expect(sql).toMatch(new RegExp(`WHERE\\s+name\\s*=\\s*'${table}'`, 'i'));
      expect(sql).toMatch(new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${table}\\b`, 'i'));
    }
    expect(sql).toMatch(/SCHEMA_ID\s*\(\s*'dbo'\s*\)/i);
  });

  it('pins the per-table identity PK types (BIGINT for high-volume, INT otherwise)', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const sql = calls[0] ?? '';
    // High-volume / append-only tables: BIGINT IDENTITY (REQ-F1-17).
    for (const table of ['marcaciones_raw', 'alertas', 'comandos_dispositivo', 'auditoria']) {
      expect(tableBlock(sql, table)).toMatch(/id\s+BIGINT\s+IDENTITY\(1,\s*1\)/i);
    }
    // Reference tables: INT IDENTITY.
    for (const table of ['empleados', 'dispositivos']) {
      expect(tableBlock(sql, table)).toMatch(/id\s+INT\s+IDENTITY\(1,\s*1\)/i);
    }
    // parametros_sistema keys off the clave itself (no surrogate PK).
    expect(tableBlock(sql, 'parametros_sistema')).toMatch(/clave\s+VARCHAR\(50\)\s+NOT\s+NULL\s+PRIMARY\s+KEY/i);
  });

  it('creates marcaciones_raw with uq_marcacion (userId, fechaHora, punch) and FKs', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const block = tableBlock(calls[0] ?? '', 'marcaciones_raw');
    expect(block).toMatch(/CONSTRAINT\s+uq_marcacion\s+UNIQUE\s*\(\s*userId,\s*fechaHora,\s*punch\s*\)/i);
    expect(block).toMatch(/dispositivoId\s+INT\s+NOT\s+NULL\s+REFERENCES\s+dbo\.dispositivos\(id\)/i);
    expect(block).toMatch(/empleadoId\s+INT\s+NULL\s+REFERENCES\s+dbo\.empleados\(id\)/i);
    expect(block).toMatch(/tipoVerificacion\s+VARCHAR\(15\)\s+NOT\s+NULL\s+CHECK\s*\(tipoVerificacion\s+IN\s*\('HUELLA',\s*'TARJETA',\s*'PIN'\)\)/i);
  });

  it('creates empleados with UNIQUE userId and the PENDIENTE_FICHA lifecycle CHECK', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const block = tableBlock(calls[0] ?? '', 'empleados');
    expect(block).toMatch(/userId\s+VARCHAR\(20\)\s+NOT\s+NULL\s+UNIQUE/i);
    expect(block).toMatch(
      /estado\s+VARCHAR\(20\)\s+NOT\s+NULL\s+DEFAULT\s+'PENDIENTE_FICHA'\s+CHECK\s*\(estado\s+IN\s*\('PENDIENTE_FICHA',\s*'ACTIVO',\s*'INACTIVO',\s*'SUSPENDIDO'\)\)/i,
    );
  });

  it('creates dispositivos with the SHA-256 token hash column (ADR-7: VARBINARY(32))', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const block = tableBlock(calls[0] ?? '', 'dispositivos');
    expect(block).toMatch(/codigo\s+VARCHAR\(30\)\s+NOT\s+NULL\s+UNIQUE/i);
    expect(block).toMatch(/apiTokenHash\s+VARBINARY\(32\)\s+NOT\s+NULL/i);
    expect(block).toMatch(/activo\s+BIT\s+NOT\s+NULL\s+DEFAULT\s+1/i);
  });

  it('types auditoria.usuarioId as NVARCHAR(50) (dbo.usuarios.idUsuario UUID compatibility)', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const block = tableBlock(calls[0] ?? '', 'auditoria');
    expect(block).toMatch(/usuarioId\s+NVARCHAR\(50\)\s+NULL/i);
  });

  it('creates FK-referencing tables after their targets inside the single batch', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const sql = calls[0] ?? '';
    const positionOf = (table: string) =>
      sql.search(new RegExp(`CREATE\\s+TABLE\\s+dbo\\.${table}\\b`, 'i'));
    // marcaciones_raw references dispositivos + empleados; comandos_dispositivo references dispositivos.
    expect(positionOf('dispositivos')).toBeGreaterThanOrEqual(0);
    expect(positionOf('empleados')).toBeGreaterThanOrEqual(0);
    expect(positionOf('marcaciones_raw')).toBeGreaterThan(positionOf('empleados'));
    expect(positionOf('marcaciones_raw')).toBeGreaterThan(positionOf('dispositivos'));
    expect(positionOf('comandos_dispositivo')).toBeGreaterThan(positionOf('dispositivos'));
  });

  it('creates the 5 query indexes, each guarded on sys.indexes, with LOB columns off-index', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const sql = calls[0] ?? '';
    const creates = sql.match(/CREATE\s+INDEX/gi) ?? [];
    const guards = sql.match(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+sys\.indexes/gi) ?? [];
    expect(creates).toHaveLength(5);
    expect(guards).toHaveLength(creates.length);
    for (const index of [
      'idx_marcaciones_fecha',
      'idx_marcaciones_empleado',
      'idx_alertas_fecha',
      'idx_comandos_disp_estado',
      'idx_auditoria_tabla_registro',
    ]) {
      expect(sql).toMatch(new RegExp(`name\\s*=\\s*'${index}'`, 'i'));
      expect(sql).toMatch(new RegExp(`CREATE\\s+INDEX\\s+${index}\\b`, 'i'));
    }
    // LOB columns (NVARCHAR(MAX)) must never appear as index key/INCLUDE
    // columns — SQL Server forbids them and the cobranza migrate is the
    // off-index precedent.
    const includes = sql.match(/INCLUDE\s*\([^)]*\)/gi) ?? [];
    expect(includes).toHaveLength(3);
    for (const include of includes) {
      expect(include).not.toMatch(/MAX/i);
    }
    expect(tableBlock(sql, 'comandos_dispositivo')).toMatch(/payload\s+NVARCHAR\(MAX\)\s+NULL/i);
    expect(tableBlock(sql, 'auditoria')).toMatch(/datosAnteriores\s+NVARCHAR\(MAX\)\s+NULL/i);
  });

  it('stamps timestamps with naive SYSDATETIME() (ADR-9, not the repo UTC default)', async () => {
    const calls: string[] = [];
    await migrate(makePool(calls));
    const sql = calls[0] ?? '';
    expect(sql).toMatch(/DEFAULT\s+SYSDATETIME\(\)/i);
    expect(sql).not.toMatch(/SYSUTCDATETIME|GETDATE|SYSDATETIMEOFFSET/i);
  });

  it('is idempotent — calling migrate() twice sends the same guarded batch', async () => {
    const calls: string[] = [];
    const pool = makePool(calls);
    await migrate(pool);
    await migrate(pool);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe(calls[1]);
  });
});

/**
 * REQ-F1-18 parameter seed. The fake pool captures every parameterized
 * `request().input(…).query(sql)` statement so the suite pins the
 * seed-and-never-overwrite contract sent to SQL Server.
 */
describe('seedParametros()', () => {
  interface SeedStatement {
    sql: string;
    inputs: Record<string, unknown>;
  }

  function makeSeedPool(statements: SeedStatement[]) {
    return {
      request: () => {
        const inputs: Record<string, unknown> = {};
        const request = {
          input: (name: string, ...rest: unknown[]) => {
            // mssql's input() is (name, value) or (name, type, value) — the value is last.
            inputs[name] = rest[rest.length - 1];
            return request;
          },
          query: async (sql: string) => {
            statements.push({ sql, inputs: { ...inputs } });
            return { recordset: [], rowsAffected: [1] };
          },
        };
        return request;
      },
    } as unknown as import('mssql').ConnectionPool;
  }

  const VALORES_ESPERADOS: Record<string, string> = {
    TOLERANCIA_MINUTOS: '5',
    TOLERANCIA_USOS_MES: '6',
    MIN_COLAPSO_MARCAS: '2',
    REFRI_MIN_MINUTOS: '15',
    REFRI_MAX_MINUTOS: '180',
    TARDANZA_ALARMA_RELOJ_SEG: '60',
    WORKER_CAIDO_SEG: '300',
  };

  it('inserts exactly the 7 REQ-F1-18 parameter keys with their seed values', async () => {
    const statements: SeedStatement[] = [];
    await seedParametros(makeSeedPool(statements));
    expect(statements).toHaveLength(7);
    const porClave = new Map(statements.map((s) => [s.inputs['clave'], s.inputs['valor']]));
    expect([...porClave.keys()].sort()).toEqual(Object.keys(VALORES_ESPERADOS).sort());
    for (const [clave, valor] of Object.entries(VALORES_ESPERADOS)) {
      expect(porClave.get(clave)).toBe(valor);
    }
  });

  it('never overwrites — every INSERT is IF NOT EXISTS-guarded by clave and no UPDATE is sent', async () => {
    const statements: SeedStatement[] = [];
    await seedParametros(makeSeedPool(statements));
    expect(statements.length).toBeGreaterThan(0);
    for (const { sql } of statements) {
      expect(sql).toMatch(/IF\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+dbo\.parametros_sistema\s+WHERE\s+clave\s*=\s*@clave\s*\)/i);
      expect(sql).toMatch(/INSERT\s+INTO\s+dbo\.parametros_sistema\s*\(\s*clave,\s*valor\s*\)\s+VALUES\s*\(\s*@clave,\s*@valor\s*\)/i);
      expect(sql).not.toMatch(/UPDATE\s+dbo\.parametros_sistema/i);
      expect(sql).not.toMatch(/DELETE\s+FROM\s+dbo\.parametros_sistema/i);
    }
  });

  it('is idempotent — re-running sends the exact same guarded statements and values', async () => {
    const primeraVuelta: SeedStatement[] = [];
    const segundaVuelta: SeedStatement[] = [];
    const pool = makeSeedPool(primeraVuelta);
    await seedParametros(pool);
    const pool2 = makeSeedPool(segundaVuelta);
    await seedParametros(pool2);
    expect(segundaVuelta).toEqual(primeraVuelta);
  });
});
