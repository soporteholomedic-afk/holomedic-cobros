// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  hashToken,
  nuevoTokenBase64url,
  parsearArgs,
  parsearEnvLocal,
  provisionarDispositivo,
  resolverConfigDb,
} from '../provisionar_dispositivo.mjs';

// ─── Fake pool (repo pattern: SqlServerDeviceAdapters.test.ts) ──────────────

interface Consulta {
  sql: string;
  inputs: Record<string, unknown>;
}

function makeFakePool(recordset: unknown[] = [], opciones: { rowsAffected?: number[] } = {}) {
  const consultas: Consulta[] = [];
  const pool = {
    request() {
      const inputs: Record<string, unknown> = {};
      return {
        input(name: string, _type: unknown, value: unknown) {
          inputs[name] = value;
          return this;
        },
        async query(sql: string) {
          consultas.push({ sql, inputs: { ...inputs } });
          const idx = consultas.length - 1;
          const afectadas = opciones.rowsAffected?.[idx] ?? recordset.length;
          return { recordset, rowsAffected: [afectadas] };
        },
      };
    },
    async close() {
      /* no-op */
    },
  };
  return { pool, consultas };
}

const CODIGO = 'K20-SEDE1';
const TOKEN = 'test-token'; // sha256 pinned below — NEVER persisted anywhere

// ─── Token hashing (ADR-7: exactly SHA-256, 32 bytes) ───────────────────────

describe('hashToken', () => {
  it('produces the pinned SHA-256 digest (32 bytes)', () => {
    const hash = hashToken(TOKEN);
    expect(hash.length).toBe(32);
    expect(Buffer.from(hash).toString('hex')).toBe(
      '4c5dc9b7708905f77f5e5d16316b5dfb425e68cb326dcd55a860e90a7707031e',
    );
  });

  it('is deterministic and input-sensitive', () => {
    expect(Buffer.from(hashToken(TOKEN)).equals(Buffer.from(hashToken(TOKEN)))).toBe(true);
    expect(Buffer.from(hashToken(TOKEN)).equals(Buffer.from(hashToken('otro')))).toBe(false);
  });
});

describe('nuevoTokenBase64url', () => {
  it('encodes 32 random bytes as unpadded base64url (43 chars, URL-safe)', () => {
    const token = nuevoTokenBase64url();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nuevoTokenBase64url()).not.toBe(token);
  });
});

// ─── Provisioning core (fake pool — no real SQL Server) ─────────────────────

describe('provisionarDispositivo', () => {
  it('inserts a new device with the token HASH (32-byte varbinary), never the plain token', async () => {
    const { pool, consultas } = makeFakePool([]);
    const resultado = await provisionarDispositivo(pool, {
      codigo: CODIGO,
      sede: 'Sede 1',
      ip: '192.168.1.50',
      rotar: false,
      token: TOKEN,
    });

    expect(resultado.accion).toBe('creado');
    const insert = consultas.find((c) => /INSERT INTO dbo\.dispositivos/i.test(c.sql));
    expect(insert).toBeDefined();
    expect(insert?.inputs['hash']).toBeDefined();
    expect(Buffer.from(insert?.inputs['hash'] as Uint8Array).length).toBe(32);
    expect(insert?.inputs['codigo']).toBe(CODIGO);
    expect(insert?.inputs['sede']).toBe('Sede 1');
    expect(insert?.inputs['ip']).toBe('192.168.1.50');
  });

  it('is idempotent: an existing code without --rotar is a no-op that hides the token', async () => {
    const { pool, consultas } = makeFakePool([{ id: 7 }]);
    const resultado = await provisionarDispositivo(pool, {
      codigo: CODIGO,
      sede: 'Sede 1',
      ip: '192.168.1.50',
      rotar: false,
      token: TOKEN,
    });

    expect(resultado.accion).toBe('sin_cambios');
    expect(resultado.token).toBeUndefined();
    expect(consultas.some((c) => /INSERT INTO/i.test(c.sql))).toBe(false);
    expect(consultas.some((c) => /UPDATE/i.test(c.sql))).toBe(false);
  });

  it('--rotar updates the stored hash for an existing device', async () => {
    const { pool, consultas } = makeFakePool([{ id: 7 }]);
    const resultado = await provisionarDispositivo(pool, {
      codigo: CODIGO,
      sede: 'Sede 1',
      ip: '192.168.1.50',
      rotar: true,
      token: TOKEN,
    });

    expect(resultado.accion).toBe('rotado');
    const update = consultas.find((c) => /UPDATE dbo\.dispositivos/i.test(c.sql));
    expect(update).toBeDefined();
    expect(Buffer.from(update?.inputs['hash'] as Uint8Array).length).toBe(32);
    expect(update?.inputs['id']).toBe(7);
  });

  it('the plain token NEVER appears in any SQL string or bound input', async () => {
    const { pool, consultas } = makeFakePool([]);
    await provisionarDispositivo(pool, {
      codigo: CODIGO,
      sede: 'Sede 1',
      ip: '192.168.1.50',
      rotar: true,
      token: TOKEN,
    });
    for (const consulta of consultas) {
      expect(consulta.sql).not.toContain(TOKEN);
      for (const valor of Object.values(consulta.inputs)) {
        if (typeof valor === 'string') expect(valor).not.toContain(TOKEN);
      }
    }
  });
});

