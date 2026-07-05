/**
 * Area configuration registry for the plantillas editor (v1: code registry).
 *
 * Each `AreaConfig` declares the token palette, predefined tables, and mock
 * preview data for one area. Only `consolidados` is registered in v1;
 * `cobranza` and `valoraciones` are reserved (product decision #5) but NOT
 * populated — `getAreaConfig` returns `undefined` for them, and the
 * `/admin/plantillas/[area]` Server Component calls `notFound()` (PR 3).
 *
 * The `mockPreviewData` shape mirrors the fields the interpolation context
 * (PR 4) consumes; PR 4 will formalise `InterpolationContext` and this
 * shape is assignable to it.
 */

/** A column of a predefined table that a `{{tabla:name:cols}}` token can select. */
export interface TableColumn {
  key: string;
  label: string;
}

/** A predefined table a table-token can reference via `TokenDef.tableRef`. */
export interface PredefinedTable {
  name: string;
  label: string;
  columns: TableColumn[];
}

/** A single token in a category of the palette. */
export interface TokenDef {
  /** Resolver key — `{{key}}` for simple tokens, `tabla` for table tokens. */
  key: string;
  /** Human label shown on the chip. */
  label: string;
  /** `true` for table tokens (open the column picker on click). */
  isTable?: boolean;
  /** When `isTable`, the `PredefinedTable.name` this token inserts. */
  tableRef?: string;
}

/** A grouped set of tokens in the palette (e.g. "Empresa", "Firma", "Tablas"). */
export interface TokenCategory {
  category: string;
  tokens: TokenDef[];
}

/**
 * Mock data for the editor's live preview. Field names mirror the
 * interpolation context so the preview renders identically to the send flow.
 */
export interface MockPreviewData {
  companyName: string;
  patientNames: string[];
  fileNames: string[];
  firma: string;
  area: string;
  today: string;
}

/** The full configuration for one area. */
export interface AreaConfig {
  area: string;
  label: string;
  availableTokens: TokenCategory[];
  predefinedTables: PredefinedTable[];
  mockPreviewData: MockPreviewData;
}

/**
 * The consolidados area config. Tokens: company name, today's date, the
 * email signature, and two predefined tables (overdue documents + patient
 * exams). Mock preview data lets the editor render a realistic preview
 * without hitting any real data source.
 */
const CONSOLIDADOS_CONFIG: AreaConfig = {
  area: 'consolidados',
  label: 'Consolidados',
  availableTokens: [
    {
      category: 'Empresa',
      tokens: [
        { key: 'empresa', label: 'Empresa' },
        { key: 'fecha', label: 'Fecha' },
      ],
    },
    {
      category: 'Firma',
      tokens: [{ key: 'firma', label: 'Firma' }],
    },
    {
      category: 'Tablas',
      tokens: [
        {
          key: 'tabla',
          label: 'Documentos vencidos',
          isTable: true,
          tableRef: 'documentosVencidos',
        },
        {
          key: 'tabla',
          label: 'Exámenes',
          isTable: true,
          tableRef: 'examenes',
        },
      ],
    },
  ],
  predefinedTables: [
    {
      name: 'documentosVencidos',
      label: 'Documentos vencidos',
      columns: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'monto', label: 'Monto' },
        { key: 'paciente', label: 'Paciente' },
      ],
    },
    {
      name: 'examenes',
      label: 'Exámenes',
      columns: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'nombre', label: 'Examen' },
        { key: 'resultado', label: 'Resultado' },
      ],
    },
  ],
  mockPreviewData: {
    companyName: 'Clínica Demo S.A.',
    patientNames: ['Juan Pérez', 'María Gómez'],
    fileNames: ['Informe-consolidado.pdf'],
    firma: '<p>Dr. Pérez — Clínica Demo S.A.</p>',
    area: 'consolidados',
    today: '2026-01-15',
  },
};

/**
 * The v1 area registry. Only `consolidados` is populated; `cobranza` and
 * `valoraciones` are reserved (decision #5) but intentionally absent.
 */
export const AREA_CONFIGS: ReadonlyMap<string, AreaConfig> = new Map([
  ['consolidados', CONSOLIDADOS_CONFIG],
]);

/**
 * Resolve the `AreaConfig` for an area string.
 * @returns the config, or `undefined` for an unregistered area (the caller
 *   — the page Server Component or the API route — decides how to reject:
 *   `notFound()` 404 for the page, 400 `VALIDATION_ERROR` for the API).
 */
export function getAreaConfig(area: string): AreaConfig | undefined {
  return AREA_CONFIGS.get(area);
}
