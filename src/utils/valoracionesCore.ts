import * as XLSX from 'xlsx';

// ---- Types ----

export interface ValoracionRow {
  facturar_a: string;
  contratades: string;
  proyectodes: string;
  cr_proy: string;
  dociden: string;
  nombre: string;
  edad: string | number;
  'Fecha de Nacimiento': string;
  ocupacion: string;
  tipotrab: string;
  feorden: string;
  tipo_examen: string;
  perfil: string;
  solicitado: string;
  costo: number;
}

export interface CompanyGroup {
  company: string;
  rows: ValoracionRow[];
  subtotal: number;
  igv: number;
  total: number;
}

export interface GroupedData {
  companies: CompanyGroup[];
}

// ---- Helpers ----

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---- Pure parsing function (testable without I/O) ----

/**
 * Parse a CSV string containing valoraciones data into grouped company data.
 * Filters out rows where total is 0, empty, or falsy.
 */
export function parseValoracionesCsvContent(csvContent: string): GroupedData {
  // raw: true prevents xlsx from converting date strings (01/01/2026) to serial numbers
  const workbook = XLSX.read(csvContent, { type: 'string', raw: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });

  // Filter: keep rows with total > 0 (numeric)
  const filteredRows = rawRows.filter((row) => {
    const total = row['total'];
    const costo = typeof total === 'number' ? total : parseFloat(String(total));
    return !isNaN(costo) && costo > 0;
  });

  // Group by facturar a
  const groups = new Map<string, ValoracionRow[]>();

  filteredRows.forEach((row) => {
    const company = String(row['facturar a'] || '').trim();
    if (!company) return;

    const rawTotal = row['total'];
    const costo =
      typeof rawTotal === 'number'
        ? (rawTotal as number)
        : parseFloat(String(rawTotal));

    const mapped: ValoracionRow = {
      facturar_a: company,
      contratades: String(row['contratades'] || ''),
      proyectodes: String(row['proyectodes'] || ''),
      cr_proy: String(row['cr_proy'] || ''),
      dociden: String(row['dociden'] || ''),
      nombre: String(row['nombre'] || ''),
      edad: String(row['edad'] ?? ''),
      'Fecha de Nacimiento': String(row['Fecha de Nacimiento'] || ''),
      ocupacion: String(row['ocupacion'] || ''),
      tipotrab: String(row['tipotrab'] || ''),
      feorden: String(row['feorden'] || ''),
      tipo_examen: String(row['tipo_examen'] || ''),
      perfil: String(row['perfil'] || ''),
      solicitado: String(row['solicitado'] || ''),
      costo: isNaN(costo) ? 0 : costo,
    };

    const existing = groups.get(company);
    if (existing) {
      existing.push(mapped);
    } else {
      groups.set(company, [mapped]);
    }
  });

  // Build company groups with summary calculations
  const companies: CompanyGroup[] = [];

  groups.forEach((rows, company) => {
    const subtotal = round2(rows.reduce((sum, r) => sum + r.costo, 0));
    const igv = round2(subtotal * 0.18);
    const total = round2(subtotal + igv);
    companies.push({ company, rows, subtotal, igv, total });
  });

  return { companies };
}

// ---- Workbook generation ----

const SHEET_NAME_MAX = 31; // Excel sheet name character limit

/**
 * Generate an Excel workbook from grouped valoraciones data.
 * Creates one sheet per company with Item, Nombre, Documento, Examen, Perfil, Costo (S/.)
 * columns plus Subtotal, IGV 18%, Total summary rows.
 */
export function generateValoracionesWorkbook(groupedData: GroupedData): Buffer {
  const workbook = XLSX.utils.book_new();

  if (groupedData.companies.length === 0) {
    // xlsx.write() throws on an empty workbook; add a placeholder sheet
    const emptySheet = XLSX.utils.aoa_to_sheet([['No data']]);
    XLSX.utils.book_append_sheet(workbook, emptySheet, 'Empty');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  for (const group of groupedData.companies) {
    const sheetName = group.company.substring(0, SHEET_NAME_MAX);

    // Build sheet data as array of arrays
    const sheetData: unknown[][] = [];

    // Row 0: Company name (centered header)
    sheetData.push([group.company]);

    // Row 1: Column headers
    sheetData.push([
      'Item',
      'Nombre',
      'Documento',
      'Examen',
      'Perfil',
      'Costo (S/.)',
    ]);

    // Data rows
    group.rows.forEach((row, idx) => {
      sheetData.push([
        idx + 1,
        row.nombre,
        row.dociden,
        row.tipo_examen,
        row.perfil,
        row.costo,
      ]);
    });

    // Empty separator row
    sheetData.push([]);

    // Summary rows
    sheetData.push(['Subtotal', '', '', '', '', group.subtotal]);
    sheetData.push(['IGV 18%', '', '', '', '', group.igv]);
    sheetData.push(['Total', '', '', '', '', group.total]);

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Set column widths (approximate)
    worksheet['!cols'] = [
      { wch: 6 }, // Item
      { wch: 30 }, // Nombre
      { wch: 20 }, // Documento
      { wch: 30 }, // Examen
      { wch: 30 }, // Perfil
      { wch: 14 }, // Costo (S/.)
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
