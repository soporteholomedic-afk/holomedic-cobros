import { describe, expect, it } from 'vitest';

import { DatosEmpresaInvalidosError, OportunidadNotFoundError } from '../../domain/errors';
import { EditarOportunidadUseCase, type EditarOportunidadDatos } from '../editarOportunidad';
import { foto, makeFakeRepo, oportunidad } from './fakeRepo';

const DATOS: EditarOportunidadDatos = {
  nombre: '  Exámenes periódicos 2027  ',
  servicio: ' Periódicos ',
  responsableId: 'u-3',
  responsableNombre: 'Luis Ríos',
  origen: 'internet',
  montoEstimado: 8_500,
};

const editar = (repo: ReturnType<typeof makeFakeRepo>, id = 'o-1', datos: EditarOportunidadDatos = DATOS) =>
  new EditarOportunidadUseCase(repo.oportunidadRepo).execute(id, datos);

describe('EditarOportunidadUseCase', () => {
  it('replaces the editable data and leaves stage, medium, motivo and follow-up state alone', async () => {
    const repo = makeFakeRepo([], [], [
      oportunidad({
        etapa: 'cotizado',
        medio: 'correo',
        motivo: { categoria: 'precio', detalle1: 'S/ 1', detalle2: null, notas: null },
        intentosSinRespuesta: 2,
        faltaResponderDesde: '2026-10-30T10:00:00.000Z',
        proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-05' },
        sugerenciaDescartadaEn: 3,
      }),
    ]);
    const o = await editar(repo);
    expect(o).toMatchObject({
      nombre: 'Exámenes periódicos 2027',
      servicio: 'Periódicos',
      responsableId: 'u-3',
      responsableNombre: 'Luis Ríos',
      origen: 'internet',
      montoEstimado: 8_500,
      // Untouched deal state:
      etapa: 'cotizado',
      medio: 'correo',
      intentosSinRespuesta: 2,
      faltaResponderDesde: '2026-10-30T10:00:00.000Z',
      proximaAccion: { tipo: 'llamar', detalle: null, fecha: '2026-11-05' },
      sugerenciaDescartadaEn: 3,
    });
    expect(repo.oportunidades[0]?.motivo?.categoria).toBe('precio');
    expect(repo.escrituras).toBe(1);
  });

  it('validates before writing: a rejected edit stores nothing', async () => {
    const repo = makeFakeRepo([], [], [oportunidad()]);
    const antes = foto(repo);
    for (const datos of [{ ...DATOS, nombre: '  ' }, { ...DATOS, montoEstimado: 0 }, { ...DATOS, origen: 'zzz' }]) {
      const error = await editar(repo, 'o-1', datos).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DatosEmpresaInvalidosError);
    }
    expect(foto(repo)).toEqual(antes);
  });

  it('throws OportunidadNotFoundError for an unknown id', async () => {
    const repo = makeFakeRepo();
    await expect(editar(repo)).rejects.toBeInstanceOf(OportunidadNotFoundError);
    expect(repo.oportunidades).toHaveLength(0);
  });
});
