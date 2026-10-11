import { describe, expect, it } from 'vitest';

import type {
  ConversacionCrm,
  ObservacionMemoria,
  ObservacionMemoriaEnLista,
} from '../../domain/entities';
import { ConversacionNoEncontradaError } from '../obtenerHiloConversacion';
import {
  GestionarMemoriaConversacionUseCase,
  GuardarMemoriaConversacionUseCase,
  ListarMemoriasConversacionUseCase,
  MemoriaAjenaError,
  MemoriaSinEmpresaError,
} from '../listarMemoriasConversacion';

/**
 * Use-case contract for the conversation-memory reads/writes an
 * operator performs (agente-ia-crm E3·T3):
 *
 * ListarMemoriasConversacionUseCase — the "Memorias" panel of the
 * hilo: the empresa's project observations (memoria.listarPorProyecto)
 * CLIENT-filtered to THIS conversation's chat session plus the fixed
 * 'empresa' session, newest-first, with the pineada flag matched by
 * TITULO against contexto()'s pinned render (pinned lines carry no
 * id — id 0 — titulo is the only key). Sin empresa vinculada → empty
 * list + empresaId null. Conversación inexistente → typed 404.
 *
 * GestionarMemoriaConversacionUseCase — pinear/eliminar ONE
 * observation with an OWNERSHIP guard: the observation must belong
 * to the conversation's project (membership via listarPorProyecto
 * BEFORE the write) — a foreign observation (another empresa's
 * project) is a typed 404, never a successful pin/delete.
 */

function filaProyecto(sobres: Partial<ObservacionMemoriaEnLista> = {}): ObservacionMemoriaEnLista {
  return {
    id: 101,
    sesion: 'chat-1',
    tipo: 'hecho_cliente',
    titulo: 'Factura 123',
    contenido: 'Necesita factura a nombre de la empresa',
    creadoEn: new Date('2026-06-10T10:00:00Z'),
    ...sobres,
  };
}

function observacionPinned(sobres: Partial<ObservacionMemoria> = {}): ObservacionMemoria {
  return {
    id: 0,
    nivel: 'empresa',
    tipo: 'acuerdo',
    titulo: 'Acuerdo de horario',
    contenido: 'Llamar solo por la tarde',
    creadoEn: new Date(0),
    ...sobres,
  };
}

class FakeMemoria {
  filasProyecto: ObservacionMemoriaEnLista[] = [];
  contexto: ObservacionMemoria[] = [];
  pineados: number[] = [];
  eliminados: Array<{ id: number; empresaId: number }> = [];
  /** When true the adapter predates listarPorProyecto (optional port). */
  sinListarPorProyecto = false;
  sinEliminar = false;

  async listarPorProyecto(): Promise<ObservacionMemoriaEnLista[]> {
    if (this.sinListarPorProyecto) throw new Error('listarPorProyecto no existe en este fake');
    return this.filasProyecto.map((f) => ({ ...f, creadoEn: new Date(f.creadoEn) }));
  }

  async contextoLeer(): Promise<ObservacionMemoria[]> {
    return this.contexto.map((o) => ({ ...o }));
  }

  async pinear(id: number): Promise<void> {
    this.pineados.push(id);
  }

  async eliminar(id: number, empresaId: number): Promise<void> {
    if (this.sinEliminar) throw new Error('eliminar no existe en este fake');
    this.eliminados.push({ id, empresaId });
  }
}

class FakeConversacionesMemoria {
  filas: ConversacionCrm[] = [];

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
}

/** Dep MÁS ANCHO (gestionar): el use case listar lo acepta estructuralmente. */
type MemoriaDeps = ConstructorParameters<typeof GestionarMemoriaConversacionUseCase>[0]['memoria'];

/** FakeMemoria shaped as the use-case dep — lazy: reads the flags per call. */
function comoMemoriaDep(fake: FakeMemoria): MemoriaDeps {
  const dep: MemoriaDeps = {
    contexto: () => fake.contextoLeer(),
    pinear: (id: number) => fake.pinear(id),
  };
  if (!fake.sinListarPorProyecto) {
    dep.listarPorProyecto = () => fake.listarPorProyecto();
  }
  if (!fake.sinEliminar) {
    dep.eliminar = (id: number, empresaId: number) => fake.eliminar(id, empresaId);
  }
  return dep;
}

