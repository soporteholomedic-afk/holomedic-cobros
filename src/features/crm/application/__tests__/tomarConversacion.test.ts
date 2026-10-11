import { describe, expect, it } from 'vitest';

import type {
  ConversacionCrm,
  EstadoConversacion,
  ModoConversacion,
} from '../../domain/entities';
import { ConversacionNoEncontradaError } from '../obtenerHiloConversacion';
import {
  ConversacionYaTomadaError,
  EstadoConversacionInvalidoError,
  TomarConversacionUseCase,
  type TomarConversacionDeps,
} from '../tomarConversacion';

/**
 * Use-case contract for tomarConversacion (agente-ia-crm E3·T3) — the
 * operator takes over a conversation la Guía was managing: allowed
 * from ACTIVA_IA | REQUIERE_HUMANO → TOMADA_HUMANO with
 * asignadaA = the operator's LOGIN NAME (the currency the empresas
 * asignar precedent stores — never the opaque sub) and modo 'HUMANO'
 * in ONE actualizarAsignacion write. Typed errors: already taken →
 * ConversacionYaTomadaError (409), other estados →
 * EstadoConversacionInvalidoError (409), missing row →
 * ConversacionNoEncontradaError (404). A repo without the E3
 * actualizarAsignacion capability fails loudly instead of taking
 * half-way (aplicarIndicacion precedent).
 */

interface AsignacionEscrita {
  id: number;
  asignadaA: string | null;
  modo: ModoConversacion;
}

class FakeConversaciones {
  filas: ConversacionCrm[] = [];
  estadosEscritos: EstadoConversacion[] = [];
  asignaciones: AsignacionEscrita[] = [];
  /** When set, the repo pretends the E3 capability is absent. */
  sinAsignacion = false;

  sembrar(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
    const ahora = new Date().toISOString();
    const fila: ConversacionCrm = {
      id: 1,
      empresaId: 7,
      contactoId: 42,
      canal: 'WHATSAPP',
      telefono: '+595981234567',
      identificadorCanal: 'US.1349',
      estado: 'ACTIVA_IA',
      asignadaA: null,
      modo: 'IA',
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

  async actualizarEstado(id: number, estado: EstadoConversacion): Promise<ConversacionCrm | null> {
    this.estadosEscritos.push(estado);
    const fila = this.filas.find((f) => f.id === id);
    if (fila === undefined) return null;
    fila.estado = estado;
    return structuredClone(fila);
  }

  async actualizarAsignacion(
    id: number,
    asignadaA: string | null,
    modo: ModoConversacion,
  ): Promise<void> {
    if (this.sinAsignacion) {
      throw new Error('actualizarAsignacion no existe en este fake');
    }
    this.asignaciones.push({ id, asignadaA, modo });
    const fila = this.filas.find((f) => f.id === id);
    if (fila !== undefined) {
      fila.asignadaA = asignadaA;
      fila.modo = modo;
    }
  }
}

function crearSuite(estado: EstadoConversacion | null = 'ACTIVA_IA'): {
  conversaciones: FakeConversaciones;
  useCase: TomarConversacionUseCase;
} {
  const conversaciones = new FakeConversaciones();
  if (estado !== null) conversaciones.sembrar({ estado });
  const useCase = new TomarConversacionUseCase({
    conversaciones: conversaciones as TomarConversacionDeps['conversaciones'],
  });
  return { conversaciones, useCase };
}

const OPERADOR = { id: 'juana', nombre: 'Juana Perez' };

describe('TomarConversacionUseCase — toma manual del operador (E3·T3)', () => {
  it('happy path desde ACTIVA_IA: TOMADA_HUMANO + asignadaA = login (moneda del precedent empresas) + modo HUMANO', async () => {
    const { conversaciones, useCase } = crearSuite('ACTIVA_IA');

    const resultado = await useCase.ejecutar({ conversacionId: 1, usuario: OPERADOR });

    expect(resultado).toEqual({ estado: 'TOMADA_HUMANO', asignadaA: 'juana' });
    expect(conversaciones.estadosEscritos).toEqual(['TOMADA_HUMANO']);
    expect(conversaciones.asignaciones).toEqual([{ id: 1, asignadaA: 'juana', modo: 'HUMANO' }]);
  });

  it('happy path desde REQUIERE_HUMANO (la escalada se toma directo)', async () => {
    const { conversaciones, useCase } = crearSuite('REQUIERE_HUMANO');

    const resultado = await useCase.ejecutar({ conversacionId: 1, usuario: OPERADOR });

    expect(resultado.estado).toBe('TOMADA_HUMANO');
    expect(conversaciones.asignaciones).toEqual([{ id: 1, asignadaA: 'juana', modo: 'HUMANO' }]);
  });

  it('ya TOMADA_HUMANO → ConversacionYaTomadaError tipado (route → 409), sin escrituras', async () => {
    const { conversaciones, useCase } = crearSuite('TOMADA_HUMANO');

    await expect(
      useCase.ejecutar({ conversacionId: 1, usuario: OPERADOR }),
    ).rejects.toThrow(ConversacionYaTomadaError);
    expect(conversaciones.estadosEscritos).toEqual([]);
    expect(conversaciones.asignaciones).toEqual([]);
  });

  it.each(['PAUSADA', 'CERRADA', 'PENDIENTE_VINCULACION'] as const)(
    'estado %s → EstadoConversacionInvalidoError tipado (route → 409)',
    async (estado) => {
      const { conversaciones, useCase } = crearSuite(estado);

      await expect(
        useCase.ejecutar({ conversacionId: 1, usuario: OPERADOR }),
      ).rejects.toThrow(EstadoConversacionInvalidoError);
      expect(conversaciones.estadosEscritos).toEqual([]);
      expect(conversaciones.asignaciones).toEqual([]);
    },
  );

  it('conversación inexistente → ConversacionNoEncontradaError tipado (route → 404)', async () => {
    const { useCase } = crearSuite(null);

    await expect(
      useCase.ejecutar({ conversacionId: 99, usuario: OPERADOR }),
    ).rejects.toThrow(ConversacionNoEncontradaError);
  });

  it('repo sin la capacidad actualizarAsignacion (pre-E3) → falla explícito, jamás toma a medias', async () => {
    const { conversaciones, useCase } = crearSuite('ACTIVA_IA');
    conversaciones.sinAsignacion = true;

    await expect(
      useCase.ejecutar({ conversacionId: 1, usuario: OPERADOR }),
    ).rejects.toThrow(/actualizarAsignacion/);
  });
});
