/**
 * Quita de la respuesta del modelo los marcadores de cita `[id N]` que el
 * prompt le pide para auditar las fuentes (`[id 47]`, `[id 47, 48]`,
 * `[id 47;48]`, `[ID 47]` y rachas como `[id 47][id 48]`). Son para la
 * auditoría, no para el cliente de WhatsApp.
 *
 * Se elimina también el espacio horizontal previo (los saltos de línea se
 * conservan): "empresas [id 47], por" → "empresas, por". Otros textos entre
 * corchetes ("[teléfono]", "[2]", "[id]") no se tocan. Si el texto quedara
 * vacío (solo había marcadores) se devuelve el original; si no hay
 * marcadores, el texto vuelve idéntico.
 */

const MARCADOR = String.raw`\[id\s+\d+(?:\s*[,;]\s*\d+)*\s*\]`;
const RACHA_CON_ESPACIO_PREVIO = String.raw`[^\S\n]*(?:${MARCADOR}[^\S\n]*)*${MARCADOR}`;

// Marcador pegado a una palabra ("a [id 1]b"): se deja un espacio para no fusionarlas.
const CITA_ANTES_DE_PALABRA = new RegExp(`${RACHA_CON_ESPACIO_PREVIO}(?=[\\p{L}\\p{N}])`, 'giu');
const CITA = new RegExp(RACHA_CON_ESPACIO_PREVIO, 'gi');

export function limpiarCitasRespuesta(texto: string): string {
  const limpio = texto
    .replace(CITA_ANTES_DE_PALABRA, ' ')
    .replace(CITA, '');
  if (limpio === texto) return texto;

  const normalizado = limpio.replace(/ {2,}/g, ' ').trim();
  return normalizado === '' ? texto : normalizado;
}
