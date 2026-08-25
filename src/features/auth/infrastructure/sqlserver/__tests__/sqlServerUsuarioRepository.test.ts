import { describe, it, expect, beforeEach } from 'vitest';
import type * as mssql from 'mssql';

import { SqlServerUsuarioRepository } from '../sqlServerUsuarioRepository';

/**
 * Fake-pool tests pinning the dual-column SQL of the usuarios
 * repository: the WHERE clause of `findByUsuario`, the INSERT/UPDATE
 * column lists, and the `rowToRow` mapping of both identity fields.
 * No real database is touched (the schema migration runs lazily in
 * production only).
 */
describe('SqlServerUsuarioRepository — dual usuario/nombre columns', () => {
  let queries: { sql: string; inputs: Map<string, unknown> }[];

  beforeEach(() => {
    queries = [];
  });

  function makePool(recordset: unknown[] = []) {
    const request = () => {
      const inputs = new Map<string, unknown>();
      const req = {
        input: (name: string, _type: unknown, value: unknown) => {
          inputs.set(name, value);
          return req;
        },
        query: async (sql: string) => {
          queries.push({ sql, inputs });
          return { recordset, rowsAffected: [recordset.length] };
        },
      };
      return req;
    };
    return { request } as unknown as mssql.ConnectionPool;
  }

  // Structural stand-in for the module-local UsuarioDbRow (not exported).
  const dbRow = {
    idUsuario: 'u-1',
    usuario: 'jdoe',
    nombre: 'John Doe',
    area: 'cobranza',
    permisos: JSON.stringify(['admin']),
    contrasenaHash: 'hash',
    firma: null,
    activo: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('findByUsuario filters on the usuario column (WHERE usuario = @usuario)', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([dbRow]));

    const row = await repo.findByUsuario('jdoe');

    const call = queries[0];
    expect(call.sql).toContain('WHERE usuario = @usuario');
    expect(call.inputs.get('usuario')).toBe('jdoe');
    expect(row?.usuario).toBe('jdoe');
    expect(row?.nombre).toBe('John Doe');
  });

  it('rowToRow maps BOTH usuario and nombre onto the domain row', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([dbRow]));

    const row = await repo.getById('u-1');

    expect(row).not.toBeNull();
    expect(row?.usuario).toBe('jdoe');
    expect(row?.nombre).toBe('John Doe');
    expect(row?.idUsuario).toBe('u-1');
    expect(row?.permisos).toEqual(['admin']);
  });

  it('create INSERTs both usuario and nombre in the column list', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([dbRow]));

    await repo.create({
      usuario: 'asmith',
      nombre: 'Alice Smith',
      area: 'consolidados',
      permisos: ['consolidados'],
      contrasena: 'secret',
    });

    const insert = queries.find((q) => q.sql.includes('INSERT INTO dbo.usuarios'));
    expect(insert).toBeTruthy();
    expect(insert?.sql).toMatch(
      /INSERT\s+INTO\s+dbo\.usuarios\s+\(idUsuario,\s*usuario,\s*nombre,\s*area,\s*correo,\s*permisos,\s*contrasenaHash\)/,
    );
    expect(insert?.sql).toMatch(/VALUES\s*\(@idUsuario,\s*@usuario,\s*@nombre,\s*@area,\s*@correo,\s*@permisos,\s*@contrasenaHash\)/);
    expect(insert?.inputs.get('usuario')).toBe('asmith');
    expect(insert?.inputs.get('nombre')).toBe('Alice Smith');
  });

  it('update sets usuario = @usuario when the input carries it (round-trip preserves both)', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([dbRow]));

    const updated = await repo.update('u-1', { usuario: 'jdoe2', nombre: 'John D. Doe' });

    const update = queries.find((q) => q.sql.includes('UPDATE dbo.usuarios'));
    expect(update).toBeTruthy();
    expect(update?.sql).toContain('usuario = @usuario');
    expect(update?.sql).toContain('nombre = @nombre');
    expect(update?.inputs.get('usuario')).toBe('jdoe2');
    expect(update?.inputs.get('nombre')).toBe('John D. Doe');
    // The OUTPUT INSERTED.* row flows back through rowToRow with both fields.
    expect(updated.usuario).toBe('jdoe');
    expect(updated.nombre).toBe('John Doe');
  });

  it('update without usuario leaves the column untouched (partial update)', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([dbRow]));

    await repo.update('u-1', { nombre: 'Solo Nombre' });

    const update = queries.find((q) => q.sql.includes('UPDATE dbo.usuarios'));
    expect(update).toBeTruthy();
    expect(update?.sql).not.toContain('usuario = @usuario');
    expect(update?.sql).toContain('nombre = @nombre');
  });
});

