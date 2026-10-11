/**
 * Parseo estricto del segmento `[id]` para las CUATRO rutas de
 * conversaciones (R2-dup-parse-id + R3-lenient-id-parse, remedación
 * de hallazgos advisory agente-ia-crm E1): una sola implementación en
 * vez de cuatro copias idénticas de un `Number.parseInt` permisivo.
 *
 * Estricto: solo `^\d+$`, rango 1..2^31-1 (INT positivo). Cualquier
 * otra cosa — '12abc', '1.5' (que parseInt truncaría en silencio),
 * '', '0', '-1', gigantes, espacios — devuelve null → la ruta
 * responde 400 VALIDATION_ERROR (buildCrmError). Los archivos con
 * prefijo `_` nunca crean una ruta en el App Router.
 */
export function parsearIdConversacion(param: string): number | null {
  if (!/^\d+$/.test(param)) return null;
  const valor = Number(param);
  if (valor < 1 || valor > 2_147_483_647) return null;
  return valor;
}
