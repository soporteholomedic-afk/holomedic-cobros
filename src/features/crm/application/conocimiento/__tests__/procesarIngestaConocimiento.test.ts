import { describe, expect, it } from 'vitest';

import type { EntradaConocimiento, IngestaConocimiento } from '../../../domain/entities';
import type {
  EntradaCrearIngestaConocimiento,
  IngestaConocimientoRepository,
} from '../../../domain/ports';

import { ProcesarIngestaConocimientoUseCase } from '../procesarIngestaConocimiento';

/**
 * Contrato de use case para el procesador de ingestas (agente-ia-crm
 * E4·T7) — hexagonal: se ejercita contra los puertos con fakes (el
 * adapter SQL tiene su suite de integración). Fijado acá:
 * - Happy path: trocea el crudo y crea UNA entrada por chunk con
 *   titulo «{nombre} — parte i de n» (acotado a 200), etiquetas
 *   sugeridas + 'subido' (CSV), vigencia heredada y origen SUBIDO;
 *   cierra COMPLETADA(n).
 * - Crudo ausente/vacío → COMPLETADA(0) sin crear entradas.
 * - Ingesta inexistente → no-op silencioso (AUSENTE), sin tocar nada.
 * - Replay idempotente: una ingesta ya COMPLETADA/FALLIDA no se
 *   reprocesa (el reclaim de crash no duplica entradas).
 * - Cualquier error → marcarFallida(mensaje) y NUNCA lanza: la tarea
 *   de la cola se completa y el PDF corrupto no se reencola infinito.
 * - Repo sin crearEntrada → revienta RUIDOSO antes de tocar la
 *   ingesta (wiring bug, aplicarIndicacion precedent).
 */

class FakeIngestas implements IngestaConocimientoRepository {
  filas = new Map<number, IngestaConocimiento>();
  procesando: number[] = [];
  completadas: Array<{ id: number; entradasCreadas: number }> = [];
  fallidas: Array<{ id: number; error: string }> = [];
  private siguienteId = 1;

  sembrar(sobres: Partial<IngestaConocimiento> & Pick<IngestaConocimiento, 'nombre' | 'tipo' | 'tamanoBytes'>): IngestaConocimiento {
    const ingesta: IngestaConocimiento = {
      id: this.siguienteId++,
      estado: 'PENDIENTE',
      contenidoCrudo: 'contenido base',
      error: null,
      entradasCreadas: 0,
      creadoPor: null,
      creadoEn: new Date('2026-02-01T10:00:00.000Z'),
      procesadoEn: null,
      vigenciaDesde: null,
      vigenciaHasta: null,
      ...sobres,
    };
    this.filas.set(ingesta.id, ingesta);
    return ingesta;
  }

  async crear(entrada: EntradaCrearIngestaConocimiento): Promise<IngestaConocimiento> {
    return this.sembrar({
      nombre: entrada.nombre,
      tipo: entrada.tipo,
      tamanoBytes: entrada.tamanoBytes,
      contenidoCrudo: entrada.contenidoCrudo,
      creadoPor: entrada.creadoPor ?? null,
      vigenciaDesde: entrada.vigenciaDesde ?? null,
      vigenciaHasta: entrada.vigenciaHasta ?? null,
    });
  }

  async obtenerPorId(id: number): Promise<IngestaConocimiento | null> {
    return this.filas.get(id) ?? null;
  }

  async listarRecientes(): Promise<IngestaConocimiento[]> {
    return [...this.filas.values()].sort((a, b) => b.id - a.id);
  }

  async marcarProcesando(id: number): Promise<void> {
    this.procesando.push(id);
    const fila = this.filas.get(id);
    if (fila) fila.estado = 'PROCESANDO';
  }

  async marcarCompletada(id: number, entradasCreadas: number): Promise<void> {
    this.completadas.push({ id, entradasCreadas });
    const fila = this.filas.get(id);
    if (fila) {
      fila.estado = 'COMPLETADA';
      fila.entradasCreadas = entradasCreadas;
      fila.procesadoEn = new Date();
      fila.error = null;
    }
  }

  async marcarFallida(id: number, error: string): Promise<void> {
    this.fallidas.push({ id, error });
    const fila = this.filas.get(id);
    if (fila) {
      fila.estado = 'FALLIDA';
      fila.error = error;
      fila.procesadoEn = new Date();
    }
  }
}

class FakeConocimiento {
  creadas: Array<{
    titulo: string;
    contenido: string;
    etiquetas: string[];
    vigenciaDesde: Date | null;
    vigenciaHasta: Date | null;
    origen: string | undefined;
  }> = [];

