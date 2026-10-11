import { describe, expect, it } from 'vitest';

import type { EntradaConocimiento } from '../../domain/entities';
import type { ConocimientoCrmRepository } from '../../domain/ports';
import { rankearConocimiento, recuperarConocimiento } from '../recuperarConocimiento';

/**
 * Pure-ranking contract for the KB retrieval (agente-ia-crm E2·T1).
 * The ranker is the deterministic half of the RAG prefilter — pinned
 * here against in-memory entries (no DB, no clock):
 * - Normalization: lowercase, diacritics stripped, split on
 *   non-alphanumerics, Spanish stopwords dropped → "Exámenes" matches
 *   "examenes".
 * - Term-overlap score: (titulo matches ×2 + contenido matches ×1) /
 *   total query terms; zero-score entries never surface.
 * - Vigencia window: vigenciaDesde/vigenciaHasta inclusive boundaries;
 *   outside rows are EXCLUDED before scoring.
 * - Ordering: puntaje DESC, tie-break id ASC; topK slices.
 */

const AHORA = new Date('2026-10-15T12:00:00.000Z');

function entrada(sobreescritas: Partial<EntradaConocimiento> & { id: number }): EntradaConocimiento {
  return {
    titulo: 'Certificados médicos',
    contenido: 'Los certificados están listos en 24 horas.',
    etiquetas: ['semilla', 'servicios'],
    vigenciaDesde: null,
    vigenciaHasta: null,
    activo: true,
    ...sobreescritas,
  };
}

describe('rankearConocimiento — normalización', () => {
  it('es insensible a mayúsculas y diacríticos (consulta con tilde ↔ texto sin tilde)', () => {
    const resultados = rankearConocimiento(
      '¿EXÁMENES Médicos?',
      [entrada({ id: 1, titulo: 'Examenes medicos ocupacionales', contenido: 'ingreso, periodicos y salida' })],
      5,
      AHORA,
    );
    expect(resultados).toHaveLength(1);
    expect(resultados[0]?.entrada.id).toBe(1);
    expect(resultados[0]?.puntaje).toBe(2); // solo en el titulo: 2×2/2
  });

  it('descarta stopwords del español (la consulta recortada rankea igual)', () => {
    const base = rankearConocimiento(
      'certificados',
      [entrada({ id: 1 })],
      5,
      AHORA,
    );
    // Todas las palabras son stopwords salvo una → el único término útil.
    const conRelleno = rankearConocimiento(
      'de la el certificados y para con',
      [entrada({ id: 1 })],
      5,
      AHORA,
    );
    expect(conRelleno).toHaveLength(1);
    expect(conRelleno[0]?.puntaje).toBe(base[0]?.puntaje);
  });

  it('consulta vacía o solo-stopwords → []', () => {
    const entradas = [entrada({ id: 1 })];
    expect(rankearConocimiento('', entradas, 5, AHORA)).toEqual([]);
    expect(rankearConocimiento('   ', entradas, 5, AHORA)).toEqual([]);
    expect(rankearConocimiento('de la y que', entradas, 5, AHORA)).toEqual([]);
  });
});

describe('rankearConocimiento — puntaje', () => {
  it('pondera el titulo ×2 frente al contenido ×1', () => {
    const soloTitulo = entrada({
      id: 1,
      titulo: 'Examenes',
      contenido: 'no menciona nada',
    });
    const soloContenido = entrada({
      id: 2,
      titulo: 'otro tema',
      contenido: 'examenes de ingreso',
    });
    const resultados = rankearConocimiento('exámenes', [soloTitulo, soloContenido], 5, AHORA);
    expect(resultados.map((r) => r.entrada.id)).toEqual([1, 2]);
    expect(resultados[0]?.puntaje).toBe(2);
    expect(resultados[1]?.puntaje).toBe(1);
  });

  it('divide por el total de términos de la consulta (no por los que matchean)', () => {
    const resultados = rankearConocimiento(
      'certificados medicos',
      [entrada({ id: 1, titulo: 'Certificados medicos', contenido: 'sin temas extra' })],
      5,
      AHORA,
    );
    // Ambos términos en el titulo (2+2) y ninguno en el contenido → 4/2 = 2.
    expect(resultados[0]?.puntaje).toBe(2);
  });

  it('excluye entradas con puntaje 0', () => {
    const resultados = rankearConocimiento(
      'horarios',
      [entrada({ id: 1 }), entrada({ id: 2, titulo: 'Horarios de atención', contenido: 'lunes a viernes' })],
      5,
      AHORA,
    );
    expect(resultados.map((r) => r.entrada.id)).toEqual([2]);
  });
});

