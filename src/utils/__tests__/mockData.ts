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
    tieneSaldoFavor: false,
    saldoPrincipalTexto: 'Debe S/ 1,000.00'
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
    tieneSaldoFavor: true,
    saldoPrincipalTexto: 'Saldo a favor $ 200.00'
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
    tieneSaldoFavor: false,
    saldoPrincipalTexto: 'Al día'
  }
];
