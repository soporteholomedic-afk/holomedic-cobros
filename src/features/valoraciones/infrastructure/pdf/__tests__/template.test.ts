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

  it('declares A4 page sizing so multi-page tables break on @page boundaries', () => {
    const html = buildValoracionHtml(buildInput());
    expect(html).toContain('@page');
    expect(html).toContain('size: A4');
    // Table headers repeat across printed pages.
    expect(html).toContain('display: table-header-group');
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
