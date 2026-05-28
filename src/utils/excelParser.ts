import * as XLSX from 'xlsx';
import { ExcelRow, Documento, ClienteGroup, DashboardMetrics, MonedaResumen } from '../types';

// Helper to normalize strings for matching headers
function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]/g, ""); // Remove spaces/symbols
}

export function parseExcelData(arrayBuffer: ArrayBuffer): ClienteGroup[] {
  const data = new Uint8Array(arrayBuffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Parse rows as raw JSON objects
  const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });
  
  if (rawRows.length === 0) return [];
  
  // Find column mapping dynamically based on headers
  const sampleRow = rawRows[0];
  const headerKeys = Object.keys(sampleRow);
  
  const keyMap: Record<string, string> = {};
  
  headerKeys.forEach(key => {
    const norm = normalizeHeader(key);
    if (norm === 'cliente') keyMap['cliente'] = key;
    else if (norm === 'razonsocial') keyMap['razonSocial'] = key;
    else if (norm === 'tipodoc') keyMap['tipoDoc'] = key;
    else if (norm === 'serie') keyMap['serie'] = key;
    else if (norm === 'numero') keyMap['numero'] = key;
    else if (norm === 'fecdoc' || norm === 'fechadoc') keyMap['fechaDoc'] = key;
    else if (norm === 'fecven' || norm === 'fechaven' || norm === 'fechavencimiento') keyMap['fechaVen'] = key;
    else if (norm === 'cuenta') keyMap['cuenta'] = key;
    else if (norm === 'mon' || norm === 'moneda') keyMap['moneda'] = key;
    else if (norm === 'debe') keyMap['debe'] = key;
    else if (norm === 'haber') keyMap['haber'] = key;
    else if (norm === 'saldo') keyMap['saldo'] = key;
  });

  const clientsMap: Record<string, { razonSocial: string; documentos: Documento[] }> = {};

  rawRows.forEach((row, index) => {
    // Extract values using dynamic keyMap or fallback to standard names
    const rawCliente = row[keyMap['cliente'] || 'Cliente'];
    if (!rawCliente) return; // Skip empty rows or rows without a client ID
    
    const clienteId = String(rawCliente).trim();
    if (clienteId === "" || clienteId.toLowerCase() === "total" || clienteId.toLowerCase() === "totales") {
      // Skip summary rows if any
      return;
    }
    
    const razonSocial = String(row[keyMap['razonSocial'] || 'Razon Social'] || row['Razón social'] || 'CLIENTE SIN NOMBRE').trim();
    const tipoDoc = String(row[keyMap['tipoDoc'] || 'Tipo Doc'] || '').trim();
    const batchSerie = String(row[keyMap['serie'] || 'Serie'] || '').trim();
    const batchNumero = String(row[keyMap['numero'] || 'Número'] || row['Numero'] || '').trim();
    const fechaDoc = String(row[keyMap['fechaDoc'] || 'Fec. Doc.'] || '').trim();
    const fechaVen = String(row[keyMap['fechaVen'] || 'Fec. Ven.'] || '').trim();
    const cuenta = keyMap['cuenta'] ? String(row[keyMap['cuenta']] || '').trim() : undefined;
    const moneda = String(row[keyMap['moneda'] || 'Mon.'] || 'S/').trim();
    
    // Parse numeric columns safely
    const parseNum = (val: any): number => {
      if (typeof val === 'number') return val;
      if (!val) return 0;
      const clean = String(val).replace(/,/g, '').trim();
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    };
    
    const debe = parseNum(row[keyMap['debe'] || 'Debe']);
    const haber = parseNum(row[keyMap['haber'] || 'Haber']);
    const saldo = parseNum(row[keyMap['saldo'] || 'Saldo']);
    
    const doc: Documento = {
      tipoDoc,
      serie: batchSerie,
      numero: batchNumero,
      fechaDoc,
      fechaVen,
      cuenta,
      moneda,
      debe,
      haber,
      saldo
    };
    
    if (!clientsMap[clienteId]) {
      clientsMap[clienteId] = {
        razonSocial,
        documentos: []
      };
    }
    
    // In case razonSocial is empty in some rows, update it with a non-empty one if found
    if (clientsMap[clienteId].razonSocial === 'CLIENTE SIN NOMBRE' && razonSocial !== 'CLIENTE SIN NOMBRE') {
      clientsMap[clienteId].razonSocial = razonSocial;
    }
    
    clientsMap[clienteId].documentos.push(doc);
  });

  // Group and summarize by client
  const clientGroups: ClienteGroup[] = Object.keys(clientsMap).map(clienteId => {
    const { razonSocial, documentos } = clientsMap[clienteId];
    
    const saldosPorMoneda: Record<string, MonedaResumen> = {};
    
    documentos.forEach(doc => {
      const mon = doc.moneda || 'S/';
      if (!saldosPorMoneda[mon]) {
        saldosPorMoneda[mon] = { debe: 0, haber: 0, saldo: 0 };
      }
      saldosPorMoneda[mon].debe += doc.debe;
      saldosPorMoneda[mon].haber += doc.haber;
      saldosPorMoneda[mon].saldo += doc.saldo;
    });

    // Check if client has a net debt or credit
    let tieneDeuda = false;
    let tieneSaldoFavor = false;
    const saldoTexts: string[] = [];

    Object.keys(saldosPorMoneda).forEach(mon => {
      const { saldo } = saldosPorMoneda[mon];
      // Round to 2 decimal places to prevent float precision issues
      const roundedSaldo = Math.round(saldo * 100) / 100;
      saldosPorMoneda[mon].saldo = roundedSaldo;
      saldosPorMoneda[mon].debe = Math.round(saldosPorMoneda[mon].debe * 100) / 100;
      saldosPorMoneda[mon].haber = Math.round(saldosPorMoneda[mon].haber * 100) / 100;

      if (roundedSaldo > 0.01) {
        tieneDeuda = true;
        saldoTexts.push(`Debe ${mon} ${formatNumber(roundedSaldo)}`);
      } else if (roundedSaldo < -0.01) {
        tieneSaldoFavor = true;
        saldoTexts.push(`Saldo a favor ${mon} ${formatNumber(Math.abs(roundedSaldo))}`);
      }
    });

    const saldoPrincipalTexto = saldoTexts.length > 0 ? saldoTexts.join(" / ") : "Al día";

    return {
      clienteId,
      razonSocial,
      documentos,
      saldosPorMoneda,
      tieneDeuda,
      tieneSaldoFavor: tieneSaldoFavor && !tieneDeuda, // Net status
      saldoPrincipalTexto
    };
  });

  return clientGroups;
}

