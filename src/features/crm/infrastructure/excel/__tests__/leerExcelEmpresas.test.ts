// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { ArchivoImportacionInvalidoError } from "../../../domain/errors";
import { ENCABEZADOS_PLANTILLA, MAX_FILAS_IMPORTACION, leerExcelEmpresas } from "../leerExcelEmpresas";

async function libro(filas: unknown[][], encabezados: readonly string[] = ENCABEZADOS_PLANTILLA): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Empresas");
  ws.addRow([...encabezados]);
  for (const f of filas) ws.addRow(f);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const ANDINA = ["Constructora Andina S.A.C.", "20512345678", "Construcción", "Marcela Quispe", "987 654 321", "marcela@andina.pe"];

async function fallo(buffer: Buffer): Promise<Error> {
  try {
    await leerExcelEmpresas(buffer);
  } catch (e) {
    return e as Error;
  }
  throw new Error("se esperaba un error y no hubo");
}

describe("leerExcelEmpresas", () => {
  it("reads one row per empresa, numbered like Excel (header is row 1), with trimmed text", async () => {
    const filas = await leerExcelEmpresas(await libro([ANDINA, ["  Minera Sur  ", " 20601234567 ", "Minería y Energía", " Jorge ", "954 112 308", null]]));
    expect(filas).toEqual([
      { fila: 2, razonSocial: "Constructora Andina S.A.C.", ruc: "20512345678", sector: "Construcción", contacto: "Marcela Quispe", telefono: "987 654 321", correo: "marcela@andina.pe" },
      { fila: 3, razonSocial: "Minera Sur", ruc: "20601234567", sector: "Minería y Energía", contacto: "Jorge", telefono: "954 112 308", correo: "" },
    ]);
  });

  it("reads numeric cells (RUC and phone typed as numbers) as text without losing digits", async () => {
    const [f] = await leerExcelEmpresas(await libro([["Textiles Norte S.A.", 20603334445, "Fábrica y Producción", "Elena Ruiz", 985333444]]));
    expect(f.ruc).toBe("20603334445");
    expect(f.telefono).toBe("985333444");
  });

  it("reads rich text and hyperlink cells as their visible text", async () => {
    const [f] = await leerExcelEmpresas(
      await libro([["Agro Costa S.A.C.", "20605556667", "Agroindustria", { richText: [{ text: "Pedro " }, { text: "León" }] }, "984 555 666", { text: "pedro@agro.pe", hyperlink: "mailto:pedro@agro.pe" }]]),
    );
    expect(f.contacto).toBe("Pedro León");
    expect(f.correo).toBe("pedro@agro.pe");
  });

  it("ignores fully blank rows but keeps the Excel numbering of the rows after them", async () => {
    const filas = await leerExcelEmpresas(await libro([ANDINA, [], [null, " ", ""], ANDINA]));
    expect(filas.map((f) => f.fila)).toEqual([2, 5]);
  });

  it("accepts the headers with other case or without the asterisks and the (opcional) mark", async () => {
    const filas = await leerExcelEmpresas(await libro([ANDINA], ["razón social", "RUC*", "Sector", "contacto *", "TELÉFONO", "Correo"]));
    expect(filas).toHaveLength(1);
  });

  it("rejects a file whose columns are not the template ones, saying how to fix it", async () => {
    const e = await fallo(await libro([ANDINA], ["Empresa", "RUC", "Rubro", "Contacto", "Teléfono", "Correo"]));
    expect(e).toBeInstanceOf(ArchivoImportacionInvalidoError);
    expect(e.message).toBe("El archivo no tiene las columnas de la plantilla. Descarga la plantilla y vuelve a intentarlo.");
  });

  it("rejects bytes that are not an .xlsx instead of crashing", async () => {
    const e = await fallo(Buffer.from("esto no es un excel"));
    expect(e).toBeInstanceOf(ArchivoImportacionInvalidoError);
    expect(e.message).toBe("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) válido.");
  });

  it("rejects a workbook with no data rows", async () => {
    const e = await fallo(await libro([[], [null, null]]));
    expect(e).toBeInstanceOf(ArchivoImportacionInvalidoError);
    expect(e.message).toBe("El archivo no tiene filas con datos.");
  });

  it("accepts exactly the maximum number of rows and rejects one more", async () => {
    const maximo = Array.from({ length: MAX_FILAS_IMPORTACION }, () => ANDINA);
    expect(await leerExcelEmpresas(await libro(maximo))).toHaveLength(MAX_FILAS_IMPORTACION);
    const e = await fallo(await libro([...maximo, ANDINA]));
    expect(e.message).toBe("El archivo tiene más de 1000 filas. Divídelo en partes más pequeñas.");
  });
});