function crearSuiteListar(conversacion: Partial<ConversacionCrm> | null = {}): {
  conversaciones: FakeConversacionesMemoria;
  memoria: FakeMemoria;
  useCase: ListarMemoriasConversacionUseCase;
} {
  const conversaciones = new FakeConversacionesMemoria();
  if (conversacion !== null) conversaciones.sembrar(conversacion);
  const memoria = new FakeMemoria();
  const useCase = new ListarMemoriasConversacionUseCase({
    conversaciones,
    memoria: comoMemoriaDep(memoria),
  });
  return { conversaciones, memoria, useCase };
}

describe('ListarMemoriasConversacionUseCase — panel de memorias del hilo (E3·T3)', () => {
  it('filtra por sesión: chat de ESTA conversación + empresa; otro chat queda fuera; newest-first', async () => {
    const { memoria, useCase } = crearSuiteListar();
    memoria.filasProyecto = [
      filaProyecto({ id: 101, sesion: 'chat-1', titulo: 'Chat propio', creadoEn: new Date('2026-06-10T10:00:00Z') }),
      filaProyecto({ id: 102, sesion: 'chat-2', titulo: 'Chat ajeno', creadoEn: new Date('2026-06-11T10:00:00Z') }),
      filaProyecto({ id: 103, sesion: 'empresa', titulo: 'Dato empresa', creadoEn: new Date('2026-06-09T10:00:00Z') }),
    ];

    const resultado = await useCase.ejecutar(1);

    expect(resultado.empresaId).toBe(7);
    expect(resultado.memorias.map((m) => m.id)).toEqual([101, 103]);
    expect(resultado.memorias[0]).toMatchObject({
      id: 101,
      nivel: 'chat',
      tipo: 'hecho_cliente',
      titulo: 'Chat propio',
      pineada: false,
      creadoEn: '2026-06-10T10:00:00.000Z',
    });
    expect(resultado.memorias[1]).toMatchObject({ id: 103, nivel: 'empresa' });
  });

  it('pineada se resuelve por TITULO contra el bloque Pinned de contexto (los pineados cruzan con id 0)', async () => {
    const { memoria, useCase } = crearSuiteListar();
    memoria.filasProyecto = [
      filaProyecto({ id: 101, sesion: 'empresa', titulo: 'Factura 123' }),
      filaProyecto({ id: 102, sesion: 'chat-1', titulo: 'Otra cosa' }),
    ];
    memoria.contexto = [observacionPinned({ titulo: 'Factura 123' })];

    const resultado = await useCase.ejecutar(1);

    expect(resultado.memorias.find((m) => m.id === 101)?.pineada).toBe(true);
    expect(resultado.memorias.find((m) => m.id === 102)?.pineada).toBe(false);
  });

  it('conversación sin empresa vinculada → lista vacía + empresaId null (sin tocar la memoria)', async () => {
    const { memoria, useCase } = crearSuiteListar({ empresaId: null });

    const resultado = await useCase.ejecutar(1);

    expect(resultado).toEqual({ memorias: [], empresaId: null });
    expect(memoria.filasProyecto).toEqual([]);
  });

  it('conversación inexistente → ConversacionNoEncontradaError tipado (route → 404)', async () => {
    const { useCase } = crearSuiteListar(null);

    await expect(useCase.ejecutar(99)).rejects.toThrow(ConversacionNoEncontradaError);
  });

  it('adapter sin listarPorProyecto (puerto opcional) → degradación: lista vacía, empresaId intacto', async () => {
    const { conversaciones } = crearSuiteListar();
    const useCase = new ListarMemoriasConversacionUseCase({
      conversaciones,
      memoria: { contexto: () => Promise.resolve([]) },
    });

    const resultado = await useCase.ejecutar(1);

    expect(resultado).toEqual({ memorias: [], empresaId: 7 });
  });
});