// ─── CLI parsing ────────────────────────────────────────────────────────────

describe('parsearArgs', () => {
  it('parses codigo/sede/ip and the optional rotar flag', () => {
    const args = parsearArgs([
      '--codigo',
      CODIGO,
      '--sede',
      'Sede 1',
      '--ip',
      '192.168.1.50',
      '--rotar',
    ]);
    expect(args).toEqual({ codigo: CODIGO, sede: 'Sede 1', ip: '192.168.1.50', rotar: true });
  });

  it('defaults rotar to false', () => {
    const args = parsearArgs(['--codigo', CODIGO, '--sede', 'S', '--ip', '10.0.0.1']);
    expect(args.rotar).toBe(false);
  });

  it('fails loudly when a required argument is missing', () => {
    expect(() => parsearArgs(['--sede', 'S', '--ip', '10.0.0.1'])).toThrow(/--codigo/);
  });
});

// ─── DB env resolution (HOLOMEDIC_DB_* with DB_* and .env.local fallback) ───

describe('resolverConfigDb', () => {
  it('reads HOLOMEDIC_DB_* first', () => {
    const config = resolverConfigDb(
      {
        HOLOMEDIC_DB_HOST: 'h1',
        HOLOMEDIC_DB_USER: 'u1',
        HOLOMEDIC_DB_PASSWORD: 'p1',
        HOLOMEDIC_DB_NAME: 'HOLOMEDIC',
      },
      undefined,
    );
    expect(config).toEqual({
      server: 'h1',
      user: 'u1',
      password: 'p1',
      database: 'HOLOMEDIC',
    });
  });

  it('falls back to DB_* and then to the .env.local text', () => {
    const config = resolverConfigDb(
      { DB_HOST: 'h2', DB_USER: 'u2', DB_PASSWORD: 'p2' },
      'HOLOMEDIC_DB_HOST=h3\nDB_USER=u3\nDB_PASSWORD=p3\n',
    );
    expect(config.server).toBe('h2');
    expect(config.user).toBe('u2');
    expect(config.password).toBe('p2');
  });

  it('parses .env.local when the process env has nothing', () => {
    const config = resolverConfigDb(
      {},
      '# comment\nHOLOMEDIC_DB_HOST=h3\n\nHOLOMEDIC_DB_USER = u3\nHOLOMEDIC_DB_PASSWORD=p3\n',
    );
    expect(config.server).toBe('h3');
    expect(config.user).toBe('u3');
    expect(config.password).toBe('p3');
  });

  it('fails loudly when host/user/password cannot be resolved', () => {
    expect(() => resolverConfigDb({}, undefined)).toThrow();
  });
});

describe('parsearEnvLocal', () => {
  it('skips comments and blank lines, trims values', () => {
    expect(
      parsearEnvLocal('# h\n\nA=1\n  B = two words  \nC='),
    ).toEqual({ A: '1', B: 'two words' });
  });
});