  async crearEntrada(entrada: {
    titulo: string;
    contenido: string;
    etiquetas: string[];
    vigenciaDesde?: Date | null;
    vigenciaHasta?: Date | null;
    origen?: 'MANUAL' | 'SEMILLA' | 'SUBIDO';
  }): Promise<EntradaConocimiento> {
    this.creadas.push({
      titulo: entrada.titulo,
      contenido: entrada.contenido,
      etiquetas: entrada.etiquetas,
      vigenciaDesde: entrada.vigenciaDesde ?? null,
      vigenciaHasta: entrada.vigenciaHasta ?? null,
      origen: entrada.origen,
    });
    return {
      id: this.creadas.length,
      titulo: entrada.titulo,
      contenido: entrada.contenido,
      etiquetas: entrada.etiquetas,
      vigenciaDesde: entrada.vigenciaDesde ?? null,
      vigenciaHasta: entrada.vigenciaHasta ?? null,
      activo: true,
    };
  }
}

function crearSuite() {
  const ingestas = new FakeIngestas();
  const conocimiento = new FakeConocimiento();
  const useCase = new ProcesarIngestaConocimientoUseCase({ ingestas, conocimiento });
  return { ingestas, conocimiento, useCase };
}

describe('ProcesarIngestaConocimientoUseCase (E4·T7)', () => {
  it('happy path: trocea y crea una entrada por chunk con titulo/etiquetas/vigencia/origen exactos y COMPLETADA(n)', async () => {
    const { ingestas, conocimiento, useCase } = crearSuite();
    const desde = new Date('2026-01-01T00:00:00.000Z');
    const hasta = new Date('2026-12-31T00:00:00.000Z');
    // Tres párrafos chicos y un bloque grande (>900 chars) para forzar
    // al menos dos chunks.
    const parrafoLargo = Array.from({ length: 200 }, () => 'palabra').join(' ');
    const ingesta = await ingestas.crear({
      nombre: 'Manual operativo 2026.pdf',
      tipo: 'PDF',
      tamanoBytes: 10_000,
      contenidoCrudo: `primera parte chica\n\nsegunda parte chica\n\n${parrafoLargo}`,
      creadoPor: 'operador',
      vigenciaDesde: desde,
      vigenciaHasta: hasta,
    });

    const resultado = await useCase.ejecutar({ ingestaId: ingesta.id });

    expect(resultado).toEqual({
      ingestaId: ingesta.id,
      estado: 'COMPLETADA',
      entradasCreadas: conocimiento.creadas.length,
    });
    expect(conocimiento.creadas.length).toBeGreaterThanOrEqual(2);
    const total = conocimiento.creadas.length;
    for (let i = 0; i < total; i++) {
      const creada = conocimiento.creadas[i];
      expect(creada?.titulo).toBe(`Manual operativo 2026.pdf — parte ${i + 1} de ${total}`);
      expect(creada?.etiquetas).toContain('subido');
      expect(creada?.origen).toBe('SUBIDO');
      expect(creada?.vigenciaDesde).toEqual(desde);
      expect(creada?.vigenciaHasta).toEqual(hasta);
    }
    // Cada etiqueta sugerida nace del CHUNK correspondiente: el primer
    // chunk contiene 'chica', el trozo grande contiene 'palabra'.
    const hayChunkConChica = conocimiento.creadas.some(
      (c) => c.contenido.includes('chica') && c.etiquetas.includes('chica'),
    );
    expect(hayChunkConChica).toBe(true);
    expect(ingestas.completadas).toEqual([{ id: ingesta.id, entradasCreadas: total }]);
    expect(ingestas.procesando).toEqual([ingesta.id]);
  });

  it('titulo acotado a 200 chars cuando el nombre es larguísimo', async () => {
    const { ingestas, conocimiento, useCase } = crearSuite();
    const nombre = 'n'.repeat(260);
    const ingesta = await ingestas.crear({
      nombre,
      tipo: 'TEXTO',
      tamanoBytes: 10,
      contenidoCrudo: 'contenido unico',
    });
    await useCase.ejecutar({ ingestaId: ingesta.id });
    expect(conocimiento.creadas).toHaveLength(1);
    expect(conocimiento.creadas[0]?.titulo.length).toBeLessThanOrEqual(200);
  });

  it('crudo ausente o solo espacios → COMPLETADA(0) sin crear entradas', async () => {
    const { ingestas, conocimiento, useCase } = crearSuite();
    const vacia = await ingestas.crear({
      nombre: 'vacia.pdf',
      tipo: 'PDF',
      tamanoBytes: 0,
      contenidoCrudo: null,
    });
    const enBlanco = await ingestas.crear({
      nombre: 'en-blanco.txt',
      tipo: 'TXT',
      tamanoBytes: 4,
      contenidoCrudo: '   \n\n  ',
    });

    await expect(useCase.ejecutar({ ingestaId: vacia.id })).resolves.toEqual({
      ingestaId: vacia.id,
      estado: 'COMPLETADA',
      entradasCreadas: 0,
    });
    await expect(useCase.ejecutar({ ingestaId: enBlanco.id })).resolves.toEqual({
      ingestaId: enBlanco.id,
      estado: 'COMPLETADA',
      entradasCreadas: 0,
    });
    expect(conocimiento.creadas).toHaveLength(0);
    expect(ingestas.completadas.map((c) => c.entradasCreadas)).toEqual([0, 0]);
  });

  it('ingesta inexistente → no-op silencioso (AUSENTE), sin marcar nada', async () => {
    const { ingestas, conocimiento, useCase } = crearSuite();
    await expect(useCase.ejecutar({ ingestaId: 999_999 })).resolves.toEqual({
      ingestaId: 999_999,
      estado: 'AUSENTE',
      entradasCreadas: 0,
    });
    expect(ingestas.procesando).toHaveLength(0);
    expect(ingestas.completadas).toHaveLength(0);
    expect(ingestas.fallidas).toHaveLength(0);
    expect(conocimiento.creadas).toHaveLength(0);
  });

  it('replay idempotente: una ingesta ya COMPLETADA o FALLIDA no se reprocesa', async () => {
    const { ingestas, conocimiento, useCase } = crearSuite();
    // Se siembran con estados cerrados directamente (el port de creación
    // no expresa estado/contador — eso es del ciclo del procesador).
    const completada = ingestas.sembrar({
      nombre: 'ya-hecha.txt',
      tipo: 'TXT',
      tamanoBytes: 5,
      contenidoCrudo: 'contenido',
      estado: 'COMPLETADA',
      entradasCreadas: 3,
    });
    const fallida = ingestas.sembrar({
      nombre: 'ya-rota.pdf',
      tipo: 'PDF',
      tamanoBytes: 5,
      contenidoCrudo: 'contenido',
      estado: 'FALLIDA',
      error: 'fallo original',
    });

    await expect(useCase.ejecutar({ ingestaId: completada.id })).resolves.toEqual({
      ingestaId: completada.id,
      estado: 'COMPLETADA',
      entradasCreadas: 3,
    });
    await expect(useCase.ejecutar({ ingestaId: fallida.id })).resolves.toEqual({
      ingestaId: fallida.id,
      estado: 'FALLIDA',
      entradasCreadas: 0,
    });
    // Ni reproceso, ni duplico entradas, ni piso el error original.
    expect(conocimiento.creadas).toHaveLength(0);
    expect(ingestas.procesando).toHaveLength(0);
    expect(ingestas.fallidas).toHaveLength(0);
  });

  it('fallo al crear una entrada → marcarFallida(mensaje) y NUNCA lanza (la cola no reintenta)', async () => {
    const { ingestas } = crearSuite();
    const conocimiento = new FakeConocimiento();
    conocimiento.crearEntrada = async () => {
      throw new Error('violación de columna simulada');
    };
    const roto = new ProcesarIngestaConocimientoUseCase({ ingestas, conocimiento });
    const ingesta = await ingestas.crear({
      nombre: 'corrupto.pdf',
      tipo: 'PDF',
      tamanoBytes: 5,
      contenidoCrudo: 'contenido que no llegará a la KB',
    });

    await expect(roto.ejecutar({ ingestaId: ingesta.id })).resolves.toEqual({
      ingestaId: ingesta.id,
      estado: 'FALLIDA',
      entradasCreadas: 0,
    });
    expect(ingestas.fallidas).toEqual([
      { id: ingesta.id, error: 'violación de columna simulada' },
    ]);
    expect(ingestas.completadas).toHaveLength(0);
  });

  it('repo sin crearEntrada (capacidad E4 ausente) → revienta RUIDOSO antes de tocar la ingesta', async () => {
    const { ingestas } = crearSuite();
    const useCase = new ProcesarIngestaConocimientoUseCase({
      ingestas,
      conocimiento: {},
    });
    const ingesta = await ingestas.crear({
      nombre: 'x.txt',
      tipo: 'TXT',
      tamanoBytes: 1,
      contenidoCrudo: 'x',
    });
    await expect(useCase.ejecutar({ ingestaId: ingesta.id })).rejects.toThrow(/crearEntrada/);
    expect(ingestas.procesando).toHaveLength(0);
  });
});
