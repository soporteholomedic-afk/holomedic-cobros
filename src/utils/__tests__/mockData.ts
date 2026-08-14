import { ClienteGroup } from '../../types';

export const mockClients: ClienteGroup[] = [
  {
    clienteId: '20601234567',
    razonSocial: 'HOLOMEDIC S.A.C.',
    documentos: [
      {
        tipoDoc: 'FE',
        serie: 'F001',
        numero: '101',
        fechaDoc: '01/05/2026',
        fechaVen: '20/05/2026', // Expired compared to current local time of 01/06/2026
        cuenta: '121201',
        moneda: 'S/',
        debe: 1200,
        haber: 200,
        saldo: 1000
      },
      {
        tipoDoc: 'FE',
        serie: 'F001',
        numero: '102',
        fechaDoc: '10/05/2026',
        fechaVen: '10/06/2026',
        cuenta: '121201',
        moneda: 'S/',
        debe: 500,
        haber: 500,
        saldo: 0
      }
    ],
    saldosPorMoneda: {
      'S/': { debe: 1700, haber: 700, saldo: 1000 }
    },
    tieneDeuda: true,
    tieneCredito: false,
    tieneSaldoFavor: false,
    saldoPrincipalTexto: 'Debe S/ 1,000.00',
    facturasCredito: 0,
    facturasAFavor: 0,
    facturasVencidas: 1
  },
  {
    clienteId: '10444555666',
    razonSocial: 'JUAN PEREZ S.A.',
    documentos: [
      {
        tipoDoc: 'BO',
        serie: 'B001',
        numero: '50',
        fechaDoc: '15/05/2026',
        fechaVen: '25/05/2026',
        cuenta: '121301',
        moneda: '$',
        debe: 100,
        haber: 300,
        saldo: -200
      }
    ],
    saldosPorMoneda: {
      '$': { debe: 100, haber: 300, saldo: -200 }
    },
    tieneDeuda: false,
    tieneCredito: false,
    tieneSaldoFavor: true,
    saldoPrincipalTexto: 'Saldo a favor $ 200.00',
    facturasCredito: 0,
    facturasAFavor: 1,
    facturasVencidas: 0
  },
  {
    clienteId: '20111222333',
    razonSocial: 'CLINICA SANTA MARIA S.A.',
    documentos: [
      {
        tipoDoc: 'FA',
        serie: 'F002',
        numero: '888',
        fechaDoc: '20/05/2026',
        fechaVen: '20/06/2026',
        cuenta: '121201',
        moneda: 'S/',
        debe: 450,
        haber: 450,
        saldo: 0
      }
    ],
    saldosPorMoneda: {
      'S/': { debe: 450, haber: 450, saldo: 0 }
    },
    tieneDeuda: false,
    tieneCredito: false,
    tieneSaldoFavor: false,
    saldoPrincipalTexto: 'Al día',
    facturasCredito: 0,
    facturasAFavor: 0,
    facturasVencidas: 0
  },
  {
    clienteId: '20555666777',
    razonSocial: 'FARMACIA SAN JOSE E.I.R.L.',
    documentos: [
      {
        tipoDoc: 'FE',
        serie: 'F003',
        numero: '201',
        fechaDoc: '11/05/2026',
        fechaVen: '11/05/2026', // Same day as Fec. Doc. → contado
        cuenta: '121201',
        moneda: 'S/',
        debe: 125.28,
        haber: 0,
        saldo: 125.28
      },
      {
        tipoDoc: 'FE',
        serie: 'F003',
        numero: '202',
        fechaDoc: '01/05/2026',
        fechaVen: '20/05/2026', // Different day from Fec. Doc. → crédito
        cuenta: '121201',
        moneda: 'S/',
        debe: 400,
        haber: 0,
        saldo: 400
      },
      {
        tipoDoc: 'BO',
        serie: 'B002',
        numero: '55',
        fechaDoc: '05/05/2026',
        fechaVen: '', // No due date → crédito
        cuenta: '121301',
        moneda: '$',
        debe: 50,
        haber: 0,
        saldo: 50
      }
    ],
    saldosPorMoneda: {
      'S/': { debe: 525.28, haber: 0, saldo: 525.28 },
      '$': { debe: 50, haber: 0, saldo: 50 }
    },
    tieneDeuda: true,
    tieneCredito: false,
    tieneSaldoFavor: false,
    saldoPrincipalTexto: 'Debe S/ 525.28 / Debe $ 50.00',
    facturasCredito: 1,
    facturasAFavor: 0,
    facturasVencidas: 2
  }
];
