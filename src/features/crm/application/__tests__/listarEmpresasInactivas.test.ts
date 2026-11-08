import { describe, expect, it } from 'vitest';

import type { IAtencionesServicio } from '../../domain/ports';
import { ListarEmpresasInactivasUseCase } from '../listarEmpresasInactivas';
import { HOY, empresa, makeFakeRepo } from './fakeRepo';

/** Fake SIGLA bulk port: records the RUC batches and answers from a map. */
function fakeAtencionesBulk(respuestas: Record<string, string | null>): IAtencionesServicio & { lotes: string[][] } {
  const lotes: string[][] = [];
  return {
    lotes,
    async ultimaAtencion() {
      throw new Error('the inactivas list must use the bulk lookup, not one query per RUC');
    },
    async ultimaAtencionPorRucs(rucs) {
      lotes.push(rucs);
      return new Map(rucs.map((ruc) => [ruc, respuestas[ruc] ?? null]));
    },
  };
}

const cliente = (id: string, razonSocial: string, ruc: string | null) => ({
  idEmpresa: id,
  razonSocial,
  ruc,
  relacion: 'cliente' as const,
});

describe('ListarEmpresasInactivasUseCase — clientes SIGLA sin actividad 4+ meses', () => {
  it('lists only clientes in sin_actividad, most abandoned first, with months computed', async () => {
    const repo = makeFakeRepo([
      empresa({ ...cliente('e-a', 'Clínica Reciente', '20100000001'), }),
      empresa({ ...cliente('e-b', 'Instituto Medio', '20100000002') }),
      empresa({ ...cliente('e-c', 'Laboratorio Abandonado', '20100000003') }),
      empresa({ ...cliente('e-d', 'Consultorio Prospecto', '20100000004'), relacion: 'prospecto' }),
    ]);
    const atenciones = fakeAtencionesBulk({
      '20100000001': '2026-08-15', // 2 months before HOY -> reciente
      '20100000002': '2026-06-20', // 4 months -> sin_actividad
      '20100000003': '2026-05-01', // 5 months -> sin_actividad (most abandoned)
      '20100000004': '2025-01-01', // prospecto: data exists but it is out of scope
    });
    const r = await new ListarEmpresasInactivasUseCase(repo.empresaRepo, atenciones).execute(HOY);
    expect(atenciones.lotes).toEqual([['20100000001', '20100000002', '20100000003']]); // one bulk call, clientes only (prospectos out)
    expect(r.sinInformacion).toBe(0);
    expect(r.filas.map((f) => [f.idEmpresa, f.mesesSinActividad])).toEqual([
      ['e-c', 5], // most abandoned first
      ['e-b', 4],
    ]);
    expect(r.filas[0]).toMatchObject({
      idEmpresa: 'e-c',
      razonSocial: 'Laboratorio Abandonado',
      ruc: '20100000003',
      sector: 'Construcción',
      ultimaAtencion: '2026-05-01',
      estado: 'sin_actividad',
    });
  });

  it('a cliente whose RUC has no attention at all in SIGLA is pendiente_primera, listed last (S6.7: never called inactive)', async () => {
    const repo = makeFakeRepo([
      empresa({ ...cliente('e-nunca', 'Clínica Nueva', '20200000001') }),
      empresa({ ...cliente('e-vieja', 'Clínica Vieja', '20100000002') }),
    ]);
    const atenciones = fakeAtencionesBulk({ '20100000002': '2026-05-01' }); // e-nunca unknown to SIGLA
    const r = await new ListarEmpresasInactivasUseCase(repo.empresaRepo, atenciones).execute(HOY);
    expect(r.filas.map((f) => f.idEmpresa)).toEqual(['e-vieja', 'e-nunca']);
    expect(r.filas[1]).toMatchObject({
      estado: 'pendiente_primera',
      ultimaAtencion: null,
      mesesSinActividad: null,
    });
    expect(r.sinInformacion).toBe(0);
  });

  it('the 4-month threshold is exact (fixed, no UI): day 30 of 4 months ago enters, day 1 of 3 months ago does not', async () => {
    const repo = makeFakeRepo([
      empresa({ ...cliente('e-limite', 'En el límite', '20100000005') }), // 2026-06-30 -> exactly 4 months
      empresa({ ...cliente('e-fuera', 'Todavía fresca', '20100000006') }), // 2026-07-01 -> 3 months
    ]);
    const atenciones = fakeAtencionesBulk({ '20100000005': '2026-06-30', '20100000006': '2026-07-01' });
    const r = await new ListarEmpresasInactivasUseCase(repo.empresaRepo, atenciones).execute(HOY);
    expect(r.filas.map((f) => f.idEmpresa)).toEqual(['e-limite']);
  });

  it('a cliente without RUC can never reach SIGLA: excluded and counted as sinInformacion', async () => {
    const repo = makeFakeRepo([
      empresa({ ...cliente('e-sinruc', 'Sin RUC S.A.C.', null) }),
      empresa({ ...cliente('e-ok', 'Con RUC S.A.C.', '20100000007') }),
    ]);
    const atenciones = fakeAtencionesBulk({ '20100000007': '2026-04-10' });
    const r = await new ListarEmpresasInactivasUseCase(repo.empresaRepo, atenciones).execute(HOY);
    expect(atenciones.lotes).toEqual([['20100000007']]);
    expect(r.sinInformacion).toBe(1);
    expect(r.filas.map((f) => f.idEmpresa)).toEqual(['e-ok']);
  });

  it('attaches the last CRM interaction per listed row (S6), querying only the listed ids', async () => {
    const repo = makeFakeRepo([
      empresa({ ...cliente('e-vieja', 'Clínica Vieja', '20100000001') }),
      empresa({ ...cliente('e-sola', 'Sin Interacciones S.A.C.', '20100000003') }),
      empresa({ ...cliente('e-fuera', 'Reciente S.A.C.', '20100000002') }),
    ]);
    repo.interacciones.push(
      {
        idInteraccion: 1,
        idEmpresa: 'e-vieja',
        idOportunidad: null,
        fecha: '2026-08-01T10:00:00.000Z',
        idUsuario: 'u-1',
        nombreUsuario: 'Scott Palomino',
        direccion: 'saliente',
        medio: 'llamada',
        medioOtro: null,
        resultado: 'no_contesto',
        resumen: null,
      },
      {
        idInteraccion: 2,
        idEmpresa: 'e-vieja',
        idOportunidad: null,
        fecha: '2026-09-01T10:00:00.000Z',
        idUsuario: 'u-1',
        nombreUsuario: 'Scott Palomino',
        direccion: 'saliente',
        medio: 'llamada',
        medioOtro: null,
        resultado: 'deje_mensaje',
        resumen: null,
      },
      {
        idInteraccion: 3,
        idEmpresa: 'e-fuera',
        idOportunidad: null,
        fecha: '2026-10-30T10:00:00.000Z',
        idUsuario: 'u-1',
        nombreUsuario: 'Scott Palomino',
        direccion: 'entrante',
        medio: 'whatsapp',
        medioOtro: null,
        resultado: 'respondido',
        resumen: null,
      },
    );
    const atenciones = fakeAtencionesBulk({ '20100000001': '2026-05-01', '20100000002': '2026-09-15', '20100000003': '2026-03-20' });
    const consultadas: string[][] = [];
    const original = repo.empresaRepo.ultimaInteraccionPorEmpresas.bind(repo.empresaRepo);
    repo.empresaRepo.ultimaInteraccionPorEmpresas = async (ids) => {
      consultadas.push(ids);
      return original(ids);
    };
    const r = await new ListarEmpresasInactivasUseCase(repo.empresaRepo, atenciones).execute(HOY);
    // e-fuera is reciente: never listed, never queried (S6)
    // Most abandoned first: e-sola (2026-03-20, ~7 months) above e-vieja (2026-05-01, ~6 months)
    expect(consultadas).toEqual([['e-sola', 'e-vieja']]);
    expect(r.filas.map((f) => [f.idEmpresa, f.ultimoContactoCrm])).toEqual([
      ['e-sola', null],
      ['e-vieja', '2026-09-01T10:00:00.000Z'], // newest of its interactions
    ]);
  });
});
