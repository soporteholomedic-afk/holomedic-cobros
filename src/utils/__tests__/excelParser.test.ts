import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelData, calculateMetrics, formatNumber } from '../excelParser';
import { ClienteGroup } from '../../types';

describe('formatNumber', () => {
  it('debe formatear números correctamente según el locale es-PE', () => {
    const expectedValue = new Intl.NumberFormat('es-PE', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).format(1234.56);
    
    expect(formatNumber(1234.56)).toBe(expectedValue);
    expect(formatNumber(0)).toBe(new Intl.NumberFormat('es-PE', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).format(0));
  });
});

describe('calculateMetrics', () => {
  it('debe calcular métricas del panel correctamente para un grupo de clientes mixto', () => {
    const mockGroups: ClienteGroup[] = [
      {
        clienteId: '20601234567',
        razonSocial: 'HOLOMEDIC SAC',
        documentos: [],
        saldosPorMoneda: {
          'S/': { debe: 1500, haber: 500, saldo: 1000 }
        },
        tieneDeuda: true,
        tieneSaldoFavor: false,
        saldoPrincipalTexto: 'Debe S/ 1,000.00'
      },
      {
        clienteId: '10444555666',
        razonSocial: 'JUAN PEREZ S.A.',
        documentos: [],
        saldosPorMoneda: {
          '$': { debe: 100, haber: 300, saldo: -200 }
        },
        tieneDeuda: false,
        tieneSaldoFavor: true,
        saldoPrincipalTexto: 'Saldo a favor $ 200.00'
      },
      {
        clienteId: '20111222333',
        razonSocial: 'EMPRESA AL DIA SRL',
        documentos: [],
        saldosPorMoneda: {
          'S/': { debe: 100, haber: 100, saldo: 0 }
        },
        tieneDeuda: false,
        tieneSaldoFavor: false,
        saldoPrincipalTexto: 'Al día'
      }
    ];

    const metrics = calculateMetrics(mockGroups);
    expect(metrics.totalClientes).toBe(3);
    expect(metrics.clientesDeudores).toBe(1);
    expect(metrics.clientesConSaldoFavor).toBe(1);
    expect(metrics.clientesAlDia).toBe(1);
    expect(metrics.deudaTotalPorMoneda['S/']).toBe(1000);
    expect(metrics.saldoFavorTotalPorMoneda['$']).toBe(200);
  });
});

describe('parseExcelData', () => {
  it('debe parsear y agrupar la data de un buffer Excel simulado', () => {
    // Generar un archivo excel en memoria usando la misma librería xlsx
    const mockRows = [
      {
        'Cliente': '20601234567',
        'Razón social': 'HOLOMEDIC S.A.C.',
        'Tipo Doc': 'FE',
        'Serie': 'F001',
        'Número': '101',
        'Fec. Doc.': '01/05/2026',
        'Fec. Ven.': '30/05/2026',
        'Mon.': 'S/',
        'Debe': 1200,
        'Haber': 200,
        'Saldo': 1000
      },
      {
        'Cliente': '20601234567',
        'Razón social': 'HOLOMEDIC S.A.C.',
        'Tipo Doc': 'FE',
        'Serie': 'F001',
        'Número': '102',
        'Fec. Doc.': '05/05/2026',
        'Fec. Ven.': '05/06/2026',
        'Mon.': 'S/',
        'Debe': 500,
        'Haber': 500,
        'Saldo': 0
      },
      {
        'Cliente': '10444555666',
        'Razón social': 'JUAN PEREZ S.A.',
        'Tipo Doc': 'BO',
        'Serie': 'B001',
        'Número': '50',
        'Fec. Doc.': '10/05/2026',
        'Fec. Ven.': '25/05/2026',
        'Mon.': '$',
        'Debe': 0,
        'Haber': 300,
        'Saldo': -300
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(mockRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Saldos');
    
    // Obtener ArrayBuffer de la escritura del archivo
    const arrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    
    const parsedData = parseExcelData(arrayBuffer);
    
    expect(parsedData).toHaveLength(2);
    
    const holomedic = parsedData.find(c => c.clienteId === '20601234567');
    expect(holomedic).toBeDefined();
    expect(holomedic?.razonSocial).toBe('HOLOMEDIC S.A.C.');
    expect(holomedic?.documentos).toHaveLength(2);
    expect(holomedic?.saldosPorMoneda['S/'].saldo).toBe(1000);
    expect(holomedic?.tieneDeuda).toBe(true);
    expect(holomedic?.tieneSaldoFavor).toBe(false);
    
    const juanPerez = parsedData.find(c => c.clienteId === '10444555666');
    expect(juanPerez).toBeDefined();
    expect(juanPerez?.saldosPorMoneda['$'].saldo).toBe(-300);
    expect(juanPerez?.tieneDeuda).toBe(false);
    expect(juanPerez?.tieneSaldoFavor).toBe(true);
  });

  it('debe saltar filas vacías o filas de totalizadores', () => {
    const mockRows = [
      { 'Cliente': 'TOTAL', 'Razón social': 'TOTAL GENERAL', 'Saldo': 1000 },
      { 'Cliente': 'totales', 'Razón social': 'TOTAL GENERAL', 'Saldo': 1000 },
      { 'Cliente': '', 'Razón social': 'Vacío', 'Saldo': 1000 },
      { 'Cliente': '12345678', 'Razón social': 'Cliente Valido', 'Mon.': 'S/', 'Saldo': 100 }
    ];

    const worksheet = XLSX.utils.json_to_sheet(mockRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Saldos');
    const arrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    
    const parsedData = parseExcelData(arrayBuffer);
    expect(parsedData).toHaveLength(1);
    expect(parsedData[0].clienteId).toBe('12345678');
  });
});
