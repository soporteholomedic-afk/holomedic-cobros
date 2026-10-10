import { describe, expect, it } from 'vitest';

import type { RepFacturacion } from '../../../domain/entities';
import { makeRepFacturacion } from '../../../domain/fixtures';
import {
  MEMBRETE_HOLOMEDIC,
  buildValoracionHtml,
  type ValoracionPdfInput,
} from '../template';

function buildInput(overrides: Partial<ValoracionPdfInput> = {}): ValoracionPdfInput {
  return {
    logoDataUri: 'data:image/png;base64,QUJD',
    membrete: MEMBRETE_HOLOMEDIC,
    cliente: { nombre: 'EMPRESA DEMO S.A.C.', ruc: '20512345678' },
    fecIni: '2026-01-01',
    fecFin: '2026-01-31',
    moneda: 'SOLES',
    fechaEmision: '27/08/2026',
    rows: [
      makeRepFacturacion({ DesDes: 'SEDE NORTE', VVtaMN: 1000, Simbol: 's/.' }),
      makeRepFacturacion({
        DesDes: 'SEDE NORTE',
        VVtaMN: 500,
        DesTCh: 'PERIODICO',
        Simbol: 's/.',
      }),
      makeRepFacturacion({ DesDes: 'SEDE SUR', VVtaMN: 200, Simbol: 's/.' }),
    ],
    ...overrides,
  };
}