describe('rankearConocimiento — vigencia', () => {
  it('límites inclusivos: vigenciaDesde == ahora y vigenciaHasta == ahora quedan DENTRO', () => {
    const desdeAhora = entrada({ id: 1, vigenciaDesde: AHORA });
    const hastaAhora = entrada({ id: 2, vigenciaHasta: AHORA });
    const resultados = rankearConocimiento('certificados', [desdeAhora, hastaAhora], 5, AHORA);
    expect(resultados.map((r) => r.entrada.id).sort()).toEqual([1, 2]);
  });

  it('excluye vigenciaDesde futuro y vigenciaHasta pasado (aunque matcheen)', () => {
    const futura = entrada({ id: 1, vigenciaDesde: new Date('2026-10-15T12:00:00.001Z') });
    const vencida = entrada({ id: 2, vigenciaHasta: new Date('2026-10-15T11:59:59.999Z') });
    const vigente = entrada({ id: 3 });
    const resultados = rankearConocimiento('certificados', [futura, vencida, vigente], 5, AHORA);
    expect(resultados.map((r) => r.entrada.id)).toEqual([3]);
  });
});

describe('rankearConocimiento — orden y topK', () => {
  it('ordena por puntaje DESC y desempata por id ASC', () => {
    const baja = entrada({ id: 3, titulo: 'tema', contenido: 'certificados rapidos' });
    const media = entrada({ id: 2, titulo: 'Certificados', contenido: 'otros asuntos' });
    const alta = entrada({ id: 1, titulo: 'Certificados rapidos', contenido: 'certificados listos' });
    // alta: (2+2 + 1)/2 = 2.5 · media: 2/2 = 1 · baja: 1/2 = 0.5
    const resultados = rankearConocimiento('certificados rapidos', [baja, alta, media], 5, AHORA);
    expect(resultados.map((r) => r.entrada.id)).toEqual([1, 2, 3]);
    expect(resultados[0]?.puntaje).toBe(2.5);

    // Empate exacto (misma forma, ids distintos) → id ASC.
    const empateA = entrada({ id: 20, titulo: 'Certificados', contenido: 'igual' });
    const empateB = entrada({ id: 10, titulo: 'Certificados', contenido: 'igual' });
    const empates = rankearConocimiento('certificados', [empateA, empateB], 5, AHORA);
    expect(empates.map((r) => r.entrada.id)).toEqual([10, 20]);
  });

  it('recorta al topK (y topK 0 o negativo → [])', () => {
    const entradas = [
      entrada({ id: 1, titulo: 'Certificados a', contenido: 'x' }),
      entrada({ id: 2, titulo: 'Certificados b', contenido: 'x' }),
      entrada({ id: 3, titulo: 'Certificados c', contenido: 'x' }),
    ];
    const dos = rankearConocimiento('certificados', entradas, 2, AHORA);
    expect(dos).toHaveLength(2);
    expect(dos.map((r) => r.entrada.id)).toEqual([1, 2]);
    expect(rankearConocimiento('certificados', entradas, 0, AHORA)).toEqual([]);
    expect(rankearConocimiento('certificados', entradas, -1, AHORA)).toEqual([]);
  });
});

describe('recuperarConocimiento — wrapper fino', () => {
  class FakeConocimientoRepository implements ConocimientoCrmRepository {
    ultimaConsulta: string | null = null;
    filas: EntradaConocimiento[] = [];

    async listarActivas(): Promise<EntradaConocimiento[]> {
      return this.filas;
    }

    async buscarPorTexto(texto: string): Promise<EntradaConocimiento[]> {
      this.ultimaConsulta = texto;
      return this.filas;
    }
  }

  it('busca por texto vía el port y rankea el resultado', async () => {
    const repo = new FakeConocimientoRepository();
    repo.filas = [
      entrada({ id: 1, titulo: 'Certificados', contenido: 'otros asuntos' }),
      entrada({ id: 2, titulo: 'tema', contenido: 'certificados en 24 horas' }),
    ];
    const resultados = await recuperarConocimiento(repo, 'certificados', 5);
    expect(repo.ultimaConsulta).toBe('certificados');
    expect(resultados.map((r) => r.entrada.id)).toEqual([1, 2]);
    expect(resultados[0]?.puntaje).toBe(2);
  });

  it('propaga [] cuando el prefilter LIKE no devuelve nada', async () => {
    const repo = new FakeConocimientoRepository();
    repo.filas = [];
    expect(await recuperarConocimiento(repo, 'inexistente', 5)).toEqual([]);
  });
});
