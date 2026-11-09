import { describe, expect, it } from 'vitest';

import type { IAtencionesServicio } from '../../domain/ports';
import type { EmpresaInactiva } from '../../application/listarEmpresasInactivas';
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
    async clientesConActividad() {
      return [];
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
    // e-fuera is reciente: never listed, never queried (S6). The bulk runs
    // BEFORE sorting (orden = 'ultimoContacto' needs it), in row-build order.
    expect(consultadas).toEqual([['e-vieja', 'e-sola']]);
    expect(r.filas.map((f) => [f.idEmpresa, f.ultimoContactoCrm])).toEqual([
      ['e-sola', null],
      ['e-vieja', '2026-09-01T10:00:00.000Z'], // newest of its interactions
    ]);
  });
});

// ---------------------------------------------------------------------------
// Extensión SIGLA-céntrica (S10/S13): segmento "Solo en SIGLA" — clientes
// dormidos de SIGLA sin ficha en el CRM.
// ---------------------------------------------------------------------------

const clienteSigla = (ruc: string, razonSocial: string, ultimaAtencion: string | null) => ({
  razonSocial,
  ruc,
  ultimaAtencion,
  telefono: '987 000 0000',
  contacto: 'Contacto SIGLA',
  correo: null as string | null,
});

describe('ListarEmpresasInactivasUseCase.executeSigla — clientes SIGLA sin ficha (S10/S13)', () => {
  it('lists dormant SIGLA clients without CRM ficha: most abandoned first, pendiente_primera last, recent excluded', async () => {
    const repo = makeFakeRepo([empresa({ ...cliente('e-ficha', 'Tiene Ficha S.A.C.', '20100000009') })]);
    const atenciones = fakeAtencionesBulk({
      '20100000009': '2026-05-01', // dormida PERO tiene ficha CRM: excluida de este segmento
      '20100000010': '2026-03-02', // ~8 meses: entra
      '20100000011': '2026-08-20', // reciente: excluida
      '20100000012': null,         // sin órdenes: pendiente_primera, al final
    });
    atenciones.clientesConActividad = async () => [
      clienteSigla('20100000010', 'Dormido Viejo S.A.C.', '2026-03-02'),
      clienteSigla('20100000009', 'Tiene Ficha S.A.C.', '2026-05-01'),
      clienteSigla('20100000012', 'Nunca Ordenó S.A.C.', null),
      clienteSigla('20100000011', 'Reciente S.A.C.', '2026-08-20'),
    ];
    const r = await new ListarEmpresasInactivasUseCase(repo.empresaRepo, atenciones).executeSigla(HOY, { pagina: 1 });
    expect(r.total).toBe(2);
    expect(r.paginas).toBe(1);
    expect(r.pagina).toBe(1);
    expect(r.filas.map((f) => [f.razonSocial, f.mesesSinActividad, f.estado])).toEqual([
      ['Dormido Viejo S.A.C.', 7, 'sin_actividad'],
      ['Nunca Ordenó S.A.C.', null, 'pendiente_primera'],
    ]);
    expect(r.filas[0].telefono).toBe('987 000 0000'); // datos de contacto para crear la ficha
  });

  it('pages in memory at 50 rows per page with stable order (ties alphabetical)', async () => {
    const repo = makeFakeRepo([]);
    const dormidos = Array.from({ length: 55 }, (_, i) => {
      const ruc = `209${String(i).padStart(8, '0')}`;
      return clienteSigla(ruc, `Clínica ${String.fromCharCode(65 + (i % 26))}${i}`, '2026-04-15');
    });
    const atenciones = fakeAtencionesBulk({});
    atenciones.clientesConActividad = async () => dormidos;
    const useCase = new ListarEmpresasInactivasUseCase(repo.empresaRepo, atenciones);

    const p1 = await useCase.executeSigla(HOY, { pagina: 1 });
    expect(p1.total).toBe(55);
    expect(p1.paginas).toBe(2);
    expect(p1.filas).toHaveLength(50);

    const p2 = await useCase.executeSigla(HOY, { pagina: 2 });
    expect(p2.filas).toHaveLength(5);
    // sin solape entre páginas
    const ids1 = new Set(p1.filas.map((f) => f.ruc));
    expect(p2.filas.every((f) => !ids1.has(f.ruc))).toBe(true);
    // página fuera de rango → vacía, sin romper
    const p9 = await useCase.executeSigla(HOY, { pagina: 9 });
    expect(p9.filas).toEqual([]);
  });
});


// ---------------------------------------------------------------------------
// Filtros, orden y paginación (S14-S16): OpcionesInactivas sobre ambas fuentes.
// ---------------------------------------------------------------------------