describe('buildValoracionHtml', () => {
  it('renders the membrete: logo data-URI, company name and RUC', () => {
    const html = buildValoracionHtml(buildInput());
    expect(html).toContain('data:image/png;base64,QUJD');
    expect(html).toContain('HOLOMEDIC SERVICIOS INTEGRALES S.A.C.');
    expect(html).toContain('RUC: 20556200328');
  });

  it('renders the header: client + RUC, period, moneda and emission date', () => {
    const html = buildValoracionHtml(buildInput());
    expect(html).toContain('EMPRESA DEMO S.A.C.');
    expect(html).toContain('20512345678');
    expect(html).toContain('01/01/2026');
    expect(html).toContain('31/01/2026');
    expect(html).toContain('SOLES');
    expect(html).toContain('27/08/2026');
  });

  it('renders ONE global footer with SubTotal, IGV 18% and Total over ALL rows', () => {
    const html = buildValoracionHtml(buildInput());
    // 1000 + 500 + 200 = 1700 → IGV 306 → Total 2,006 (single table, Opción A).
    expect(html).toContain('1,700.00');
    expect(html).toContain('306.00');
    expect(html).toContain('2,006.00');
    // Amounts carry the row's currency symbol.
    expect(html).toContain('s/.');
    // Exactly one footer block in the whole document.
    expect(html.split('<tfoot>')).toHaveLength(2);
  });

  it('renders each row’s destino as a cell value', () => {
    const html = buildValoracionHtml(buildInput());
    expect(html).toMatch(/<td[^>]*>SEDE NORTE<\/td>/);
    expect(html).toMatch(/<td[^>]*>SEDE SUR<\/td>/);
  });

  it('renders NO per-destino headings (single continuous table, Opción A)', () => {
    const html = buildValoracionHtml(buildInput());
    expect(html).not.toContain('<h2');
  });

  it('declares A4 LANDSCAPE page sizing so 14 wide columns fit (U6)', () => {
    const html = buildValoracionHtml(buildInput());
    expect(html).toContain('@page');
    expect(html).toContain('size: A4 landscape');
    // Table headers repeat across printed pages.
    expect(html).toContain('display: table-header-group');
  });

  it('renders EXACTLY ONE thead with the 14 required columns in order (U6 + Destino)', () => {
    const html = buildValoracionHtml(buildInput());
    const theads = html.split('<thead>').slice(1).map((t) => t.split('</thead>')[0]);
    expect(theads).toHaveLength(1);
    const columnas = [...theads[0].matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(columnas).toEqual([
      'N°. Ficha',
      'Doc. Iden',
      '¿Conv.?',
      'N° Conv',
      'Nombres',
      'Ocupación',
      'Fecha examen',
      'Tipo examen',
      'CR',
      'Anexo 7D',
      'Destino',
      'Solicitado Por',
      'Costos',
      'Doc.Fac',
    ]);
  });

  it('maps the 14 columns from real RepFacturacion fields (U6 mapping)', () => {
    const html = buildValoracionHtml(
      buildInput({
        rows: [
          makeRepFacturacion({
            DesDes: 'SEDE NORTE',
            IdAten: '000123',
            ItemEx: 4,
            NroDId: 'DNI 46145583',
            IndCon: true,
            IdConv: 'C-777',
            Pacien: 'CANCINO CUEVA NOELIA',
            DesPue: 'ANALISTA',
            FecAte: '2026-01-15T00:00:00.000Z',
            DesTCh: 'PREOCUPACIONAL',
            CenCos: 'CC-001',
            Anex7D: 'S',
            Solici: 'SOLICITANTE DEMO',
            VVtaMN: 100,
            Simbol: 's/.',
            NumDov: 45678,
          }),
          makeRepFacturacion({
            DesDes: 'SEDE NORTE',
            IndCon: false,
            NumDov: null,
            Pacien: 'SIN FACTURA PAC',
            VVtaMN: 50,
            Simbol: 's/.',
          }),
        ],
      }),
    );
    // Row 1: every mapped cell present.
    expect(html).toContain('000123 - 4');
    expect(html).toContain('DNI 46145583');
    expect(html).toContain('C-777');
    expect(html).toContain('CANCINO CUEVA NOELIA');
    expect(html).toContain('ANALISTA');
    expect(html).toContain('15/01/2026');
    expect(html).toContain('PREOCUPACIONAL');
    expect(html).toContain('CC-001');
    expect(html).toContain('SOLICITANTE DEMO');
    expect(html).toContain('45678');
    // Destino column mapped from DesDes (after CR/Anexo 7D per the contract).
    expect(html).toMatch(/<td[^>]*>SEDE NORTE<\/td>/);
    // ¿Conv.? renders SIGLA's S/N convention.
    expect(html).toMatch(/<td[^>]*>S<\/td>/);
    expect(html).toMatch(/<td[^>]*>N<\/td>/);
    // Costos: moneda-aware venta + Simbol (100 and 50).
    expect(html).toContain('s/. 100.00');
    expect(html).toContain('s/. 50.00');
    // NULL NumDov (Doc.Fac) renders empty, not "null".
    expect(html).not.toContain('>null<');
  });

  it('renders SIN DESTINO when DesDes is blank (same semantics as the grouping)', () => {
    const rows: RepFacturacion[] = [
      makeRepFacturacion({ DesDes: '', VVtaMN: 10 }),
      makeRepFacturacion({ DesDes: '   ', VVtaMN: 20 }),
    ];
    const html = buildValoracionHtml(buildInput({ rows }));
    expect(html.match(/<td[^>]*>SIN DESTINO<\/td>/g)).toHaveLength(2);
  });

  it('escapes HTML-sensitive characters in dynamic values', () => {
    const html = buildValoracionHtml(
      buildInput({
        cliente: { nombre: 'ACME <CORP> & "HIJOS"', ruc: '' },
        rows: [makeRepFacturacion({ DesDes: 'NORTE & SUR', Pacien: 'PÉREZ <PAC>' })],
      }),
    );
    expect(html).not.toContain('ACME <CORP>');
    expect(html).toContain('ACME &lt;CORP&gt; &amp; &quot;HIJOS&quot;');
    expect(html).toContain('NORTE &amp; SUR');
    expect(html).toContain('PÉREZ &lt;PAC&gt;');
  });

  it('renders a clientless header without RUC (empty-client queries are valid)', () => {
    const html = buildValoracionHtml(buildInput({ cliente: null }));
    expect(html).toContain('VALORIZACI'); // document title still present
    expect(html).not.toContain('RUC del cliente');
  });

  it('renders optional membrete address/phone only when provided', () => {
    const sinContacto = buildValoracionHtml(
      buildInput({ membrete: { nombre: 'H', ruc: 'R' } }),
    );
    expect(sinContacto).not.toContain('Dirección');
    const conContacto = buildValoracionHtml(
      buildInput({
        membrete: { nombre: 'H', ruc: 'R', direccion: 'AV. LOS PINOS 123', telefono: '(01) 555-5555' },
      }),
    );
    expect(conContacto).toContain('AV. LOS PINOS 123');
    expect(conContacto).toContain('(01) 555-5555');
  });
});
