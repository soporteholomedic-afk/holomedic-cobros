import { describe, expect, it } from 'vitest';

import type { ConversacionCrm, EstadoConversacion, ModoConversacion } from '../../domain/entities';
import { ValidationError } from '../../domain/errors';
import { ConversacionNoEncontradaError } from '../obtenerHiloConversacion';
import { EstadoConversacionInvalidoError } from '../tomarConversacion';
import {
  EscalarConversacionUseCase,
  type EscalarConversacionDeps,
} from '../escalarConversacion';

/**
 * Use-case contract for escalarConversacion (agente-ia-crm E3·T3) —
 * reassign a taken conversation to ANOTHER operator: only from
 * TOMADA_HUMANO (keeps TOMADA_HUMANO — a pure owner swap via
 * actualizarAsignacion, NO estado write). The target's assignability
 * (permiso crm_conversaciones) is validated in the ROUTE (empresas
 * asignar precedent: identity checks live route-side, the use case
 * stays pure over repos); the use case only guards shape + estado.
 */

class FakeConversacionesEscalar {
  filas: ConversacionCrm[] = [];
  estadosEscritos: EstadoConversacion[] = [];
  asignaciones: Array<{ id: number; asignadaA: string | null; modo: ModoConversacion }> = [];

  sembrar(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
    const ahora = new Date().toISOString();
    const fila: ConversacionCrm = {
      id: 1,
      empresaId: 7,
      contactoId: 42,
      canal: 'WHATSAPP',
      telefono: '+595981234567',
      identificadorCanal: 'US.1349',
      estado: 'TOMADA_HUMANO',
      asignadaA: 'juana',
      modo: 'HUMANO',
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
    this.asignaciones.push({ id, asignadaA, modo });
    const fila = this.filas.find((f) => f.id === id);
    if (fila !== undefined) {
      fila.asignadaA = asignadaA;
      fila.modo = modo;
    }
  }
}

function crearSuite(estado: EstadoConversacion | null = 'TOMADA_HUMANO'): {
  conversaciones: FakeConversacionesEscalar;
  useCase: EscalarConversacionUseCase;
} {
  const conversaciones = new FakeConversacionesEscalar();
  if (estado !== null) conversaciones.sembrar({ estado });
  const useCase = new EscalarConversacionUseCase({
    conversaciones: conversaciones as EscalarConversacionDeps['conversaciones'],
  });
  return { conversaciones, useCase };
}

describe('EscalarConversacionUseCase — reasignación entre operadores (E3·T3)', () => {
  it('happy path: mantiene TOMADA_HUMANO y cambia asignadaA al target SIN re-escribir estado', async () => {
    const { conversaciones, useCase } = crearSuite('TOMADA_HUMANO');

    const resultado = await useCase.ejecutar({ conversacionId: 1, usuarioId: ' mlopez ' });

    expect(resultado).toEqual({ estado: 'TOMADA_HUMANO', asignadaA: 'mlopez' });
    // Solo la asignación: el estado ya era TOMADA_HUMANO y sigue siéndolo.
    expect(conversaciones.estadosEscritos).toEqual([]);
    expect(conversaciones.asignaciones).toEqual([{ id: 1, asignadaA: 'mlopez', modo: 'HUMANO' }]);
  });

  it('usuarioId vacío → ValidationError tipado (route → 400)', async () => {
    const { conversaciones, useCase } = crearSuite('TOMADA_HUMANO');

    await expect(useCase.ejecutar({ conversacionId: 1, usuarioId: '   ' })).rejects.toThrow(
      ValidationError,
    );
    expect(conversaciones.asignaciones).toEqual([]);
  });

  it.each(['ACTIVA_IA', 'REQUIERE_HUMANO', 'PAUSADA', 'CERRADA', 'PENDIENTE_VINCULACION'] as const)(
    'estado %s → EstadoConversacionInvalidoError tipado (route → 409)',
    async (estado) => {
      const { conversaciones, useCase } = crearSuite(estado);

      await expect(useCase.ejecutar({ conversacionId: 1, usuarioId: 'mlopez' })).rejects.toThrow(
        EstadoConversacionInvalidoError,
      );
      expect(conversaciones.asignaciones).toEqual([]);
    },
  );

  it('conversación inexistente → ConversacionNoEncontradaError tipado (route → 404)', async () => {
    const { useCase } = crearSuite(null);

    await expect(useCase.ejecutar({ conversacionId: 99, usuarioId: 'mlopez' })).rejects.toThrow(
      ConversacionNoEncontradaError,
    );
  });
});
