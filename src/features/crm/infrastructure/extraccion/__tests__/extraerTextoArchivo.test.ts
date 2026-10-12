// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { ExtraccionError, extraerTextoArchivo } from '../extraerTextoArchivo';

/**
 * Contrato del adaptador de extracción (agente-ia-crm E4·T7):
 * buffer + tipo → texto plano normalizado (\r\n→\n, 3+ líneas vacías
 * colapsadas a 2, trim), BOM fuera en TXT/TEXTO, PDF vía pdf-parse
 * (2.x: `new PDFParse({ data }).getText()`), DOCX vía mammoth
 * extractRawText. Cualquier fallo de parseo se mapea a
 * `ExtraccionError` preservando el `cause` original.
 *
 * PROVENANCE del fixture minimo.docx: binario mínimo generado UNA vez
 * con `python3 zipfile` (967 bytes) — un .docx es un zip con 3 partes:
 * [Content_Types].xml, _rels/.rels y word/document.xml (dos párrafos
 * con texto conocido). No se regenera en cada corrida: se commitea.
 * El PDF de prueba se construye EN el test con pdf-lib (dependencia
 * existente del repo) — nada inventado a mano.
 */

const RUTA_FIXTURE = new URL('./fixtures/minimo.docx', import.meta.url);

async function construirPdfConTexto(texto: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const pagina = pdf.addPage();
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  pagina.drawText(texto, { x: 50, y: 500, size: 24, font: fuente });
  return Buffer.from(await pdf.save());
}

describe('extraerTextoArchivo', () => {
  it('TXT: utf8, BOM fuera, \r\n→\n, 3+ líneas vacías colapsadas a 2, trim', async () => {
    const datos = Buffer.from('\uFEFFlinea uno\r\nlinea dos\r\n\r\n\r\n\r\n\r\nlinea tres\n', 'utf8');
    await expect(extraerTextoArchivo(datos, 'TXT')).resolves.toBe('linea uno\nlinea dos\n\nlinea tres');
  });

  it('TEXTO (pegado) recorre el mismo camino de normalización que TXT', async () => {
    const datos = Buffer.from('  pegado\r\n\r\n\r\n\r\ncon saltos windows  ', 'utf8');
    await expect(extraerTextoArchivo(datos, 'TEXTO')).resolves.toBe('pegado\n\ncon saltos windows');
  });

  it('PDF: extrae el texto dibujado con pdf-lib (Helvetica)', async () => {
    const sonda = 'Sonda E4T7 extraccion de pdf';
    const pdf = await construirPdfConTexto(sonda);
    const extraido = await extraerTextoArchivo(pdf, 'PDF');
    expect(extraido).toContain(sonda);
  });

  it('DOCX: extrae los párrafos del fixture mínimo comprometido', async () => {
    const datos = readFileSync(RUTA_FIXTURE);
    const extraido = await extraerTextoArchivo(datos, 'DOCX');
    expect(extraido).toContain('Contrato de servicios medicos sonda E4T7');
    expect(extraido).toContain('Segundo parrafo de prueba para extraccion');
  });

  it('PDF corrupto → ExtraccionError con la causa original preservada', async () => {
    const corrupto = Buffer.from('%PDF-1.7 esto no es un pdf valido', 'utf8');
    const error = await extraerTextoArchivo(corrupto, 'PDF').catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ExtraccionError);
    expect((error as ExtraccionError).message).toMatch(/PDF/i);
    expect((error as ExtraccionError).cause).toBeDefined();
  });

  it('DOCX corrupto (no-zip) → ExtraccionError', async () => {
    const corrupto = Buffer.from('esto no es un docx', 'utf8');
    await expect(extraerTextoArchivo(corrupto, 'DOCX')).rejects.toBeInstanceOf(ExtraccionError);
  });
});
