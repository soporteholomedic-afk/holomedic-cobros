import { describe, expect, it } from 'vitest';

import { parseExportFiltroDto, parseEmpresaField, parseFiltroDto } from '../parseFiltroDto';

/**
 * U6 per-empresa export scoping: the export/send bodies may carry an
 * `empresa` field (the EmpresaList group key — `NomCFa` falling back to
 * `NomCli`). The routes re-query from the filter (D4 kept) and then scope
 * rows in memory by that group key.
 */

const filtroValido = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
};

// ---- ocultarCero flag (filtro-valores-cero, spec S12/S13) ----

describe('parseFiltroDto — ocultarCero', () => {
  it('defaults to false when absent and passes true/false through', () => {
    const absent = parseFiltroDto(filtroValido);
    expect(absent.error).toBeUndefined();
    expect(absent.filtro?.ocultarCero).toBe(false);

    const on = parseFiltroDto({ ...filtroValido, ocultarCero: true });
    expect(on.filtro?.ocultarCero).toBe(true);

    const off = parseFiltroDto({ ...filtroValido, ocultarCero: false });
    expect(off.filtro?.ocultarCero).toBe(false);
  });

  it('rejects non-boolean values with an error mentioning ocultarCero (S13)', () => {
    expect(parseFiltroDto({ ...filtroValido, ocultarCero: 'x' }).error).toContain('ocultarCero');
    expect(parseFiltroDto({ ...filtroValido, ocultarCero: 1 }).error).toContain('ocultarCero');
  });

  it('parseExportFiltroDto carries the flag through identically (S12/S13)', () => {
    const on = parseExportFiltroDto({ ...filtroValido, ocultarCero: true });
    expect(on.error).toBeUndefined();
    expect(on.filtro?.ocultarCero).toBe(true);

    const absent = parseExportFiltroDto({ ...filtroValido });
    expect(absent.filtro?.ocultarCero).toBe(false);

    const invalido = parseExportFiltroDto({ ...filtroValido, ocultarCero: 'si' });
    expect(invalido.filtro).toBeUndefined();
    expect(invalido.error).toContain('ocultarCero');
  });
});

describe('parseEmpresaField', () => {
  it('returns undefined for absent/null (global export scope)', () => {
    expect(parseEmpresaField(undefined)).toEqual({ empresa: undefined });
    expect(parseEmpresaField(null)).toEqual({ empresa: undefined });
  });

  it('trims and returns a valid empresa name', () => {
    expect(parseEmpresaField('  EMPRESA DEMO S.A.C. ')).toEqual({
      empresa: 'EMPRESA DEMO S.A.C.',
    });
  });

  it('rejects non-strings, empty/whitespace-only and oversized values', () => {
    expect(parseEmpresaField(55).error).toBeDefined();
    expect(parseEmpresaField('').error).toBeDefined();
    expect(parseEmpresaField('   ').error).toBeDefined();
    expect(parseEmpresaField('X'.repeat(201)).error).toBeDefined();
    expect(parseEmpresaField('X'.repeat(200)).empresa).toBe('X'.repeat(200));
  });
});

describe('parseExportFiltroDto', () => {
  it('parses the filter and the empresa scope together', () => {
    const { filtro, empresa, error } = parseExportFiltroDto({
      ...filtroValido,
      empresa: 'EMPRESA DEMO S.A.C.',
    });
    expect(error).toBeUndefined();
    expect(filtro).toMatchObject({ fecIni: '2026-01-01', codMon: 1 });
    expect(empresa).toBe('EMPRESA DEMO S.A.C.');
  });

  it('works without empresa (global export, legacy scope)', () => {
    const { filtro, empresa, error } = parseExportFiltroDto(filtroValido);
    expect(error).toBeUndefined();
    expect(filtro?.fecFin).toBe('2026-01-31');
    expect(empresa).toBeUndefined();
  });

  it('still rejects an invalid filter even when empresa is valid', () => {
    const { filtro, error } = parseExportFiltroDto({
      ...filtroValido,
      fecIni: '2026-03-01',
      empresa: 'X',
    });
    expect(filtro).toBeUndefined();
    expect(error).toBeDefined();
  });

  it('rejects an invalid empresa with a 400-ready error', () => {
    const { filtro, error } = parseExportFiltroDto({ ...filtroValido, empresa: 12 });
    expect(filtro).toBeUndefined();
    expect(error).toContain('empresa');
  });
});