describe('SqlServerUsuarioRepository — correo column', () => {
  let queries: { sql: string; inputs: Map<string, unknown> }[];

  beforeEach(() => {
    queries = [];
  });

  function makePool(recordset: unknown[] = []) {
    const request = () => {
      const inputs = new Map<string, unknown>();
      const req = {
        input: (name: string, _type: unknown, value: unknown) => {
          inputs.set(name, value);
          return req;
        },
        query: async (sql: string) => {
          queries.push({ sql, inputs });
          return { recordset, rowsAffected: [recordset.length] };
        },
      };
      return req;
    };
    return { request } as unknown as mssql.ConnectionPool;
  }

  const baseDbRow = {
    idUsuario: 'u-1',
    usuario: 'asmith',
    nombre: 'Alice Smith',
    area: 'consolidados',
    permisos: JSON.stringify(['consolidados']),
    contrasenaHash: 'hash',
    firma: null,
    activo: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('create INSERTs correo in the column list and passes its value', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([{ ...baseDbRow, correo: 'alice@holomedic.com' }]));

    await repo.create({
      usuario: 'asmith',
      nombre: 'Alice Smith',
      area: 'consolidados',
      correo: 'alice@holomedic.com',
      permisos: ['consolidados'],
      contrasena: 'secret',
    });

    const insert = queries.find((q) => q.sql.includes('INSERT INTO dbo.usuarios'));
    expect(insert).toBeTruthy();
    expect(insert?.sql).toContain('correo');
    expect(insert?.sql).toMatch(/VALUES\s*\([^)]*@correo/i);
    expect(insert?.inputs.get('correo')).toBe('alice@holomedic.com');
  });

  it('create without correo inserts NULL', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([{ ...baseDbRow, correo: null }]));

    await repo.create({
      usuario: 'asmith',
      nombre: 'Alice Smith',
      area: 'consolidados',
      permisos: ['consolidados'],
      contrasena: 'secret',
    });

    const insert = queries.find((q) => q.sql.includes('INSERT INTO dbo.usuarios'));
    expect(insert?.inputs.get('correo')).toBeNull();
  });

  it('rowToRow maps SQL NULL correo to null (round-trip)', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([{ ...baseDbRow, correo: null }]));

    const row = await repo.getById('u-1');

    expect(row?.correo).toBeNull();
  });

  it('rowToRow tolerates a pre-migration row without correo (deploy skew)', async () => {
    // SELECT * on a database where the correo column does not exist yet
    // yields a record with NO correo key at all.
    const repo = new SqlServerUsuarioRepository(makePool([{ ...baseDbRow }]));

    const row = await repo.getById('u-1');

    expect(row?.correo).toBeNull();
  });

  it('update sets correo = @correo for a string value', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([{ ...baseDbRow, correo: null }]));

    await repo.update('u-1', { correo: 'nueva@holomedic.com' });

    const update = queries.find((q) => q.sql.includes('UPDATE dbo.usuarios'));
    expect(update).toBeTruthy();
    expect(update?.sql).toContain('correo = @correo');
    expect(update?.inputs.get('correo')).toBe('nueva@holomedic.com');
  });

  it('update clears correo when the input carries null', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([{ ...baseDbRow, correo: 'old@holomedic.com' }]));

    await repo.update('u-1', { correo: null });

    const update = queries.find((q) => q.sql.includes('UPDATE dbo.usuarios'));
    expect(update).toBeTruthy();
    expect(update?.sql).toContain('correo = @correo');
    expect(update?.inputs.get('correo')).toBeNull();
  });

  it('update without correo leaves the column untouched', async () => {
    const repo = new SqlServerUsuarioRepository(makePool([{ ...baseDbRow, correo: null }]));

    await repo.update('u-1', { nombre: 'Solo Nombre' });

    const update = queries.find((q) => q.sql.includes('UPDATE dbo.usuarios'));
    expect(update).toBeTruthy();
    expect(update?.sql).not.toContain('correo = @correo');
  });
});
