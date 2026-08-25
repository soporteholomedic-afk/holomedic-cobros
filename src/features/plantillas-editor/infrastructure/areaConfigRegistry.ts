/**
 * Area configuration registry for the plantillas editor (code registry).
 *
 * Each `AreaConfig` declares the token palette, predefined tables, and mock
 * preview data for one area. `consolidados` (v1) and `cobranza` (REQ-01
 * DIR-04) are registered; `valoraciones` remains reserved (product
 * decision #5) but NOT populated — `getAreaConfig` returns `undefined`
 * for it.
 *
 * The `mockPreviewData` shape mirrors the fields the interpolation context
 * consumes; the cobranza-specific fields are OPTIONAL so consolidados
 * mocks stay assignable without them (back-compat widening, REQ-01 D12).
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
 * One row of the cobranza `documentosPendientes` mock table. Mirrors the
 * pre-formatted row shape the interpolation context carries (deliberate
 * mirror, no cross-feature import — same approach as the other fields).
 */
export interface DocumentoPendienteMockRow {
  fecha: string;
  factura: string;
  monto: string;
  saldo: string;
}

/** One row of the cobranza `tabla-cobranza` mock table (deliberate mirror, no cross-feature import). */
export interface TablaCobranzaMockRow {
  cliente: string; razonSocial: string; tipoDoc: string; serie: string; numero: string;
  fechaDoc: string; fechaVen: string; moneda: string; debe: string; haber: string; saldo: string;
  diasVencidos: string;
}

/**
 * Mock data for the editor's live preview. Field names mirror the
 * interpolation context so the preview renders identically to the send flow.
 *
 * The cobranza fields are OPTIONAL: only the cobranza area fills them, and
 * their values are pre-formatted strings (the client formats numbers; the
 * token resolvers stay dumb escape-and-emit).
 */
export interface MockPreviewData {
  companyName: string;
  patientNames: string[];
  fileNames: string[];
  firma: string;
  area: string;
  today: string;
  pacienteDni: string;
  pacienteNombre: string;
  /** Proyecto / Destino of the first patient/ficha (mirrors `InterpolationContext.destino`). */
  destino: string;
  /** Cobranza: client RUC / DNI key. */
  ruc?: string;
  /** Cobranza: pre-formatted main-currency total (e.g. 'S/ 12,345.67'). */
  montoTotal?: string;
  /** Cobranza: main currency code (e.g. 'PEN'). */
  moneda?: string;
  /** Cobranza: days of the oldest overdue document. */
  diasVencidos?: string;
  /** Cobranza: institutional bank-accounts HTML (buildCuentasBancariasHtml source). */
  cuentasBancariasHtml?: string;
  /** Cobranza: pending-documents table rows (pre-formatted monto/saldo with currency). */
  documentosPendientes?: DocumentoPendienteMockRow[];
  /** Cobranza: full cobranza-table rows for `tabla-cobranza` (12 pre-formatted fields). */
  tablaCobranza?: TablaCobranzaMockRow[];
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
      category: 'Paciente',
      tokens: [
        { key: 'dni', label: 'DNI' },
        { key: 'nombrePaciente', label: 'Nombre Paciente' },
        { key: 'listaPacientes', label: 'Lista de Pacientes' },
        { key: 'destino', label: 'Proyecto / Destino' },
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
    pacienteDni: '12345678',
    pacienteNombre: 'Juan Pérez',
    destino: 'Proyecto Cardio — Centro Médico',
  },
};

/**
 * The cobranza area config (REQ-01 DIR-04). Tokens: company identity +
 * date, debt summary (main-currency total, currency, overdue days, bank
 * accounts), signature, and the pending-documents table. Mock preview
 * data fills the optional cobranza fields with realistic values so the
 * editor preview renders without hitting any real data source.
 */
