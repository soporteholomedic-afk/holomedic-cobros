/**
 * Client-side validation for /admin/crm/configuracion (agente-ia-crm
 * E5·T6). These mirror the server rules so the operator gets instant
 * feedback, but the server stays the authority: a 400 `{campo}` is
 * still rendered next to its field.
 */

export const LARGO_MAXIMO_TEXTO_ESCALADO = 500;
export const TIMEOUT_MS_MINIMO = 1000;
export const TIMEOUT_MS_MAXIMO = 60000;
export const RETENCION_MESES_MINIMA = 1;
export const RETENCION_MESES_MAXIMA = 120;

const RE_PHONE_NUMBER_ID = /^\d{5,32}$/;

/** '' → NaN so an emptied numeric input is never read as 0. */
export function parseNumero(texto: string): number {
  return texto.trim() === '' ? Number.NaN : Number(texto);
}

export function errorUmbral(texto: string): string | null {
  const valor = parseNumero(texto);
  return Number.isFinite(valor) && valor > 0 && valor <= 1
    ? null
    : 'El umbral debe ser mayor que 0 y hasta 1.';
}

export function errorMaxIntercambios(texto: string): string | null {
  const valor = parseNumero(texto);
  return Number.isInteger(valor) && valor >= 1 ? null : 'Debe ser un entero mayor o igual a 1.';
}

export function errorHora(texto: string): string | null {
  const valor = parseNumero(texto);
  return Number.isInteger(valor) && valor >= 0 && valor <= 23 ? null : 'Debe ser un entero entre 0 y 23.';
}

export function errorTextoEscalado(texto: string): string | null {
  const recortado = texto.trim();
  if (recortado === '') return 'El texto no puede estar vacío.';
  if (recortado.length > LARGO_MAXIMO_TEXTO_ESCALADO) {
    return `El texto no puede superar ${LARGO_MAXIMO_TEXTO_ESCALADO} caracteres.`;
  }
  return null;
}

export function errorTimeoutMs(texto: string): string | null {
  const valor = parseNumero(texto);
  return Number.isInteger(valor) && valor >= TIMEOUT_MS_MINIMO && valor <= TIMEOUT_MS_MAXIMO
    ? null
    : `El timeout debe ser un entero entre ${TIMEOUT_MS_MINIMO} y ${TIMEOUT_MS_MAXIMO} ms.`;
}

export function errorRetencionMeses(texto: string): string | null {
  const valor = parseNumero(texto);
  return Number.isInteger(valor) && valor >= RETENCION_MESES_MINIMA && valor <= RETENCION_MESES_MAXIMA
    ? null
    : `La retención debe ser un entero entre ${RETENCION_MESES_MINIMA} y ${RETENCION_MESES_MAXIMA}.`;
}

export function errorPhoneNumberId(texto: string): string | null {
  return RE_PHONE_NUMBER_ID.test(texto.trim()) ? null : 'El Phone number ID debe tener entre 5 y 32 dígitos.';
}

export function errorUrl(texto: string): string | null {
  try {
    const url = new URL(texto.trim());
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : 'La URL debe usar http o https.';
  } catch {
    return 'Ingresa una URL válida (http o https).';
  }
}
