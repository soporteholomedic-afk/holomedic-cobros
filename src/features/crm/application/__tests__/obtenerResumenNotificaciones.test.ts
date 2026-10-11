import { describe, expect, it } from 'vitest';

import { ObtenerResumenNotificacionesUseCase } from '../obtenerResumenNotificaciones';

/**
 * Use-case contract for obtenerResumenNotificaciones (agente-ia-crm
 * E3·T3) — the bandeja badge read: {requiereAyuda (estado
 * REQUIERE_HUMANO), pendienteVinculacion (estado
 * PENDIENTE_VINCULACION), total, ultimaActividad (MAX
 * ultimoMensajeEn)}. The repo's contarResumen crosses with Date (|
 * null) — the use case maps it to the ISO string presentation, null
 * stays null. A repo without the E3 count capability fails loudly
 * (aplicarIndicacion precedent: a silent zero badge would hide
 * escalations).
 */

class FakeConversacionesConteo {
  resumen:
    | { requiereAyuda: number; pendienteVinculacion: number; total: number; ultimaActividad: Date | null }
    | undefined;

  async contarResumen(): Promise<
    { requiereAyuda: number; pendienteVinculacion: number; total: number; ultimaActividad: Date | null }
  > {
    if (this.resumen === undefined) throw new Error('no sembrado');
    return this.resumen;
  }
}

describe('ObtenerResumenNotificacionesUseCase — badge de la bandeja (E3·T3)', () => {
  it('mapea el conteo del repo: Date → ISO string, null → null', async () => {
    const repo = new FakeConversacionesConteo();
    repo.resumen = {
      requiereAyuda: 2,
      pendienteVinculacion: 5,
      total: 40,
      ultimaActividad: new Date('2026-06-15T12:30:00.000Z'),
    };

    const resumen = await new ObtenerResumenNotificacionesUseCase({
      conversaciones: repo,
    }).ejecutar();

    expect(resumen).toEqual({
      requiereAyuda: 2,
      pendienteVinculacion: 5,
      total: 40,
      ultimaActividad: '2026-06-15T12:30:00.000Z',
    });
  });

  it('sin conversaciones → ultimaActividad null (MAX sobre conjunto vacío)', async () => {
    const repo = new FakeConversacionesConteo();
    repo.resumen = { requiereAyuda: 0, pendienteVinculacion: 0, total: 0, ultimaActividad: null };

    await expect(
      new ObtenerResumenNotificacionesUseCase({ conversaciones: repo }).ejecutar(),
    ).resolves.toEqual({
      requiereAyuda: 0,
      pendienteVinculacion: 0,
      total: 0,
      ultimaActividad: null,
    });
  });

  it('repo sin la capacidad contarResumen (pre-E3) → falla explícito (jamás un badge en cero mintiendo)', async () => {
    const sinCapacidad: { conversaciones: Record<string, never> } = { conversaciones: {} };

    await expect(
      new ObtenerResumenNotificacionesUseCase(sinCapacidad).ejecutar(),
    ).rejects.toThrow(/contarResumen/);
  });
});