const COBRANZA_CONFIG: AreaConfig = {
  area: 'cobranza',
  label: 'Cobranza',
  availableTokens: [
    {
      category: 'Empresa',
      tokens: [
        { key: 'empresa', label: 'Empresa' },
        { key: 'ruc', label: 'RUC' },
        { key: 'fecha', label: 'Fecha' },
      ],
    },
    {
      category: 'Deuda',
      tokens: [
        { key: 'montoTotal', label: 'Monto Total' },
        { key: 'moneda', label: 'Moneda' },
        { key: 'diasVencidos', label: 'Días Vencidos' },
        { key: 'cuentasBancarias', label: 'Cuentas Bancarias' },
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
          label: 'Documentos pendientes',
          isTable: true,
          tableRef: 'documentosPendientes',
        },
        {
          key: 'tabla',
          label: 'Tabla de cobranza',
          isTable: true,
          tableRef: 'tabla-cobranza',
        },
      ],
    },
  ],
  predefinedTables: [
    {
      name: 'documentosPendientes',
      label: 'Documentos pendientes',
      columns: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'factura', label: 'Factura' },
        { key: 'monto', label: 'Monto' },
        { key: 'saldo', label: 'Saldo' },
      ],
    },
    {
      name: 'tabla-cobranza',
      label: 'Tabla de cobranza',
      columns: [
        { key: 'cliente', label: 'Cliente' }, { key: 'razonSocial', label: 'Razón Social' },
        { key: 'tipoDoc', label: 'Tipo Doc' }, { key: 'serie', label: 'Serie' }, { key: 'numero', label: 'Numero' },
        { key: 'fechaDoc', label: 'Fec. Doc.' }, { key: 'fechaVen', label: 'Fec. Ven' }, { key: 'moneda', label: 'Mon' },
        { key: 'debe', label: 'Debe' }, { key: 'haber', label: 'Haber' }, { key: 'saldo', label: 'Saldo' },
        { key: 'diasVencidos', label: 'Días Venc.' },
      ],
    },
  ],
  mockPreviewData: {
    // Patient-shaped base fields kept per the MockPreviewData contract —
    // cobranza templates never use them, so they carry empty/neutral values.
    companyName: 'EMPRESA DEMO S.A.C.',
    patientNames: [],
    fileNames: [],
    firma: '<p>Departamento de Cobranzas — HOLOMEDIC SERVICIOS INTEGRALES S.A.C.</p>',
    area: 'cobranza',
    today: '2026-01-15',
    pacienteDni: '',
    pacienteNombre: '',
    destino: '',
    // Cobranza preview fields (optional on MockPreviewData).
    ruc: '20123456789',
    montoTotal: 'S/ 12,345.67',
    moneda: 'PEN',
    diasVencidos: '45',
    cuentasBancariasHtml:
      '<div style="margin-top: 15px; padding: 12px 15px; background-color: #f5f5f5; border-left: 3px solid #003366; font-size: 12px; line-height: 1.7;"><p style="font-size: 14px; font-weight: bold; color: #003366; margin-bottom: 8px;">DATOS PARA EL PAGO</p><p style="margin: 2px 0;">&bull; Banco Scotiabank &ndash; Cuenta Corriente (Soles): 000-1771370</p></div>',
    documentosPendientes: [
      { fecha: '15/11/2025', factura: 'FE F001-101', monto: 'S/ 1,200.00', saldo: 'S/ 1,000.00' },
      { fecha: '02/12/2025', factura: 'BO B001-50', monto: 'S/ 450.00', saldo: 'S/ 250.00' },
    ],
    // tabla-cobranza mocks: reuse the mock doc identities + one USD row; 'S/' mirrors Documento.moneda (not 'PEN').
    // diasVencidos story as of ~15/12/2025: F001-101 (ven 15/11) a month
    // overdue, B001-50 (ven 02/12) ~two weeks, F002-77 (ven 20/12) not yet due.
    tablaCobranza: [
      { cliente: '20123456789', razonSocial: 'EMPRESA DEMO S.A.C.', tipoDoc: 'FE', serie: 'F001', numero: '101', fechaDoc: '01/11/2025', fechaVen: '15/11/2025', moneda: 'S/', debe: 'S/ 1,200.00', haber: 'S/ 0.00', saldo: 'S/ 1,000.00', diasVencidos: '30' },
      { cliente: '20123456789', razonSocial: 'EMPRESA DEMO S.A.C.', tipoDoc: 'BO', serie: 'B001', numero: '50', fechaDoc: '20/11/2025', fechaVen: '02/12/2025', moneda: 'S/', debe: 'S/ 450.00', haber: 'S/ 0.00', saldo: 'S/ 250.00', diasVencidos: '13' },
      { cliente: '20123456789', razonSocial: 'EMPRESA DEMO S.A.C.', tipoDoc: 'FE', serie: 'F002', numero: '77', fechaDoc: '05/12/2025', fechaVen: '20/12/2025', moneda: 'US$', debe: 'US$ 60.00', haber: 'US$ 0.00', saldo: 'US$ 50.00', diasVencidos: '0' },
    ],
  },
};

/**
 * The area registry. `consolidados` (v1) and `cobranza` (REQ-01 DIR-04)
 * are populated; `valoraciones` is reserved (decision #5) but intentionally
 * absent.
 */
export const AREA_CONFIGS: ReadonlyMap<string, AreaConfig> = new Map([
  ['consolidados', CONSOLIDADOS_CONFIG],
  ['cobranza', COBRANZA_CONFIG],
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
