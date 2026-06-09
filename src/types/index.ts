export interface ExcelRow {
  Cliente: string | number;
  "Razon Social"?: string;
  "Razón social"?: string; // Support variations
  "Tipo Doc": string;
  Serie: string;
  "Número": string | number;
  "Fec. Doc.": string;
  "Fec. Ven.": string;
  Cuenta?: string | number;
  "Mon.": string;
  Debe: number | string;
  Haber: number | string;
  Saldo: number | string;
}

export interface Documento {
  tipoDoc: string;
  serie: string;
  numero: string;
  fechaDoc: string;
  fechaVen: string;
  cuenta?: string;
  moneda: string;
  debe: number;
  haber: number;
  saldo: number;
}

export interface MonedaResumen {
  debe: number;
  haber: number;
  saldo: number; // Positive is debt, negative is credit
}

export interface ClienteGroup {
  clienteId: string; // RUC/DNI (column 'Cliente')
  razonSocial: string;
  documentos: Documento[];
  saldosPorMoneda: Record<string, MonedaResumen>;
  // Flags for status
  tieneDeuda: boolean;       // Has overdue invoices (past due date with positive balance)
  tieneCredito: boolean;     // Has debt but NOT yet overdue (due date in the future)
  tieneSaldoFavor: boolean;
  saldoPrincipalTexto: string; // Preformatted text e.g., "Debe S/ 1,200.00" or "Saldo a favor US$ 50.00"
  // Invoice counts by status
  facturasCredito: number;   // Invoices with positive balance, not yet due
  facturasAFavor: number;    // Invoices with zero or negative balance (paid/credit notes)
  facturasVencidas: number;  // Invoices with positive balance, past due date
}

// Envío de Resultados — domain types
export type { SpitchType } from '@/features/envio-resultados/domain/entities';
export type {
  Company,
  Patient,
  PatientFile,
  Spitch,
  EmailAttachment,
} from '@/features/envio-resultados/domain/entities';

// Consolidados — SP result types
export type {
  SpResultRow,
  WorkerRow,
  CompanyGroup,
} from './sp-result';

export interface DashboardMetrics {
  totalClientes: number;
  clientesDeudores: number;
  clientesConSaldoFavor: number;
  clientesAlDia: number;
  deudaTotalPorMoneda: Record<string, number>;
  saldoFavorTotalPorMoneda: Record<string, number>;
}
