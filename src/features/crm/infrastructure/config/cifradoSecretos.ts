import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM helpers for secrets stored in the CRM config table
 * (agente-ia-crm E5·T1). The master key comes from `CRM_CONFIG_KEY`
 * (32 bytes, base64 or 64-char hex) and is NEVER stored in the DB nor
 * synced to the SDK share. Fail-closed by design: without a valid key
 * nothing is encrypted or decrypted, in ANY environment — there is no
 * plaintext fallback.
 *
 * Payload format: `v1:<iv b64>:<authTag b64>:<ciphertext b64>`. The
 * version tag leaves room for key rotation / algorithm changes. Error
 * messages never include plaintext, ciphertext or key material.
 */

export type CodigoErrorCifrado =
  | 'CLAVE_NO_CONFIGURADA'
  | 'CLAVE_INVALIDA'
  | 'SECRETO_VACIO'
  | 'FORMATO_INVALIDO'
  | 'DESCIFRADO_FALLIDO';

export class ErrorCifradoConfig extends Error {
  constructor(
    readonly codigo: CodigoErrorCifrado,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorCifradoConfig';
  }
}

type EntornoCifrado = Record<string, string | undefined>;

const ALGORITMO = 'aes-256-gcm';
const VERSION = 'v1';
const BYTES_CLAVE = 32;
const BYTES_IV = 12;
const BYTES_TAG = 16;
const MASCARA = '••••••••';
const LARGO_MINIMO_PARA_REVELAR = 12;
const CARACTERES_VISIBLES = 4;

function leerClave(env: EntornoCifrado): Buffer {
  const cruda = env.CRM_CONFIG_KEY?.trim();
  if (!cruda) {
    throw new ErrorCifradoConfig(
      'CLAVE_NO_CONFIGURADA',
      'CRM_CONFIG_KEY no está configurada: no se pueden cifrar ni descifrar secretos (fail closed).',
    );
  }

  const clave = /^[0-9a-fA-F]{64}$/.test(cruda)
    ? Buffer.from(cruda, 'hex')
    : Buffer.from(cruda, 'base64');

  if (clave.length !== BYTES_CLAVE) {
    throw new ErrorCifradoConfig(
      'CLAVE_INVALIDA',
      'CRM_CONFIG_KEY debe ser de 32 bytes (base64 o 64 caracteres hex).',
    );
  }

  return clave;
}

export function cifrarSecreto(
  textoPlano: string,
  env: EntornoCifrado = process.env,
): string {
  const clave = leerClave(env);
  if (textoPlano.length === 0) {
    throw new ErrorCifradoConfig('SECRETO_VACIO', 'No se puede cifrar un secreto vacío.');
  }

  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv(ALGORITMO, clave, iv);
  const datos = Buffer.concat([cifrador.update(textoPlano, 'utf8'), cifrador.final()]);

  return [
    VERSION,
    iv.toString('base64'),
    cifrador.getAuthTag().toString('base64'),
    datos.toString('base64'),
  ].join(':');
}

export function descifrarSecreto(
  payload: string,
  env: EntornoCifrado = process.env,
): string {
  const clave = leerClave(env);
  const partes = payload.split(':');
  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new ErrorCifradoConfig('FORMATO_INVALIDO', 'Formato de secreto cifrado inválido.');
  }

  const iv = Buffer.from(partes[1], 'base64');
  const tag = Buffer.from(partes[2], 'base64');
  const datos = Buffer.from(partes[3], 'base64');
  if (iv.length !== BYTES_IV || tag.length !== BYTES_TAG) {
    throw new ErrorCifradoConfig('FORMATO_INVALIDO', 'Formato de secreto cifrado inválido.');
  }

  try {
    const descifrador = createDecipheriv(ALGORITMO, clave, iv);
    descifrador.setAuthTag(tag);
    return Buffer.concat([descifrador.update(datos), descifrador.final()]).toString('utf8');
  } catch {
    throw new ErrorCifradoConfig(
      'DESCIFRADO_FALLIDO',
      'No se pudo descifrar el secreto (clave incorrecta o dato alterado).',
    );
  }
}

/**
 * Display-safe form of a secret for the admin UI: fixed-width mask plus
 * the last 4 characters only when the secret is long enough that doing
 * so does not meaningfully weaken it.
 */
export function enmascararSecreto(secreto: string | null | undefined): string {
  if (!secreto) return '';
  if (secreto.length < LARGO_MINIMO_PARA_REVELAR) return MASCARA;
  return `${MASCARA}${secreto.slice(-CARACTERES_VISIBLES)}`;
}