describe('ListarEmpresasInactivasUseCase — filtros, orden y paginación (S14-S16)', () => {
  const filaCrm = (over: Partial<EmpresaInactiva> = {}): EmpresaInactiva => ({
    idEmpresa: 'e-x',
    razonSocial: 'Sin Filtros S.A.C.',
    ruc: '20100000099',
    sector: 'Odontología',
    ultimaAtencion: '2026-06-15',
    mesesSinActividad: 4,
    ultimoContactoCrm: null,
    estado: 'sin_actividad',
    ...over,
  });

  const repoCrm = () =>
    makeFakeRepo([
      empresa({ ...cliente('e-1', 'Clínica Alfa S.A.C.', '20100000001'), sector: 'Odontología' }),
      empresa({ ...cliente('e-2', 'Beta Minera S.R.L.', '20100000002'), sector: 'Minería y Energía' }),
      empresa({ ...cliente('e-3', 'Alfa Dental E.I.R.L.', '20100000003'), sector: 'Odontología', relacion: 'prospecto' }),
      empresa({ ...cliente('e-4', 'Nunca Contacto S.A.C.', '20100000004'), sector: 'Odontología' }),
    ]);

  const atencionesCrm = () =>
    fakeAtencionesBulk({
      '20100000001': '2026-06-15', // 4 meses
      '20100000002': '2026-03-01', // ~8 meses
      '20100000003': '2026-04-01', // prospecto: nunca se consulta
      '20100000004': null,         // pendiente_primera
    });

  it('filters by q across razón social and RUC (case-insensitive)', async () => {
    const r = await new ListarEmpresasInactivasUseCase(repoCrm().empresaRepo, atencionesCrm()).execute(HOY, { q: 'alfa' });
    expect(r.total).toBe(1);
    expect(r.filas.map((f) => f.razonSocial)).toEqual(['Clínica Alfa S.A.C.']);
    const r2 = await new ListarEmpresasInactivasUseCase(repoCrm().empresaRepo, atencionesCrm()).execute(HOY, { q: '20100000002' });
    expect(r2.total).toBe(1);
    expect(r2.filas[0].razonSocial).toBe('Beta Minera S.R.L.');
  });

  it('filters by estado, meses range and último contacto; months filter excludes pendiente_primera', async () => {
    const uc = () => new ListarEmpresasInactivasUseCase(repoCrm().empresaRepo, atencionesCrm());
    const soloPendiente = await uc().execute(HOY, { estado: 'pendiente_primera' });
    expect(soloPendiente.total).toBe(1);
    expect(soloPendiente.filas[0].estado).toBe('pendiente_primera');

    const rango = await uc().execute(HOY, { mesesMin: 4, mesesMax: 6 });
    expect(rango.filas.map((f) => f.razonSocial)).toEqual(['Clínica Alfa S.A.C.']); // la de 8 meses fuera; pendiente sin meses fuera

    const conContacto = await uc().execute(HOY, { contacto: 'con' });
    expect(conContacto.total).toBe(0); // ninguna fila tiene interacciones en este repo

    const sectorFiltro = await uc().execute(HOY, { sector: 'Minería y Energía' });
    expect(sectorFiltro.filas.map((f) => f.razonSocial)).toEqual(['Beta Minera S.R.L.']);
  });

  it('sorts: abandono desc default (pendiente_primera last); razón social asc mixes; última atención asc nulls first', async () => {
    const uc = () => new ListarEmpresasInactivasUseCase(repoCrm().empresaRepo, atencionesCrm());
    const porNombre = await uc().execute(HOY, { orden: 'razonSocial', direccion: 'asc' });
    expect(porNombre.filas.map((f) => f.razonSocial)).toEqual([
      'Beta Minera S.R.L.',
      'Clínica Alfa S.A.C.',
      'Nunca Contacto S.A.C.',
    ]);
    const porAbandono = await uc().execute(HOY, { orden: 'abandono', direccion: 'desc' });
    expect(porAbandono.filas[0].razonSocial).toBe('Beta Minera S.R.L.'); // ~8 meses, la más abandonada
    expect(porAbandono.filas[porAbandono.filas.length - 1].estado).toBe('pendiente_primera'); // S6.7
    const porAtencion = await uc().execute(HOY, { orden: 'ultimaAtencion', direccion: 'asc' });
    expect(porAtencion.filas[0].ultimaAtencion).toBeNull(); // nunca = la más vieja
  });

  it('returns pagination + totalFuente + sectores facets (unfiltered)', async () => {
    const r = await new ListarEmpresasInactivasUseCase(repoCrm().empresaRepo, atencionesCrm()).execute(HOY, {
      estado: 'pendiente_primera',
      pagina: 1,
    });
    expect(r.total).toBe(1);            // filtrado
    expect(r.totalFuente).toBe(3);      // inactivas con filtro ninguno (prospecto nunca cuenta)
    expect(r.paginas).toBe(1);
    expect(r.pagina).toBe(1);
    expect(r.sectores).toEqual(['Minería y Energía', 'Odontología']); // facetas sin filtrar, ordenadas
    expect(r.sinInformacion).toBe(0);
  });

  it('SIGLA segment: filters and sorting work the same way', async () => {
    const repo = makeFakeRepo([empresa({ ...cliente('e-f', 'Con Ficha S.A.C.', '20100000020') })]);
    const atenciones = fakeAtencionesBulk({});
    atenciones.clientesConActividad = async () => [
      clienteSigla('20100000020', 'Con Ficha S.A.C.', '2026-04-01'), // tiene ficha: excluida del segmento
      clienteSigla('20100000030', 'Alpha SIGLA S.A.C.', '2026-04-10'),
      clienteSigla('20100000031', 'Beta SIGLA S.A.C.', '2026-02-01'),
      clienteSigla('20100000032', 'Pendiente SIGLA S.A.C.', null),
    ];
    const r = await new ListarEmpresasInactivasUseCase(repo.empresaRepo, atenciones).executeSigla(HOY, { q: 'sigla', mesesMin: 6 });
    expect(r.total).toBe(2); // Alpha (6 meses) y Beta (9 meses); Pendiente queda fuera por el filtro de meses; Con Ficha fuera por tener ficha
    expect(r.filas.map((f) => f.razonSocial)).toEqual(['Beta SIGLA S.A.C.', 'Alpha SIGLA S.A.C.']); // más abandonada primero
    expect(r.totalFuente).toBe(3); // dormidas sin ficha SIN filtro (Alpha, Beta, Pendiente)
    expect(r.filas[0].estado).toBe('sin_actividad');
  });
});
