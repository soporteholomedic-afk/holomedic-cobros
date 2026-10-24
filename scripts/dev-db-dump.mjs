#!/usr/bin/env node
/**
 * Clone the production HOLOMEDIC database (schema + data) into a LOCAL
 * SQL Server used for development.
 *
 * Source: read-only login (SELECT only) — never writes to production.
 * Target: must be localhost / 127.0.0.1; the target database is DROPPED
 * and recreated on every run.
 *
 * Env:
 *   SRC_HOST, SRC_PORT, SRC_USER, SRC_PASSWORD, SRC_DB   (production, read-only)
 *   DST_HOST, DST_PORT, DST_USER, DST_PASSWORD, DST_DB   (local)
 *
 * Usage: node scripts/dev-db-dump.mjs
 */
import mssql from 'mssql';

const env = (k, d) => {
  const v = process.env[k] ?? d;
  if (v === undefined || v === '') throw new Error(`Missing env var: ${k}`);
  return v;
};

const src = {
  server: env('SRC_HOST'),
  port: Number(env('SRC_PORT', '1433')),
  user: env('SRC_USER'),
  password: env('SRC_PASSWORD'),
  database: env('SRC_DB'),
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 120000,
};
const dstDb = env('DST_DB');
const dstBase = {
  server: env('DST_HOST'),
  port: Number(env('DST_PORT', '1433')),
  user: env('DST_USER'),
  password: env('DST_PASSWORD'),
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 120000,
};

if (!['localhost', '127.0.0.1'].includes(dstBase.server)) {
  throw new Error(`Refusing to write to non-local target: ${dstBase.server}`);
}
if (!/^[A-Za-z0-9_]+$/.test(dstDb)) throw new Error(`Invalid DST_DB: ${dstDb}`);

const q = (name) => `[${name.replace(/]/g, ']]')}]`;

function typeSql(c) {
  const t = c.type_name;
  if (['varchar', 'char', 'varbinary', 'binary'].includes(t)) {
    return `${t}(${c.max_length === -1 ? 'max' : c.max_length})`;
  }
  if (['nvarchar', 'nchar'].includes(t)) {
    return `${t}(${c.max_length === -1 ? 'max' : c.max_length / 2})`;
  }
  if (['decimal', 'numeric'].includes(t)) return `${t}(${c.precision},${c.scale})`;
  if (['datetime2', 'time', 'datetimeoffset'].includes(t)) return `${t}(${c.scale})`;
  if (t === 'float' && c.precision !== 53) return `float(${c.precision})`;
  return t;
}

/** Explicit mssql parameter type per column (NULLs otherwise default to nvarchar). */
function paramType(c) {
  const len = c.max_length === -1 ? mssql.MAX : c.max_length;
  switch (c.type_name) {
    case 'varbinary': return mssql.VarBinary(len);
    case 'binary': return mssql.Binary(len);
    case 'nvarchar': return mssql.NVarChar(c.max_length === -1 ? mssql.MAX : c.max_length / 2);
    case 'nchar': return mssql.NChar(c.max_length / 2);
    case 'varchar': return mssql.VarChar(len);
    case 'char': return mssql.Char(len);
    case 'bigint': return mssql.BigInt;
    case 'int': return mssql.Int;
    case 'smallint': return mssql.SmallInt;
    case 'tinyint': return mssql.TinyInt;
    case 'bit': return mssql.Bit;
    case 'decimal': case 'numeric': return mssql.Decimal(c.precision, c.scale);
    case 'float': return mssql.Float;
    case 'real': return mssql.Real;
    case 'date': return mssql.Date;
    case 'datetime': return mssql.DateTime;
    case 'datetime2': return mssql.DateTime2(c.scale);
    case 'datetimeoffset': return mssql.DateTimeOffset(c.scale);
    case 'time': return mssql.Time(c.scale);
    case 'uniqueidentifier': return mssql.UniqueIdentifier;
    default: throw new Error(`Unsupported column type: ${c.type_name}`);
  }
}

