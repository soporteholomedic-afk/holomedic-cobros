import { describe, expect, it } from 'vitest';

import {
  ENTRADAS_SEMILLA,
  ETIQUETA_SEMILLA,
  SQL_INSERTAR_ENTRADA,
  SQL_LIMPIAR_SEMILLA,
  parsearArgumentos,
  planificarSiembra,
} from '../crm-sembrar-conocimiento.mjs';

/**
 * Pure-derivation pins for the KB seed script (agente-ia-crm E2·T1):
 * - Arg parsing: DRY-RUN by default (no flags); `--apply` writes;
 *   `--limpiar` removes ONLY seed rows; unknown flags are surfaced.
 * - Idempotent insert shape: the plan skips existing titulos AND the
 *   SQL itself is `INSERT … SELECT … WHERE NOT EXISTS` by titulo.
 * - Seed content: ~12 real Holomedic facts, Spanish, every entry
 *   tagged 'semilla' plus topic tags — never invents facts.
 */

describe('parsearArgumentos', () => {
  it('sin flags → dry-run (aplicar y limpiar en false)', () => {
    expect(parsearArgumentos([])).toEqual({ aplicar: false, limpiar: false, desconocidos: [] });
  });

  it('--apply → escribir; --limpiar → limpiar', () => {
    expect(parsearArgumentos(['--apply'])).toEqual({ aplicar: true, limpiar: false, desconocidos: [] });
    expect(parsearArgumentos(['--limpiar'])).toEqual({ aplicar: false, limpiar: true, desconocidos: [] });
  });

  it('flags desconocidos quedan listados (se rechazan en main)', () => {
    const args = parsearArgumentos(['--force', '--apply', '--borrar-todo']);
    expect(args.aplicar).toBe(true);
    expect(args.desconocidos).toEqual(['--force', '--borrar-todo']);
  });
});

describe('planificarSiembra (idempotencia por titulo)', () => {
  const entradas = [
    { titulo: 'Certificados médicos en 24 horas', contenido: 'a', etiquetas: 'semilla,servicios' },
    { titulo: 'Envío de resultados CAMO y EMO', contenido: 'b', etiquetas: 'semilla,resultados' },
  ];

  it('base vacía → planifica todo', () => {
    expect(planificarSiembra(entradas, [])).toEqual(entradas);
  });

  it('titulos ya existentes quedan fuera (re-run = no-op)', () => {
    expect(planificarSiembra(entradas, ['Certificados médicos en 24 horas'])).toEqual([entradas[1]]);
    expect(planificarSiembra(entradas, entradas.map((e) => e.titulo))).toEqual([]);
  });

  it('el SQL de insert es INSERT…SELECT con WHERE NOT EXISTS por titulo', () => {
    expect(SQL_INSERTAR_ENTRADA).toContain('INSERT INTO dbo.CRM_Conocimiento');
    expect(SQL_INSERTAR_ENTRADA).toContain('WHERE NOT EXISTS');
    expect(SQL_INSERTAR_ENTRADA).toContain('titulo = @titulo');
  });

  it('el insert marca origen SEMILLA (procedencia E4·T7; las filas históricas quedan MANUAL)', () => {
    expect(SQL_INSERTAR_ENTRADA).toContain('origen');
    expect(SQL_INSERTAR_ENTRADA).toContain("'SEMILLA'");
    // Solo las filas NUEVAS del seed llevan la marca — el UPDATE no existe.
    expect(SQL_INSERTAR_ENTRADA).not.toContain('UPDATE');
  });

  it('el SQL de limpieza toca SOLO filas con la etiqueta semilla (CSV-safe)', () => {
    expect(SQL_LIMPIAR_SEMILLA).toContain('DELETE FROM dbo.CRM_Conocimiento');
    // CSV-safe: la etiqueta debe aparecer como elemento de lista, no
    // como subcadena de otra etiqueta (p.ej. 'no_semilla').
    expect(SQL_LIMPIAR_SEMILLA).toContain(`'%${','}${ETIQUETA_SEMILLA}${','}%'`);
    expect(SQL_LIMPIAR_SEMILLA).not.toMatch(/DELETE\s+FROM\s+dbo\.CRM_Conocimiento\s*;?\s*$/);
  });
});

describe('ENTRADAS_SEMILLA (contenido Holomedic real, en español)', () => {
  it('trae ~12 entradas con titulo, contenido y etiquetas', () => {
    expect(ENTRADAS_SEMILLA.length).toBeGreaterThanOrEqual(12);
    expect(ENTRADAS_SEMILLA.length).toBeLessThanOrEqual(14);
    for (const entrada of ENTRADAS_SEMILLA) {
      expect(entrada.titulo.trim()).not.toBe('');
      expect(entrada.contenido.trim()).not.toBe('');
      expect(entrada.etiquetas.trim()).not.toBe('');
    }
  });

  it('titulos únicos (la idempotencia del script depende de ellos)', () => {
    const titulos = ENTRADAS_SEMILLA.map((e) => e.titulo);
    expect(new Set(titulos).size).toBe(titulos.length);
  });

  it('toda entrada lleva la etiqueta semilla + al menos una etiqueta temática', () => {
    for (const entrada of ENTRADAS_SEMILLA) {
      const etiquetas = entrada.etiquetas.split(',').map((e) => e.trim()).filter((e) => e !== '');
      expect(etiquetas).toContain(ETIQUETA_SEMILLA);
      expect(etiquetas.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('cubre los temas clave del agente (servicios, resultados, contacto/cotización)', () => {
    const todas = ENTRADAS_SEMILLA.flatMap((e) => e.etiquetas.split(',').map((t) => t.trim()));
    for (const tema of ['servicios', 'resultados', 'contacto']) {
      expect(todas).toContain(tema);
    }
  });
});
