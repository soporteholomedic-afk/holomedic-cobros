import fs from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeRepFacturacion } from '../../domain/fixtures';
import type { ISiglaValoracionesRepository } from '../../domain/ports';
import type { ValoracionesFilter } from '../../domain/entities';

/**
 * Unit tests for the shared client-header resolver (change: flat list —
 * design §1). The resolver owns the client fallback chain used verbatim
 * by BOTH the PDF renderer and the Excel route wiring:
 * `empresa ?? lookup(codCli).catch→null ?? firstRow(NomCFa || NomCli)`,
 * returning null when no name source exists. Also owns the emission-date
 * formatter and the cached logo reader (Buffer | null degradation).
 */

const FILTRO_BASE: ValoracionesFilter = {
  fecIni: '2026-01-01',
  fecFin: '2026-01-31',
  codMon: 1,
  indFac: 0,
  inFsta: false,
};

function makeRepo(
  buscarClientePorCodigo: ISiglaValoracionesRepository['buscarClientePorCodigo'] = vi.fn(),
): ISiglaValoracionesRepository {
  return {
    buscarValoraciones: vi.fn(),
    buscarConsolidado: vi.fn(),
    buscarClientes: vi.fn(),
    buscarClientePorCodigo,
    buscarPacientes: vi.fn(),
    buscarDestinos: vi.fn(),
    buscarTiposTrabajador: vi.fn(),
    buscarSedes: vi.fn(),
  } as unknown as ISiglaValoracionesRepository;
}

describe('resolveClienteCabecera — fallback chain (spec R1)', () => {
  it('the scoped empresa wins the name while keeping the looked-up RUC (U6 + OQ-3)', async () => {
    const { resolveClienteCabecera } = await import('../clientHeaderResolver');
    const lookup = vi.fn().mockResolvedValue({ codCli: 55, nomCom: 'EMPRESA DEL LOOKUP', nroRuc: '20512345678' });
    const repo = makeRepo(lookup);
    const todas = [makeRepFacturacion({ NomCFa: 'PRIMERA FILA S.A.C.' })];

    const cliente = await resolveClienteCabecera(repo, { ...FILTRO_BASE, codCli: 55 }, 'EMPRESA SCOPED S.R.L.', todas);

    expect(cliente).toEqual({ nombre: 'EMPRESA SCOPED S.R.L.', ruc: '20512345678' });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(55);
  });

  it('uses the lookup name + RUC when no empresa is scoped (lookup hit)', async () => {
    const { resolveClienteCabecera } = await import('../clientHeaderResolver');
    const repo = makeRepo(
      vi.fn().mockResolvedValue({ codCli: 55, nomCom: 'EMPRESA DEL LOOKUP', nroRuc: '20100047218' }),
    );

    const cliente = await resolveClienteCabecera(
      repo,
      { ...FILTRO_BASE, codCli: 55 },
      undefined,
      [makeRepFacturacion()],
    );

    expect(cliente).toEqual({ nombre: 'EMPRESA DEL LOOKUP', ruc: '20100047218' });
  });

  it('tolerates a null lookup and falls back to the first row with an empty RUC', async () => {
    const { resolveClienteCabecera } = await import('../clientHeaderResolver');
    const repo = makeRepo(vi.fn().mockResolvedValue(null));
    const todas = [makeRepFacturacion({ NomCFa: 'PRIMERA FILA S.A.C.', NomCli: 'CLIENTE SISTEMA' })];

    const cliente = await resolveClienteCabecera(repo, { ...FILTRO_BASE, codCli: 55 }, undefined, todas);

    expect(cliente).toEqual({ nombre: 'PRIMERA FILA S.A.C.', ruc: '' });
  });

  it('degrades to the first row when the lookup REJECTS (never throws)', async () => {
    const { resolveClienteCabecera } = await import('../clientHeaderResolver');
    const repo = makeRepo(vi.fn().mockRejectedValue(new Error('SP exploded')));
    const todas = [makeRepFacturacion({ NomCFa: 'PRIMERA FILA S.A.C.' })];

    await expect(
      resolveClienteCabecera(repo, { ...FILTRO_BASE, codCli: 55 }, undefined, todas),
    ).resolves.toEqual({ nombre: 'PRIMERA FILA S.A.C.', ruc: '' });
  });

  it('skips the lookup entirely when codCli is absent and uses the first row', async () => {
    const { resolveClienteCabecera } = await import('../clientHeaderResolver');
    const lookup = vi.fn();
    const repo = makeRepo(lookup);
    const todas = [makeRepFacturacion({ NomCFa: 'PRIMERA FILA S.A.C.' })];

    const cliente = await resolveClienteCabecera(repo, FILTRO_BASE, undefined, todas);

    expect(cliente).toEqual({ nombre: 'PRIMERA FILA S.A.C.', ruc: '' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('falls back to NomCli when the first row has an empty NomCFa', async () => {
    const { resolveClienteCabecera } = await import('../clientHeaderResolver');
    const repo = makeRepo();
    const todas = [makeRepFacturacion({ NomCFa: '', NomCli: 'CLIENTE SISTEMA S.A.C.' })];

    const cliente = await resolveClienteCabecera(repo, FILTRO_BASE, undefined, todas);

    expect(cliente).toEqual({ nombre: 'CLIENTE SISTEMA S.A.C.', ruc: '' });
  });

  it('returns null when there is no name source at all (empty rows, no empresa/codCli)', async () => {
    const { resolveClienteCabecera } = await import('../clientHeaderResolver');
    const repo = makeRepo();

    await expect(resolveClienteCabecera(repo, FILTRO_BASE, undefined, [])).resolves.toBeNull();
  });

  it('renders an empty RUC when the lookup has a null nroRuc (omit, never fake)', async () => {
    const { resolveClienteCabecera } = await import('../clientHeaderResolver');
    const repo = makeRepo(
      vi.fn().mockResolvedValue({ codCli: 55, nomCom: 'CLIENTE SIN RUC', nroRuc: null }),
    );

    const cliente = await resolveClienteCabecera(repo, { ...FILTRO_BASE, codCli: 55 }, undefined, [
      makeRepFacturacion(),
    ]);

    expect(cliente).toEqual({ nombre: 'CLIENTE SIN RUC', ruc: '' });
  });
});

describe('fechaEmisionHoy', () => {
  it('formats the current date as dd/MM/yyyy', async () => {
    const { fechaEmisionHoy } = await import('../clientHeaderResolver');
    const ahora = new Date();
    const esperado = `${String(ahora.getDate()).padStart(2, '0')}/${String(
      ahora.getMonth() + 1,
    ).padStart(2, '0')}/${ahora.getFullYear()}`;

    expect(fechaEmisionHoy()).toBe(esperado);
    expect(fechaEmisionHoy()).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe('readLogoBuffer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns the committed logo bytes as a Buffer (PNG signature)', async () => {
    const { readLogoBuffer } = await import('../clientHeaderResolver');
    const buffer = readLogoBuffer();

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer?.subarray(0, 4).toString('latin1')).toBe('\x89PNG');
  });

  it('returns null when the logo file is missing (never throws)', async () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });
    // Fresh module instance so the fs cache cannot mask the missing file.
    const { readLogoBuffer } = await import('../clientHeaderResolver');

    expect(readLogoBuffer()).toBeNull();
  });
});