export function calculateMetrics(groups: ClienteGroup[]): DashboardMetrics {
  let totalClientes = groups.length;
  let clientesDeudores = 0;
  let clientesConSaldoFavor = 0;
  let clientesAlDia = 0;
  
  const deudaTotalPorMoneda: Record<string, number> = {};
  const saldoFavorTotalPorMoneda: Record<string, number> = {};

  groups.forEach(g => {
    let hasDebt = false;
    let hasCredit = false;

    Object.keys(g.saldosPorMoneda).forEach(mon => {
      const { saldo } = g.saldosPorMoneda[mon];
      if (saldo > 0.01) {
        hasDebt = true;
        deudaTotalPorMoneda[mon] = (deudaTotalPorMoneda[mon] || 0) + saldo;
      } else if (saldo < -0.01) {
        hasCredit = true;
        saldoFavorTotalPorMoneda[mon] = (saldoFavorTotalPorMoneda[mon] || 0) + Math.abs(saldo);
      }
    });

    if (hasDebt) {
      clientesDeudores++;
    } else if (hasCredit) {
      clientesConSaldoFavor++;
    } else {
      clientesAlDia++;
    }
  });

  return {
    totalClientes,
    clientesDeudores,
    clientesConSaldoFavor,
    clientesAlDia,
    deudaTotalPorMoneda,
    saldoFavorTotalPorMoneda
  };
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}
