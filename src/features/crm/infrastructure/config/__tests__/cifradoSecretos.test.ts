import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  ErrorCifradoConfig,
  cifrarSecreto,
  descifrarSecreto,
  enmascararSecreto,
} from '../cifradoSecretos';

const CLAVE_BASE64 = randomBytes(32).toString('base64');
const CLAVE_HEX = randomBytes(32).toString('hex');

describe('cifradoSecretos', () => {
  it('round-trips a secret with a base64 key', () => {
    const env = { CRM_CONFIG_KEY: CLAVE_BASE64 };
    const cifrado = cifrarSecreto('sk-super-secreta', env);

    expect(cifrado).not.toContain('sk-super-secreta');
    expect(descifrarSecreto(cifrado, env)).toBe('sk-super-secreta');
  });

  it('round-trips a secret with a 64-char hex key', () => {
    const env = { CRM_CONFIG_KEY: CLAVE_HEX };

    expect(descifrarSecreto(cifrarSecreto('abc', env), env)).toBe('abc');
  });

  it('uses a fresh IV: same plaintext yields different ciphertexts', () => {
    const env = { CRM_CONFIG_KEY: CLAVE_BASE64 };

    expect(cifrarSecreto('igual', env)).not.toBe(cifrarSecreto('igual', env));
  });

  it('prefixes the payload with a version tag', () => {
    const env = { CRM_CONFIG_KEY: CLAVE_BASE64 };

    expect(cifrarSecreto('x', env).startsWith('v1:')).toBe(true);
  });

  it('fails closed when the key is missing (cipher and decipher)', () => {
    const cifrado = cifrarSecreto('x', { CRM_CONFIG_KEY: CLAVE_BASE64 });

    expect(() => cifrarSecreto('x', {})).toThrowError(ErrorCifradoConfig);
    expect(() => descifrarSecreto(cifrado, {})).toThrowError(ErrorCifradoConfig);
    expect(() => cifrarSecreto('x', { CRM_CONFIG_KEY: '   ' })).toThrowError(
      expect.objectContaining({ codigo: 'CLAVE_NO_CONFIGURADA' }),
    );
  });

  it('rejects a key that does not decode to 32 bytes', () => {
    expect(() => cifrarSecreto('x', { CRM_CONFIG_KEY: 'corta' })).toThrowError(
      expect.objectContaining({ codigo: 'CLAVE_INVALIDA' }),
    );
  });

  it('rejects an empty plaintext', () => {
    expect(() => cifrarSecreto('', { CRM_CONFIG_KEY: CLAVE_BASE64 })).toThrowError(
      expect.objectContaining({ codigo: 'SECRETO_VACIO' }),
    );
  });

  it('fails to decrypt with a different key (GCM auth)', () => {
    const cifrado = cifrarSecreto('x', { CRM_CONFIG_KEY: CLAVE_BASE64 });
    const otra = { CRM_CONFIG_KEY: randomBytes(32).toString('base64') };

    expect(() => descifrarSecreto(cifrado, otra)).toThrowError(
      expect.objectContaining({ codigo: 'DESCIFRADO_FALLIDO' }),
    );
  });

  it('detects tampering with the ciphertext', () => {
    const env = { CRM_CONFIG_KEY: CLAVE_BASE64 };
    const [version, iv, tag, datos] = cifrarSecreto('secreto', env).split(':');
    const buffer = Buffer.from(datos, 'base64');
    buffer[0] ^= 0xff;

    expect(() =>
      descifrarSecreto([version, iv, tag, buffer.toString('base64')].join(':'), env),
    ).toThrowError(expect.objectContaining({ codigo: 'DESCIFRADO_FALLIDO' }));
  });

  it('rejects malformed and unknown-version payloads', () => {
    const env = { CRM_CONFIG_KEY: CLAVE_BASE64 };

    expect(() => descifrarSecreto('no-es-un-payload', env)).toThrowError(
      expect.objectContaining({ codigo: 'FORMATO_INVALIDO' }),
    );
    expect(() => descifrarSecreto('v9:a:b:c', env)).toThrowError(
      expect.objectContaining({ codigo: 'FORMATO_INVALIDO' }),
    );
  });

  it('never leaks the plaintext nor the key in error messages', () => {
    const env = { CRM_CONFIG_KEY: CLAVE_BASE64 };
    const cifrado = cifrarSecreto('sk-no-filtrar', env);

    try {
      descifrarSecreto(cifrado, { CRM_CONFIG_KEY: randomBytes(32).toString('base64') });
    } catch (error) {
      const mensaje = String((error as Error).message);
      expect(mensaje).not.toContain('sk-no-filtrar');
      expect(mensaje).not.toContain(CLAVE_BASE64);
    }
  });
});

describe('enmascararSecreto', () => {
  it('shows only the last 4 characters of a long secret', () => {
    expect(enmascararSecreto('sk-1234567890abcd')).toBe('••••••••abcd');
  });

  it('fully masks short secrets', () => {
    expect(enmascararSecreto('abcd')).toBe('••••••••');
    expect(enmascararSecreto('ab')).toBe('••••••••');
  });

  it('returns an empty string when there is no secret', () => {
    expect(enmascararSecreto('')).toBe('');
    expect(enmascararSecreto(null)).toBe('');
    expect(enmascararSecreto(undefined)).toBe('');
  });
});