describe('GestionarMemoriaConversacionUseCase — pinear/eliminar con guardia de propiedad (E3·T3)', () => {
  function crearSuiteGestionar(conversacion: Partial<ConversacionCrm> | null = {}): {
    conversaciones: FakeConversacionesMemoria;
    memoria: FakeMemoria;
    useCase: GestionarMemoriaConversacionUseCase;
  } {
    const conversaciones = new FakeConversacionesMemoria();
    if (conversacion !== null) conversaciones.sembrar(conversacion);
    const memoria = new FakeMemoria();
    const useCase = new GestionarMemoriaConversacionUseCase({
      conversaciones,
      memoria: comoMemoriaDep(memoria),
    });
    return { conversaciones, memoria, useCase };
  }

  it('pinear una observación PROPIA (en el proyecto de la empresa) → memoria.pinear(id)', async () => {
    const { memoria, useCase } = crearSuiteGestionar();
    memoria.filasProyecto = [filaProyecto({ id: 101 })];

    const resultado = await useCase.ejecutar({ conversacionId: 1, observacionId: 101, accion: 'pinear' });

    expect(resultado).toEqual({ ok: true });
    expect(memoria.pineados).toEqual([101]);
    expect(memoria.eliminados).toEqual([]);
  });

  it('eliminar una observación PROPIA → memoria.eliminar(id, empresaId de la conversación)', async () => {
    const { memoria, useCase } = crearSuiteGestionar();
    memoria.filasProyecto = [filaProyecto({ id: 101 })];

    const resultado = await useCase.ejecutar({ conversacionId: 1, observacionId: 101, accion: 'eliminar' });

    expect(resultado).toEqual({ ok: true });
    expect(memoria.eliminados).toEqual([{ id: 101, empresaId: 7 }]);
    expect(memoria.pineados).toEqual([]);
  });

  it('observación AJENA (no pertenece al proyecto de esta empresa) → MemoriaAjenaError tipado (route → 404), sin escribir', async () => {
    const { memoria, useCase } = crearSuiteGestionar();
    memoria.filasProyecto = [filaProyecto({ id: 101 })];

    await expect(
      useCase.ejecutar({ conversacionId: 1, observacionId: 999, accion: 'pinear' }),
    ).rejects.toThrow(MemoriaAjenaError);
    await expect(
      useCase.ejecutar({ conversacionId: 1, observacionId: 999, accion: 'eliminar' }),
    ).rejects.toThrow(MemoriaAjenaError);
    expect(memoria.pineados).toEqual([]);
    expect(memoria.eliminados).toEqual([]);
  });

  it('conversación sin empresa → MemoriaAjenaError (no hay memorías que gestionar)', async () => {
    const { useCase } = crearSuiteGestionar({ empresaId: null });

    await expect(
      useCase.ejecutar({ conversacionId: 1, observacionId: 101, accion: 'pinear' }),
    ).rejects.toThrow(MemoriaAjenaError);
  });

  it('conversación inexistente → ConversacionNoEncontradaError tipado (route → 404)', async () => {
    const { useCase } = crearSuiteGestionar(null);

    await expect(
      useCase.ejecutar({ conversacionId: 99, observacionId: 101, accion: 'eliminar' }),
    ).rejects.toThrow(ConversacionNoEncontradaError);
  });
});

