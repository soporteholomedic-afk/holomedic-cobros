import ExcelJS from 'exceljs';

import { ENCABEZADOS_PLANTILLA } from '@/features/crm/infrastructure/excel/leerExcelEmpresas';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** An .xlsx built with exceljs: the template headers (or the given ones) plus the rows. */
export async function libroXlsx(
  filas: unknown[][],
  encabezados: readonly string[] = ENCABEZADOS_PLANTILLA,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Empresas');
  ws.addRow([...encabezados]);
  for (const f of filas) ws.addRow(f);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export function archivo(bytes: Uint8Array, nombre = 'empresas.xlsx'): File {
  return new File([bytes as BlobPart], nombre, { type: XLSX_MIME });
}

/** A request whose multipart body carries the given fields (no network, no parsing). */
export function multipart(campos: Record<string, FormDataEntryValue>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return { formData: () => Promise.resolve(fd) } as unknown as Request;
}

export function multipartRoto(): Request {
  return { formData: () => Promise.reject(new TypeError('cuerpo ilegible')) } as unknown as Request;
}
