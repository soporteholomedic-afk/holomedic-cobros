import { describe, expect, it } from 'vitest';

import type { IngestaConocimiento } from '../../../domain/entities';
import type {
  EntradaCrearIngestaConocimiento,
  EntradaCrearTareaAgente,
  IngestaConocimientoRepository,
} from '../../../domain/ports';

import {
  IngestaInvalidaError,
  IniciarIngestaConocimientoUseCase,
  LIMITE_BYTES_CONTENIDO,
  LIMITE_CARACTERES_CRUDO,
} from '../iniciarIngestaConocimiento';

/**
 * Contrato de use case para el arranque de ingestas (agente-ia-crm
 * E4·T7) — hexagonal: fakes contra los puertos. Fijado acá:
 * - Validaciones tipadas (IngestaInvalidaError) SIN encolar tarea:
 *   nombre vacío o >260, tipo fuera del catálogo, crudo vacío o
 *   >200 000 chars.
 * - Happy path: ingesta PENDIENTE con tamanoBytes = byteLength UTF-8
 *   del crudo + tarea INGESTAR_CONOCIMIENTO con conversacionId NULL y
 *   mensajeId = ingestaId (payload de la cola; la UNIQUE trata los
 *   NULL como iguales → dedup por ingesta).
 * - El byte-límite (5 MB) es defensa en profundidad INALCANZABLE con
 *   el tope de 200 000 chars (máx. 800 KB UTF-8): se fija la
 *   constante y la relación, no un test de un camino muerto.
 * - NO dispara el drenaje acá: el disparo fire-and-forget es de la
 *   ruta (T8) y el barredor lazy es la red — igual que el webhook.
 */

class FakeIngestas implements IngestaConocimientoRepository {
  creadas: EntradaCrearIngestaConocimiento[] = [];
  private siguienteId = 1;

  async crear(entrada: EntradaCrearIngestaConocimiento): Promise<IngestaConocimiento> {
    this.creadas.push({ ...entrada });
    return {
      id: this.siguienteId++,
      nombre: entrada.nombre,
      tipo: entrada.tipo,
      tamanoBytes: entrada.tamanoBytes,
      contenidoCrudo: entrada.contenidoCrudo,
      estado: 'PENDIENTE',
      error: null,
      entradasCreadas: 0,
      creadoPor: entrada.creadoPor ?? null,
      creadoEn: new Date('2026-02-01T10:00:00.000Z'),
      procesadoEn: null,
      vigenciaDesde: entrada.vigenciaDesde ?? null,
      vigenciaHasta: entrada.vigenciaHasta ?? null,
    };
  }

  async obtenerPorId(): Promise<IngestaConocimiento | null> {
    return null;
  }

  async listarRecientes(): Promise<IngestaConocimiento[]> {
    return [];
  }

  async marcarProcesando(): Promise<void> {}
  async marcarCompletada(): Promise<void> {}
  async marcarFallida(): Promise<void> {}
}

class FakeTareas {
  creaciones: EntradaCrearTareaAgente[] = [];
  private siguienteId = 500;

  async crearSiNoExiste(entrada: EntradaCrearTareaAgente): Promise<{ id: number; creada: boolean }> {
    this.creaciones.push({ ...entrada });
    return { id: this.siguienteId++, creada: true };
  }
}

function crearSuite() {
  const ingestas = new FakeIngestas();
  const tareas = new FakeTareas();
  const useCase = new IniciarIngestaConocimientoUseCase({ ingestas, tareas });
  return { ingestas, tareas, useCase };
}

const ENTRADA_BASE = {
  nombre: 'Manual operativo 2026.pdf',
  tipo: 'PDF' as const,
  contenidoCrudo: 'contenido ya extraído del archivo',
};

describe('IniciarIngestaConocimientoUseCase (E4·T7)', () => {
  it('happy path: crea la ingesta PENDIENTE y encola INGESTAR_CONOCIMIENTO con conversacionId NULL y mensajeId = ingestaId', async () => {
    const { ingestas, tareas, useCase } = crearSuite();

    const resultado = await useCase.ejecutar({
      ...ENTRADA_BASE,
      creadoPor: 'operador',
      vigenciaDesde: new Date('2026-01-01T00:00:00.000Z'),
      vigenciaHasta: new Date('2026-12-31T00:00:00.000Z'),
    });

    expect(resultado.ingesta.estado).toBe('PENDIENTE');
    expect(resultado.ingesta.nombre).toBe('Manual operativo 2026.pdf');
    expect(resultado.ingesta.tamanoBytes).toBe(
      Buffer.byteLength('contenido ya extraído del archivo', 'utf8'),
    );
    expect(resultado.tarea.creada).toBe(true);
    expect(tareas.creaciones).toEqual([
      {
        conversacionId: null,
        mensajeId: resultado.ingesta.id,
        tipo: 'INGESTAR_CONOCIMIENTO',
      },
    ]);
    expect(ingestas.creadas[0]?.creadoPor).toBe('operador');
  });

  it('TEXTO pegado recorre el mismo camino (conversacionId NULL, sin binarios)', async () => {
    const { tareas, useCase } = crearSuite();
    const resultado = await useCase.ejecutar({
      nombre: 'Nota pegada',
      tipo: 'TEXTO',
      contenidoCrudo: 'texto del operador',
    });
    expect(resultado.ingesta.tipo).toBe('TEXTO');
    expect(tareas.creaciones[0]?.conversacionId).toBeNull();
    expect(tareas.creaciones[0]?.tipo).toBe('INGESTAR_CONOCIMIENTO');
  });

  it.each([
    ['nombre vacío', { ...ENTRADA_BASE, nombre: '   ' }],
    ['nombre >260', { ...ENTRADA_BASE, nombre: 'n'.repeat(261) }],
    ['tipo fuera de catálogo', { ...ENTRADA_BASE, tipo: 'XLSX' as never }],
    ['crudo vacío', { ...ENTRADA_BASE, contenidoCrudo: '  \n\n ' }],
    ['crudo >200k chars', { ...ENTRADA_BASE, contenidoCrudo: 'x'.repeat(200_001) }],
  ])('entrada inválida (%s) → IngestaInvalidaError y SIN encolar tarea', async (_motivo, entrada) => {
    const { tareas, useCase } = crearSuite();
    await expect(useCase.ejecutar(entrada)).rejects.toBeInstanceOf(IngestaInvalidaError);
    expect(tareas.creaciones).toHaveLength(0);
  });

  it('los límites: 200k chars siempre caben en 5 MB (el byte-check es defensa, nunca el primero en saltar)', () => {
    // 4 bytes por char es el PEOR caso UTF-8 (astrales): 200 000 × 4 =
    // 800 000 < 5 242 880 — el tope de caracteres siempre dispara antes.
    expect(LIMITE_CARACTERES_CRUDO * 4).toBeLessThan(LIMITE_BYTES_CONTENIDO);
    expect(LIMITE_BYTES_CONTENIDO).toBe(5 * 1024 * 1024);
  });
});