async function main() {
  const s = await new mssql.ConnectionPool(src).connect();
  const master = await new mssql.ConnectionPool({ ...dstBase, database: 'master' }).connect();

  const collation = (await s.request().query(
    `SELECT CAST(DATABASEPROPERTYEX(DB_NAME(),'Collation') AS nvarchar(128)) AS c`,
  )).recordset[0].c;

  console.log(`Recreating local database ${dstDb} (${collation})`);
  await master.request().batch(`
    IF DB_ID('${dstDb}') IS NOT NULL
    BEGIN
      ALTER DATABASE ${q(dstDb)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
      DROP DATABASE ${q(dstDb)};
    END;
    CREATE DATABASE ${q(dstDb)} COLLATE ${collation};`);
  await master.close();

  const d = await new mssql.ConnectionPool({ ...dstBase, database: dstDb }).connect();

  const tables = (await s.request().query(`
    SELECT t.object_id, s.name AS schema_name, t.name
    FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.is_ms_shipped = 0 ORDER BY s.name, t.name`)).recordset;

  const cols = (await s.request().query(`
    SELECT c.object_id, c.column_id, c.name, ty.name AS type_name, c.max_length,
           c.precision, c.scale, c.is_nullable, c.is_identity, c.collation_name,
           ic.seed_value, ic.increment_value,
           dc.name AS default_name, dc.definition AS default_def
    FROM sys.columns c
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    LEFT JOIN sys.identity_columns ic ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
    WHERE c.object_id IN (SELECT object_id FROM sys.tables WHERE is_ms_shipped = 0)
    ORDER BY c.object_id, c.column_id`)).recordset;

  const idx = (await s.request().query(`
    SELECT i.object_id, i.index_id, i.name, i.type_desc, i.is_unique, i.is_primary_key,
           i.is_unique_constraint, i.has_filter, i.filter_definition,
           ic.key_ordinal, ic.is_descending_key, ic.is_included_column, c.name AS col
    FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.index_id > 0 AND i.object_id IN (SELECT object_id FROM sys.tables WHERE is_ms_shipped = 0)
    ORDER BY i.object_id, i.index_id, ic.key_ordinal, ic.index_column_id`)).recordset;

  const checks = (await s.request().query(`
    SELECT parent_object_id AS object_id, name, definition FROM sys.check_constraints`)).recordset;

  const fks = (await s.request().query(`
    SELECT fk.object_id AS fk_id, fk.name, fk.parent_object_id, fk.referenced_object_id,
           fk.delete_referential_action_desc AS on_delete, fk.update_referential_action_desc AS on_update,
           pc.name AS col, rc.name AS ref_col, fkc.constraint_column_id
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
    JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
    ORDER BY fk.object_id, fkc.constraint_column_id`)).recordset;

  const byId = new Map(tables.map((t) => [t.object_id, `${q(t.schema_name)}.${q(t.name)}`]));

  // 1. Tables (columns, defaults, PK / unique constraints, checks)
  for (const t of tables) {
    const fq = byId.get(t.object_id);
    const lines = cols.filter((c) => c.object_id === t.object_id).map((c) => {
      let l = `${q(c.name)} ${typeSql(c)}`;
      if (c.collation_name && c.collation_name !== collation) l += ` COLLATE ${c.collation_name}`;
      if (c.is_identity) l += ` IDENTITY(${c.seed_value},${c.increment_value})`;
      l += c.is_nullable ? ' NULL' : ' NOT NULL';
      if (c.default_def) l += ` CONSTRAINT ${q(c.default_name)} DEFAULT ${c.default_def}`;
      return l;
    });
    const tIdx = idx.filter((i) => i.object_id === t.object_id);
    for (const id of [...new Set(tIdx.filter((i) => i.is_primary_key || i.is_unique_constraint).map((i) => i.index_id))]) {
      const parts = tIdx.filter((i) => i.index_id === id && !i.is_included_column);
      const p = parts[0];
      const kind = p.is_primary_key ? 'PRIMARY KEY' : 'UNIQUE';
      const ct = p.type_desc === 'CLUSTERED' ? 'CLUSTERED' : 'NONCLUSTERED';
      lines.push(`CONSTRAINT ${q(p.name)} ${kind} ${ct} (${parts.map((x) => `${q(x.col)}${x.is_descending_key ? ' DESC' : ''}`).join(', ')})`);
    }
    for (const ck of checks.filter((c) => c.object_id === t.object_id)) {
      lines.push(`CONSTRAINT ${q(ck.name)} CHECK ${ck.definition}`);
    }
    await d.request().batch(`CREATE TABLE ${fq} (\n  ${lines.join(',\n  ')}\n);`);
  }

  // 2. Other indexes
  for (const t of tables) {
    const tIdx = idx.filter((i) => i.object_id === t.object_id && !i.is_primary_key && !i.is_unique_constraint);
    for (const id of [...new Set(tIdx.map((i) => i.index_id))]) {
      const parts = tIdx.filter((i) => i.index_id === id);
      const p = parts[0];
      const keys = parts.filter((x) => !x.is_included_column).map((x) => `${q(x.col)}${x.is_descending_key ? ' DESC' : ''}`);
      const inc = parts.filter((x) => x.is_included_column).map((x) => q(x.col));
      let sql = `CREATE ${p.is_unique ? 'UNIQUE ' : ''}${p.type_desc === 'CLUSTERED' ? 'CLUSTERED' : 'NONCLUSTERED'} INDEX ${q(p.name)} ON ${byId.get(t.object_id)} (${keys.join(', ')})`;
      if (inc.length) sql += ` INCLUDE (${inc.join(', ')})`;
      if (p.has_filter) sql += ` WHERE ${p.filter_definition}`;
      await d.request().batch(sql);
    }
  }

  // 3. Data
  const counts = [];
  for (const t of tables) {
    const fq = byId.get(t.object_id);
    const tCols = cols.filter((c) => c.object_id === t.object_id);
    const rows = (await s.request().query(`SELECT * FROM ${fq}`)).recordset;
    const hasIdentity = tCols.some((c) => c.is_identity);
    const colList = tCols.map((c) => q(c.name)).join(', ');
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const r = d.request();
      const values = chunk.map((row, ri) => `(${tCols.map((c, ci) => {
        const p = `p${ri}_${ci}`;
        r.input(p, paramType(c), row[c.name]);
        return `@${p}`;
      }).join(', ')})`).join(',\n');
      const ins = `INSERT INTO ${fq} (${colList}) VALUES ${values};`;
      // query() (sp_executesql) honours the declared parameter types; batch() does not.
      await r.query(hasIdentity ? `SET IDENTITY_INSERT ${fq} ON; ${ins} SET IDENTITY_INSERT ${fq} OFF;` : ins);
    }
    counts.push([fq, rows.length]);

    // Keep the identity counter aligned with the source (it may be ahead of
    // MAX(id) because of deleted rows).
    if (hasIdentity) {
      const cur = (await s.request().query(
        `SELECT CAST(IDENT_CURRENT('${fq.replace(/'/g, "''")}') AS bigint) AS v`,
      )).recordset[0].v;
      if (cur !== null) await d.request().batch(`DBCC CHECKIDENT ('${fq.replace(/'/g, "''")}', RESEED, ${cur}) WITH NO_INFOMSGS;`);
    }
  }

  // 4. Foreign keys (after data; WITH CHECK so integrity is validated)
  for (const id of [...new Set(fks.map((f) => f.fk_id))]) {
    const parts = fks.filter((f) => f.fk_id === id);
    const p = parts[0];
    const act = (a, kw) => (a === 'NO_ACTION' ? '' : ` ON ${kw} ${a.replace('_', ' ')}`);
    await d.request().batch(
      `ALTER TABLE ${byId.get(p.parent_object_id)} WITH CHECK ADD CONSTRAINT ${q(p.name)} FOREIGN KEY (${parts.map((x) => q(x.col)).join(', ')}) REFERENCES ${byId.get(p.referenced_object_id)} (${parts.map((x) => q(x.ref_col)).join(', ')})${act(p.on_delete, 'DELETE')}${act(p.on_update, 'UPDATE')};`,
    );
  }

  // 5. Verify row counts against the source
  let mismatches = 0;
  for (const [fq, n] of counts) {
    const local = (await d.request().query(`SELECT COUNT_BIG(*) AS n FROM ${fq}`)).recordset[0].n;
    const ok = Number(local) === n;
    if (!ok) mismatches++;
    console.log(`${ok ? 'OK ' : 'BAD'} ${fq} src=${n} dst=${local}`);
  }
  console.log(`tables=${tables.length} fks=${new Set(fks.map((f) => f.fk_id)).size} mismatches=${mismatches}`);

  await s.close();
  await d.close();
  if (mismatches) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
