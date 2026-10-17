import { describe, expect, it } from 'vitest';

import type { ConversacionCrm } from '../../domain/entities';
import { NotFoundError } from '../../domain/errors';
import { ConversacionNoEncontradaError } from '../obtenerHiloConversacion';
import { AjustesConversacionUseCase } from '../ajustesConversacion';

/**
 * Use-case contract for the operator's per-conversation settings panel
 * (agente-ia-crm E3·T5): `obtener` projects the row's estado/modo/
 * asignadaA/memoriaActiva plus the PUBLIC agent config values
 * (umbralConfianza, maxIntercambios, horarioDesde, horarioHasta — the
 * configAgente knobs the chips render; NO secrets cross).
 * `actualizarMemoriaActiva` flips ONLY the memory toggle through the
 * repo's optional capability and returns the REFRESHED ajustes.
 * A missing conversation is the typed bandeja 404.
 */

const CONFIG_FIJA = {
  habilitado: true,
  umbralConfianza: 0.55,
  maxIntercambios: 6,
  horarioDesde: 7,
  horarioHasta: 20,
  textoEscalado: 'texto',
};

class FakeConversaciones {
  filas: ConversacionCrm[] = [];
  toggles: Array<{ id: number; activa: boolean }> = [];
  sinActualizarMemoriaActiva = false;

  sembrar(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
    const ahora = new Date().toISOString();
    const fila: ConversacionCrm = {
      id: 1,
      empresaId: 7,
      contactoId: 42,
      canal: 'WHATSAPP',
      telefono: '+595981234567',
      identificadorCanal: 'US.1349',
      estado: 'REQUIERE_HUMANO',
      asignadaA: null,
      modo: 'IA',
      memoriaActiva: true,
      ultimoMensajeEn: ahora,
      noLeidos: 0,
      creadoEn: ahora,
      actualizadoEn: ahora,
      ...sobres,
    };
    this.filas.push(fila);
    return fila;
  }

  async obtenerPorId(id: number): Promise<ConversacionCrm | null> {
    const fila = this.filas.find((f) => f.id === id);
    return fila ? structuredClone(fila) : null;
  }

  async actualizarMemoriaActiva(id: number, activa: boolean): Promise<ConversacionCrm | null> {
    if (this.sinActualizarMemoriaActiva) throw new Error('capacidad ausente');
    this.toggles.push({ id, activa });
    const fila = this.filas.find((f) => f.id === id);
    if (fila === undefined) return null;
    fila.memoriaActiva = activa;
    return structuredClone(fila);
  }
}

function crearSuite(conversacion: Partial<ConversacionCrm> | null = {}): {
  repo: FakeConversaciones;
  useCase: AjustesConversacionUseCase;
} {
  const repo = new FakeConversaciones();
  if (conversacion !== null) repo.sembrar(conversacion);
  const useCase = new AjustesConversacionUseCase({
    // Cast: el fake NO declara la capacidad como opcional (la tiene).
    conversaciones: repo as unknown as ConstructorParameters<
      typeof AjustesConversacionUseCase
    >[0]['conversaciones'],
    config: () => ({ ...CONFIG_FIJA }),
  });
  return { repo, useCase };
}

describe('AjustesConversacionUseCase — obtener (E3·T5)', () => {
  it('proyecta estado/modo/asignadaA/memoriaActiva + config pública (sin secretos)', async () => {
    const { useCase } = crearSuite({
      estado: 'TOMADA_HUMANO',
      asignadaA: 'juana',
      modo: 'HUMANO',
      memoriaActiva: false,
    });

    const ajustes = await useCase.obtener(1);

    expect(ajustes).toEqual({
      estado: 'TOMADA_HUMANO',
      modo: 'HUMANO',
      asignadaA: 'juana',
      memoriaActiva: false,
      config: {
        umbralConfianza: 0.55,
        maxIntercambios: 6,
        horarioDesde: 7,
        horarioHasta: 20,
      },
    });
    // El contrato NO expone habilitado ni textoEscalado.
    expect(Object.keys(ajustes).sort()).toEqual(['asignadaA', 'config', 'estado', 'memoriaActiva', 'modo']);
  });

  it('memoriaActiva ausente (payload pre-E3) se lee como true (DEFAULT 1)', async () => {
    const { repo, useCase } = crearSuite();
    delete (repo.filas[0] as { memoriaActiva?: boolean }).memoriaActiva;

    const ajustes = await useCase.obtener(1);

    expect(ajustes.memoriaActiva).toBe(true);
  });

  it('conversación inexistente → ConversacionNoEncontradaError tipado (route → 404)', async () => {
    const { useCase } = crearSuite(null);

    await expect(useCase.obtener(99)).rejects.toThrow(ConversacionNoEncontradaError);
    await expect(useCase.obtener(99)).rejects.toThrow(NotFoundError);
  });
});

describe('AjustesConversacionUseCase — actualizarMemoriaActiva (E3·T5)', () => {
  it('apaga la memoria y devuelve los ajustes REFRESCADOS (memoriaActiva false)', async () => {
    const { repo, useCase } = crearSuite();

    const ajustes = await useCase.actualizarMemoriaActiva(1, false);

    expect(repo.toggles).toEqual([{ id: 1, activa: false }]);
    expect(ajustes.memoriaActiva).toBe(false);
    expect(ajustes.estado).toBe('REQUIERE_HUMANO');
    expect(ajustes.config.maxIntercambios).toBe(6);
  });

  it('enciende de vuelta (round-trip) con la misma proyección', async () => {
    const { useCase } = crearSuite();

    await useCase.actualizarMemoriaActiva(1, false);
    const ajustes = await useCase.actualizarMemoriaActiva(1, true);

    expect(ajustes.memoriaActiva).toBe(true);
  });

  it('conversación inexistente → ConversacionNoEncontradaError tipado (route → 404)', async () => {
    const { useCase } = crearSuite();

    await expect(useCase.actualizarMemoriaActiva(99, false)).rejects.toThrow(
      ConversacionNoEncontradaError,
    );
  });
});

describe('AjustesConversacionUseCase — config asíncrona (E5·T3)', () => {
  it('espera el resolver asíncrono de config al proyectar', async () => {
    const repo = new FakeConversaciones();
    repo.sembrar();
    const useCase = new AjustesConversacionUseCase({
      conversaciones: repo as unknown as ConstructorParameters<
        typeof AjustesConversacionUseCase
      >[0]['conversaciones'],
      config: async () => ({ ...CONFIG_FIJA, umbralConfianza: 0.9, horarioHasta: 21 }),
    });

    const ajustes = await useCase.obtener(1);
    const tras = await useCase.actualizarMemoriaActiva(1, false);

    expect(ajustes.config).toEqual({
      umbralConfianza: 0.9,
      maxIntercambios: 6,
      horarioDesde: 7,
      horarioHasta: 21,
    });
    expect(tras.config.umbralConfianza).toBe(0.9);
  });
});
