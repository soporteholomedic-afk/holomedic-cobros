// @vitest-environment node
//
// The sweeper is Node-only (typeof window guard) while the global
// vitest environment is jsdom — this file pins the node environment so
// the guard sees no window and the interval actually starts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  procesarMock: vi.fn<(limite?: number) => Promise<{ procesadas: number; resultados: [] }>>(),
}));

vi.mock('../crearProcesadorTareasAgente', () => ({
  crearProcesadorTareasAgente: () => ({ procesar: mocks.procesarMock }),
}));

import { __resetBarredorForTests, iniciarBarredorTareas } from '../iniciarBarredorTareas';

/**
 * Contract for the lazy task sweeper (agente-ia-crm E2·T5):
 * - Starts nothing until the first interval tick (lazy — importing a
 *   route module must not drain anything by itself).
 * - Repeated calls never stack intervals (globalThis flag: HMR and
 *   the multiple route imports all converge on ONE sweeper).
 * - Each tick drains the queue fire-and-forget; a rejected drain is
 *   logged, never unhandled.
 * - __resetBarredorForTests clears the interval AND the flag, so a
 *   reset sweeper can start again.
 */

beforeEach(() => {
  vi.useFakeTimers();
  __resetBarredorForTests();
  mocks.procesarMock.mockReset().mockResolvedValue({ procesadas: 0, resultados: [] });
});

afterEach(() => {
  __resetBarredorForTests();
  vi.useRealTimers();
});

describe('iniciarBarredorTareas — barredor lazy de la cola (E2·T5)', () => {
  it('no procesa nada hasta el primer tick del intervalo', async () => {
    iniciarBarredorTareas(1000);

    await vi.advanceTimersByTimeAsync(999);
    expect(mocks.procesarMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.procesarMock).toHaveBeenCalledTimes(1);
  });

  it('llamadas repetidas no apilan intervalos: un solo drain por tick', async () => {
    iniciarBarredorTareas(1000);
    iniciarBarredorTareas(1000);
    iniciarBarredorTareas(500);

    await vi.advanceTimersByTimeAsync(1000);

    expect(mocks.procesarMock).toHaveBeenCalledTimes(1);
  });

  it('cada tick drena la cola (fire-and-forget)', async () => {
    iniciarBarredorTareas(1000);

    await vi.advanceTimersByTimeAsync(3000);

    expect(mocks.procesarMock).toHaveBeenCalledTimes(3);
  });

  it('el drain se llama sin límite explícito (default del use case)', async () => {
    iniciarBarredorTareas(1000);

    await vi.advanceTimersByTimeAsync(1000);

    expect(mocks.procesarMock).toHaveBeenCalledWith();
  });

  it('__resetBarredorForTests limpia intervalo y flag (y puede volver a arrancar)', async () => {
    iniciarBarredorTareas(1000);
    __resetBarredorForTests();

    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.procesarMock).not.toHaveBeenCalled();

    iniciarBarredorTareas(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.procesarMock).toHaveBeenCalledTimes(1);
  });

  it('un drain rechazado queda atrapado con log (nunca unhandled)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.procesarMock.mockRejectedValueOnce(new Error('boom del drain'));

    iniciarBarredorTareas(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(mocks.procesarMock).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[agente] barredor', 'boom del drain');
    errorSpy.mockRestore();
  });

  it('un drain rechazado sin Error instancia también se loguea sin crashear', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.procesarMock.mockRejectedValueOnce('falla string');

    iniciarBarredorTareas(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(errorSpy).toHaveBeenCalledWith('[agente] barredor', 'falla string');
    errorSpy.mockRestore();
  });
});
