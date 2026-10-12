import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

import type { TipoIngesta } from '../../domain/entities';

/**
 * Adaptador de extracción de texto (agente-ia-crm E4·T7): buffer +
 * tipo → texto plano normalizado. Es el ÚNICO punto que conoce a
 * pdf-parse/mammoth — la ruta de subida (T8) lo llama en el momento
 * del upload (los 5 MB máx. se procesan síncronamente en un tirón) y
 * guarda el texto ya extraído como `contenidoCrudo`; el procesador de
 * la cola trocea ese texto sin volver a tocar binarios.
 *
 * Normalización de salida (común a todos los tipos): BOM fuera,
 * \r\n→\n, 3+ líneas vacías colapsadas a 2 (los párrafos del
 * troceador son \n\n+), trim de extremos.
 *
 * Todo fallo de parseo se mapea a `ExtraccionError` (tipado, con el
 * `cause` original preservado para el diagnóstico) — la ruta T8 lo
 * traduce a un 4xx y el procesador nunca ve binarios.
 */

/** Fallo de extracción tipado — la causa original viaja en `cause`. */
export class ExtraccionError extends Error {
  constructor(motivo: string, opciones?: { cause?: unknown }) {
    super(`No se pudo extraer el texto del documento (${motivo})`, opciones);
    this.name = 'ExtraccionError';
  }
}

/** UTF-8 con BOM fuera (los TXT exportados de Windows lo traen). */
function textoPlano(datos: Buffer): string {
  return datos.toString('utf8').replace(/^\uFEFF/, '');
}

/** pdf-parse 2.x: instancia por documento + getText + destroy. */
async function extraerPdf(datos: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(datos) });
  try {
    const resultado = await parser.getText();
    return resultado.text;
  } finally {
    await parser.destroy();
  }
}

async function extraerDocx(datos: Buffer): Promise<string> {
  const resultado = await mammoth.extractRawText({ buffer: datos });
  return resultado.value;
}

/** Normalización común: saltos Windows, párrafos compactos, extremos. */
function normalizar(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extraerTextoArchivo(datos: Buffer, tipo: TipoIngesta): Promise<string> {
  let crudo: string;
  try {
    switch (tipo) {
      case 'PDF':
        crudo = await extraerPdf(datos);
        break;
      case 'DOCX':
        crudo = await extraerDocx(datos);
        break;
      case 'TXT':
      case 'TEXTO':
        crudo = textoPlano(datos);
        break;
    }
  } catch (error: unknown) {
    throw new ExtraccionError(tipo === 'PDF' ? 'PDF ilegible' : 'documento ilegible', { cause: error });
  }
  return normalizar(crudo);
}