describe('GuardarMemoriaConversacionUseCase — memoria manual del operador (E3·T5)', () => {
  /** Fake narrow: captura el guardar tal como el puerto lo recibe. */
  class FakeMemoriaGuardar {
    guardadas: Array<{
      empresaId: number;
      conversacionId: number;
      nivel: string;
      tipo: string;
      titulo: string;
      contenido: string;
      operationId: string;
    }> = [];

    async guardar(entrada: {
      empresaId: number;
      conversacionId: number;
      nivel: 'chat' | 'empresa';
      tipo: string;
      titulo: string;
      contenido: string;
      operationId: string;
    }): Promise<{ id: number; estado: 'guardado' | 'comprometido' }> {
      this.guardadas.push(entrada);
      return { id: 555, estado: 'comprometido' };
    }
  }

  function crearSuite(conversacion: Partial<ConversacionCrm> | null = {}): {
    conversaciones: FakeConversacionesMemoria;
    memoria: FakeMemoriaGuardar;
    useCase: GuardarMemoriaConversacionUseCase;
  } {
    const conversaciones = new FakeConversacionesMemoria();
    if (conversacion !== null) conversaciones.sembrar(conversacion);
    const memoria = new FakeMemoriaGuardar();
    const useCase = new GuardarMemoriaConversacionUseCase({ conversaciones, memoria });
    return { conversaciones, memoria, useCase };
  }

  it('guarda en el proyecto de la empresa con operationId manual-<uuid> y SIN auto-pin', async () => {
    const { memoria, useCase } = crearSuite();

    const resultado = await useCase.ejecutar({
      conversacionId: 1,
      nivel: 'chat',
      tipo: 'indicacion_humana',
      titulo: 'Indicación humana',
      contenido: 'Crédito fiscal 30 días: SÍ',
    });

    expect(resultado).toEqual({ id: 555, estado: 'comprometido' });
    expect(memoria.guardadas).toHaveLength(1);
    const entrada = memoria.guardadas[0]!;
    expect(entrada.empresaId).toBe(7);
    expect(entrada.conversacionId).toBe(1);
    expect(entrada.nivel).toBe('chat');
    expect(entrada.tipo).toBe('indicacion_humana');
    expect(entrada.titulo).toBe('Indicación humana');
    expect(entrada.contenido).toBe('Crédito fiscal 30 días: SÍ');
    // Idempotencia manual: cada guardado lleva su propio operationId
    // 'manual-<uuid>' (editable = eliminar + guardar NUEVO).
    expect(entrada.operationId).toMatch(/^manual-[0-9a-f-]{36}$/);
  });

  it('nivel empresa → sesión fija empresa (misma llamada, nivel cruzado)', async () => {
    const { memoria, useCase } = crearSuite();

    await useCase.ejecutar({
      conversacionId: 1,
      nivel: 'empresa',
      tipo: 'acuerdo',
      titulo: 'Acuerdo de firmas',
      contenido: 'Cronograma mensual',
    });

    expect(memoria.guardadas[0]?.nivel).toBe('empresa');
  });

  it('dos guardados → operationIds distintos (uuid por operación)', async () => {
    const { memoria, useCase } = crearSuite();

    await useCase.ejecutar({
      conversacionId: 1,
      nivel: 'chat',
      tipo: 'acuerdo',
      titulo: 'A',
      contenido: 'C',
    });
    await useCase.ejecutar({
      conversacionId: 1,
      nivel: 'chat',
      tipo: 'acuerdo',
      titulo: 'B',
      contenido: 'C',
    });

    const [primero, segundo] = memoria.guardadas;
    expect(primero!.operationId).not.toBe(segundo!.operationId);
  });

  it('conversación sin empresa vinculada → MemoriaSinEmpresaError tipado (route → 400)', async () => {
    const { memoria, useCase } = crearSuite({ empresaId: null });

    await expect(
      useCase.ejecutar({
        conversacionId: 1,
        nivel: 'chat',
        tipo: 'acuerdo',
        titulo: 'T',
        contenido: 'C',
      }),
    ).rejects.toThrow(MemoriaSinEmpresaError);
    expect(memoria.guardadas).toEqual([]);
  });

  it('titulo/contenido en blanco (trim) → ValidationError, sin escribir', async () => {
    const { memoria, useCase } = crearSuite();

    await expect(
      useCase.ejecutar({ conversacionId: 1, nivel: 'chat', tipo: 'acuerdo', titulo: '   ', contenido: 'C' }),
    ).rejects.toThrow(/titulo/);
    await expect(
      useCase.ejecutar({ conversacionId: 1, nivel: 'chat', tipo: 'acuerdo', titulo: 'T', contenido: '' }),
    ).rejects.toThrow(/contenido/);
    expect(memoria.guardadas).toEqual([]);
  });

  it('conversación inexistente → ConversacionNoEncontradaError tipado (route → 404)', async () => {
    const { useCase } = crearSuite(null);

    await expect(
      useCase.ejecutar({ conversacionId: 99, nivel: 'chat', tipo: 'acuerdo', titulo: 'T', contenido: 'C' }),
    ).rejects.toThrow(ConversacionNoEncontradaError);
  });
});
