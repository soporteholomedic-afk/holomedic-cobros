/**
 * Reglas de dominio para el campo "detalle de irradiación" de las secciones
 * CERVICAL, DORSAL y LUMBO SACRA del cuestionario anamnésico osteomuscular.
 *
 * El campo describe la zona / trayectoria de la irradiación del dolor, por lo
 * que se acepta texto libre acotado: letras (con tildes y eñes), números,
 * espacios y puntuación clínica básica ( . , ; : ( ) / - ).
 */

/** Longitud máxima permitida para el detalle de irradiación. */
export const DETALLE_IRRADIACION_MAX_LENGTH = 100;

/** Formato permitido: letras, números, espacios y puntuación básica. */
export const DETALLE_IRRADIACION_PATTERN =
  /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9\s.,;:()/-]*$/;

/** Mensaje mostrado cuando el valor no cumple el formato o la longitud. */
export const DETALLE_IRRADIACION_ERROR_MESSAGE =
  'Formato no válido: use solo letras, números, espacios y los signos . , ; : ( ) / - (máx. 100 caracteres).';

export function isValidDetalleIrradiacion(value: string): boolean {
  return value.length <= DETALLE_IRRADIACION_MAX_LENGTH
    && DETALLE_IRRADIACION_PATTERN.test(value);
}
