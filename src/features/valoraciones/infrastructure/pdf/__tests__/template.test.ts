import { describe, expect, it } from 'vitest';

import { makeRepFacturacion } from '../../../domain/fixtures';
import { agruparPorDestino } from '../../../domain/agrupacion';
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
    grupos: agruparPorDestino(
      [
        makeRepFacturacion({ DesDes: 'SEDE NORTE', VVtaMN: 1000, Simbol: 's/.' }),
        makeRepFacturacion({
          DesDes: 'SEDE NORTE',
          VVtaMN: 500,
          DesTCh: 'PERIODICO',
          Simbol: 's/.',
        }),
        makeRepFacturacion({ DesDes: 'SEDE SUR', VVtaMN: 200, Simbol: 's/.' }),
      ],
      1,
    ),
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

  it('renders per-group tables with SubTotal, IGV 18% and Total using the row Simbol', () => {
    const html = buildValoracionHtml(buildInput());
    expect(html).toContain('SEDE NORTE');
    expect(html).toContain('SEDE SUR');
    // SEDE NORTE: 1000 + 500 = 1500 → IGV 270 → Total 1770.
    expect(html).toContain('1,500.00');
    expect(html).toContain('270.00');
    expect(html).toContain('1,770.00');
    // SEDE SUR: 200 → 36 → 236.
    expect(html).toContain('236.00');
    // Amounts carry the row's currency symbol.
    expect(html).toContain('s/.');
  });

  it('declares A4 LANDSCAPE page sizing so 13 wide columns fit (U6)', () => {
    const html = buildValoracionHtml(buildInput());
    expect(html).toContain('@page');
    expect(html).toContain('size: A4 landscape');
    // Table headers repeat across printed pages.
    expect(html).toContain('display: table-header-group');
  });

  it('renders EXACTLY the 13 required columns in the required order (U6)', () => {
    const html = buildValoracionHtml(buildInput());
    const theads = html.split('<thead>').slice(1).map((t) => t.split('</thead>')[0]);
    // One thead per destino group — EVERY group table carries the contract.
    expect(theads.length).toBeGreaterThanOrEqual(2);
    const columnas = (thead: string): string[] =>
      [...thead.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    for (const thead of theads) {
      expect(columnas(thead)).toEqual([
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
        'Solicitado Por',
        'Costos',
        'Doc.Fac',
      ]);
    }
  });

  it('maps the 13 columns from real RepFacturacion fields (U6 mapping)', () => {
    const html = buildValoracionHtml(
      buildInput({
        grupos: agruparPorDestino(
          [
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
          1,
        ),
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
    // ¿Conv.? renders SIGLA's S/N convention.
    expect(html).toMatch(/<td[^>]*>S<\/td>/);
    expect(html).toMatch(/<td[^>]*>N<\/td>/);
    // Costos: moneda-aware venta + Simbol (100 and 50).
    expect(html).toContain('s/. 100.00');
    expect(html).toContain('s/. 50.00');
    // NULL NumDov (Doc.Fac) renders empty, not "null".
    expect(html).not.toContain('>null<');
  });

  it('escapes HTML-sensitive characters in dynamic values', () => {
    const html = buildValoracionHtml(
      buildInput({
        cliente: { nombre: 'ACME <CORP> & "HIJOS"', ruc: '' },
        grupos: agruparPorDestino(
          [makeRepFacturacion({ DesDes: 'NORTE & SUR', Pacien: 'PÉREZ <PAC>' })],
          1,
        ),
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
