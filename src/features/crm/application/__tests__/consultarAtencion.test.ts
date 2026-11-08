import { describe, expect, it } from 'vitest';

import { EmpresaNotFoundError } from '../../domain/errors';
import type { IAtencionesServicio } from '../../domain/ports';
import { ConsultarAtencionUseCase } from '../consultarAtencion';
import { HOY, empresa, makeFakeRepo, type FakeRepo } from './fakeRepo';

/** Fake SIGLA port: records which RUCs were asked and answers from a map. */
function fakeAtenciones(respuestas: Record<string, string | null>): IAtencionesServicio & { rucs: string[] } {
  const rucs: string[] = [];
  return {
    rucs,
    async ultimaAtencion(ruc) {
      rucs.push(ruc);
      return respuestas[ruc] ?? null;
    },
    async ultimaAtencionPorRucs(lista) {
      return new Map(lista.map((ruc) => [ruc, respuestas[ruc] ?? null]));
    },
    async clientesConActividad() {
      return [];
    },
  };
}

const consultar = (repo: FakeRepo, atenciones: IAtencionesServicio, idEmpresa = 'e-1', hoy = HOY) =>
  new ConsultarAtencionUseCase(repo.empresaRepo, atenciones).execute(idEmpresa, hoy);

describe('ConsultarAtencionUseCase — lee SIGLA en vivo (S8)', () => {
  it('asks the servicio with the empresa RUC and returns the activity + derived state', async () => {
    const repo = makeFakeRepo([empresa({ relacion: 'cliente' })]);
    const atenciones = fakeAtenciones({ '20512345678': '2026-08-01' });
    const r = await consultar(repo, atenciones);
    expect(atenciones.rucs).toEqual(['20512345678']);
    expect(r.actividad).toEqual({ ultimaAtencion: '2026-08-01', ruc: '20512345678' });
    expect(r.estado).toBe('reciente'); // 2026-08-01 → 2026-10-31 = 2 months < 4
  });

  it('a cliente whose RUC has no attention in SIGLA is Pendiente de primera atención (S6.7)', async () => {
    const repo = makeFakeRepo([empresa({ relacion: 'cliente' })]);
    const atenciones = fakeAtenciones({});
    const r = await consultar(repo, atenciones);
    expect(r.actividad).toEqual({ ultimaAtencion: null, ruc: '20512345678' });
    expect(r.estado).toBe('pendiente_primera');
  });

  it('a cliente with an old last attention is Sin actividad de servicios reciente (S5.3/S6.6)', async () => {
    const repo = makeFakeRepo([empresa({ relacion: 'cliente' })]);
    const atenciones = fakeAtenciones({ '20512345678': '2026-05-01' }); // 5 months before HOY
    const r = await consultar(repo, atenciones);
    expect(r.estado).toBe('sin_actividad');
  });

  it('a prospecto shows Sin información — but the lookup still runs with its RUC when it has one', async () => {
    const repo = makeFakeRepo([empresa({ relacion: 'prospecto' })]);
    const atenciones = fakeAtenciones({ '20512345678': '2026-05-01' });
    const r = await consultar(repo, atenciones);
    expect(atenciones.rucs).toEqual(['20512345678']);
    expect(r.estado).toBe('sin_informacion');
  });

  it('an empresa without RUC never reaches SIGLA: null activity, no call (S6.7)', async () => {
    const repo = makeFakeRepo([empresa({ ruc: null })]);
    const atenciones = fakeAtenciones({});
    const r = await consultar(repo, atenciones);
    expect(atenciones.rucs).toEqual([]);
    expect(r.actividad).toEqual({ ultimaAtencion: null, ruc: null });
    expect(r.estado).toBe('sin_informacion');
  });

  it('throws EmpresaNotFoundError for an unknown empresa', async () => {
    const repo = makeFakeRepo();
    await expect(consultar(repo, fakeAtenciones({}), 'nope')).rejects.toBeInstanceOf(EmpresaNotFoundError);
  });
});
