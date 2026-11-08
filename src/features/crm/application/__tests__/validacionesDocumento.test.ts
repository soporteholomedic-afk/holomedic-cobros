/**
 * S7 — the 7 functional validations of the redesign document, consolidated:
 * each describe walks ONE comprobación through the application use cases
 * (the public interface behind the API routes) over the in-memory fake
 * repositories — no seeding shortcuts, the state is built exactly like the
 * flows build it.
 *
 * Source quotes (docs/subidos/2026-11-07-20-06-19-Mejoras-CRM.txt, spec S7).
 */
import { describe, expect, it } from 'vitest';

import { RELACIONES, type Empresa, type Oportunidad } from '../../domain/entities';
import type { IAtencionesServicio } from '../../domain/ports';
import { ConsultarAtencionUseCase } from '../consultarAtencion';
import { CrearEmpresaUseCase } from '../crearEmpresa';
import { CrearOportunidadUseCase, type CrearOportunidadDatos } from '../crearOportunidad';
import { ListarHistorialUseCase } from '../listarHistorial';
import { ListarOportunidadesUseCase } from '../listarOportunidades';
import { MoverOportunidadUseCase, type MoverExtras } from '../moverOportunidad';
import { RegistrarActividadUseCase, type RegistrarActividadDatos } from '../registrarActividad';
import { HOY, NOW, USUARIO, makeFakeRepo, type FakeRepo } from './fakeRepo';

// ---------------------------------------------------------------------------
// Shared fixtures — same shapes the existing use-case tests use.
// ---------------------------------------------------------------------------

const DATOS_EMPRESA = {
  razonSocial: 'Constructora Andina S.A.C.',
  ruc: '20512345678',
  sector: 'Construcción',
  contactos: [{ nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null as string | null }],
};

const DATOS_OTRA_EMPRESA = {
  razonSocial: 'Comercial del Norte S.A.',
  ruc: '20599887766',
  sector: 'Comercio y Tiendas',
  contactos: [{ nombre: 'Jaime Ríos', telefono: '987 111 222', correo: null as string | null }],
};

const ACCION = { tipo: 'llamar' as const, detalle: null, fecha: '2026-11-03' };

const CONVERSAMOS: RegistrarActividadDatos = {
  direccion: 'saliente',
  medio: 'llamada',
  resultado: 'conversamos',
  resumen: 'Pidió cotización para 40 trabajadores.',
  proximaAccion: ACCION,
};

const crearFicha = async (
  repo: FakeRepo,
  datos: Partial<typeof DATOS_EMPRESA> = {},
  opciones: { relacion?: string } = {},
): Promise<Empresa> => new CrearEmpresaUseCase(repo.empresaRepo).execute({ ...DATOS_EMPRESA, ...datos }, opciones);

const crearNegocio = async (repo: FakeRepo, idEmpresa: string, datos: CrearOportunidadDatos) =>
  new CrearOportunidadUseCase(repo.empresaRepo, repo.oportunidadRepo).execute(idEmpresa, datos);

const moverNegocio = async (repo: FakeRepo, idOportunidad: string, etapa: string, extras: MoverExtras = {}) =>
  new MoverOportunidadUseCase(repo.oportunidadRepo).execute(idOportunidad, etapa, extras);

const registrarActividad = (
  repo: FakeRepo,
  idEmpresa: string,
  idOportunidad: string | null,
  datos: RegistrarActividadDatos,
) =>
  new RegistrarActividadUseCase(repo.empresaRepo, repo.oportunidadRepo).execute(
    idEmpresa,
    idOportunidad,
    datos,
    USUARIO,
    HOY,
    new Date(NOW),
  );

const historial = (repo: FakeRepo, idEmpresa: string) =>
  new ListarHistorialUseCase(repo.empresaRepo).execute(idEmpresa);

/** The stored row of one deal, or a hard failure (never an undefined compare). */
function storedDeal(repo: FakeRepo, idOportunidad: string): Oportunidad {
  const o = repo.oportunidades.find((d) => d.idOportunidad === idOportunidad);
  if (!o) throw new Error(`Expected deal ${idOportunidad} to be stored`);
  return o;
}

/**
 * Mirror of the local SIGLA fake in `consultarAtencion.test.ts` (it is not
 * exported there, and importing a test module would re-register its tests):
 * a fake SIGLA port that records which RUCs were asked and answers from a map.
 */
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

// ---------------------------------------------------------------------------
// Comprobación 1 — "Crear una empresa sin crear obligatoriamente una oportunidad."
// ---------------------------------------------------------------------------

describe('Comprobación 1 — "Crear una empresa sin crear obligatoriamente una oportunidad."', () => {
  it('creates ONLY the empresa ficha; no deal row exists and the board gains no card', async () => {
    const repo = makeFakeRepo();
    const ficha = await crearFicha(repo);

    // The ficha exists with all its data, starting as Prospecto.
    expect(ficha).toMatchObject({
      razonSocial: DATOS_EMPRESA.razonSocial,
      ruc: DATOS_EMPRESA.ruc,
      sector: DATOS_EMPRESA.sector,
      relacion: 'prospecto',
    });
    expect(ficha.contactos).toEqual(DATOS_EMPRESA.contactos);

    // Observable effects: exactly ONE stored row, ZERO oportunidades, ONE write.
    expect(repo.rows).toHaveLength(1);
    expect(repo.oportunidades).toHaveLength(0);
    expect(repo.escrituras).toBe(1);

    // The Kanban (all oportunidades) shows nothing for the new ficha.
    expect(await new ListarOportunidadesUseCase(repo.oportunidadRepo).execute()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Comprobación 2 — "Crear dos oportunidades diferentes para una misma empresa."
// ---------------------------------------------------------------------------

describe('Comprobación 2 — "Crear dos oportunidades diferentes para una misma empresa."', () => {
  it('creates two distinct deals on one ficha; both are listed and the ficha is neither duplicated nor modified', async () => {
    const repo = makeFakeRepo();
    const ficha = await crearFicha(repo);
    const examenes = await crearNegocio(repo, ficha.idEmpresa, {
      nombre: 'Exámenes ocupacionales 2026',
      servicio: 'Exámenes de ingreso',
    });
    const monitoreo = await crearNegocio(repo, ficha.idEmpresa, {
      nombre: 'Monitoreo cardíaco en planta',
      servicio: 'Monitoreo de signos vitales',
      etapa: 'contactado',
      medio: 'llamada',
    });

    // Both deals belong to the SAME ficha and are independent cards.
    expect(examenes.idEmpresa).toBe(ficha.idEmpresa);
    expect(monitoreo.idEmpresa).toBe(ficha.idEmpresa);
    expect(examenes.idOportunidad).not.toBe(monitoreo.idOportunidad);
    expect(examenes).toMatchObject({ etapa: 'por_contactar', servicio: 'Exámenes de ingreso', montoEstimado: null });
    expect(monitoreo).toMatchObject({ etapa: 'contactado', medio: 'llamada', servicio: 'Monitoreo de signos vitales' });

    // Both are listed for the board: one empresa, two columns/cards.
    const tablero = await new ListarOportunidadesUseCase(repo.oportunidadRepo).execute();
    expect(tablero.map((o) => o.nombre).sort()).toEqual(
      ['Exámenes ocupacionales 2026', 'Monitoreo cardíaco en planta'].sort(),
    );

    // One single ficha, byte-for-byte unchanged by either create.
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toEqual(ficha);
    expect(repo.rows[0]?.relacion).toBe('prospecto');
  });
});

// ---------------------------------------------------------------------------
// Comprobación 3 — "Marcar una oportunidad como perdida sin cambiar el estado de la empresa."
// ---------------------------------------------------------------------------

describe('Comprobación 3 — "Marcar una oportunidad como perdida sin cambiar el estado de la empresa."', () => {
  it('closes ONE deal as Perdida with its reason; the ficha, the sibling deal and the history stay untouched', async () => {
    const repo = makeFakeRepo();
    const ficha = await crearFicha(repo);
    const cotizada = await crearNegocio(repo, ficha.idEmpresa, { nombre: 'Exámenes ocupacionales 2026' });
    const hermana = await crearNegocio(repo, ficha.idEmpresa, {
      nombre: 'Monitoreo cardíaco',
      etapa: 'contactado',
      medio: 'whatsapp',
    });
    // Walk the deal to Cotizado through a linked activity, like the UI does.
    await registrarActividad(repo, ficha.idEmpresa, cotizada.idOportunidad, CONVERSAMOS);
    await moverNegocio(repo, cotizada.idOportunidad, 'cotizado');
    const historialAntes = await historial(repo, ficha.idEmpresa);
    const hermanaAntes = structuredClone(storedDeal(repo, hermana.idOportunidad));

    const perdida = await moverNegocio(repo, cotizada.idOportunidad, 'perdida', {
      motivo: { categoria: 'precio', detalle1: 'S/ 7,000', detalle2: 'S/ 6,000', notas: 'Prefirió al competidor' },
    });

    // The deal is Perdida and keeps the requested reason; the next action is cleared.
    expect(perdida.etapa).toBe('perdida');
    expect(perdida.motivo).toEqual({
      categoria: 'precio',
      detalle1: 'S/ 7,000',
      detalle2: 'S/ 6,000',
      notas: 'Prefirió al competidor',
    });
    expect(perdida.proximaAccion).toBeNull();

    // The empresa estado NEVER changed: still the same Prospecto row (S1: "una empresa
    // nunca se considera perdida únicamente porque una negociación fracasa").
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toEqual(ficha);
    expect(repo.rows[0]?.relacion).toBe('prospecto');

    // The sibling negotiation is untouched.
    expect(storedDeal(repo, hermana.idOportunidad)).toEqual(hermanaAntes);

    // The lost deal keeps its history: same entries, same order.
    expect(await historial(repo, ficha.idEmpresa)).toEqual(historialAntes);
  });
});

// ---------------------------------------------------------------------------
// Comprobación 4 — "Registrar una actividad vinculada con una oportunidad específica."
// ---------------------------------------------------------------------------

describe('Comprobación 4 — "Registrar una actividad vinculada con una oportunidad específica."', () => {
  it('stores the activity linked to the named deal and advances ONLY that deal, in one transaction', async () => {
    const repo = makeFakeRepo();
    const ficha = await crearFicha(repo);
    const objetivo = await crearNegocio(repo, ficha.idEmpresa, { nombre: 'Exámenes ocupacionales 2026' });
    const hermana = await crearNegocio(repo, ficha.idEmpresa, {
      nombre: 'Monitoreo cardíaco',
      etapa: 'contactado',
      medio: 'correo',
    });
    const hermanaAntes = structuredClone(storedDeal(repo, hermana.idOportunidad));
    const escriturasAntes = repo.escrituras;

    const { empresa: fichaDevuelta, oportunidad: deal, interaccion } = await registrarActividad(
      repo,
      ficha.idEmpresa,
      objetivo.idOportunidad,
      CONVERSAMOS,
    );

    // Exactly ONE history row, linked to the named oportunidad.
    expect(repo.interacciones).toHaveLength(1);
    expect(repo.interacciones[0]).toMatchObject({
      idEmpresa: ficha.idEmpresa,
      idOportunidad: objetivo.idOportunidad,
      idUsuario: USUARIO.sub,
      nombreUsuario: USUARIO.nombre,
      direccion: 'saliente',
      medio: 'llamada',
      resultado: 'conversamos',
      resumen: 'Pidió cotización para 40 trabajadores.',
    });
    expect(interaccion.idOportunidad).toBe(objetivo.idOportunidad);

    // Por contactar → Contactado with medium and next action; state + history in ONE write.
    expect(deal).toMatchObject({ etapa: 'contactado', medio: 'llamada', proximaAccion: ACCION });
    expect(repo.seguimientos).toBe(1);
    // ONE write for this step (state + history together on top of the setup's 3 creates).
    expect(repo.escrituras).toBe(escriturasAntes + 1);

    // Only the NAMED deal moved; the sibling and the ficha row are untouched.
    expect(storedDeal(repo, hermana.idOportunidad)).toEqual(hermanaAntes);
    expect(fichaDevuelta).toEqual(ficha);
    expect(repo.rows[0]).toEqual(ficha);
  });
});

// ---------------------------------------------------------------------------
// Comprobación 5 — "Consultar todas las actividades desde la ficha de empresa."
// ---------------------------------------------------------------------------

describe('Comprobación 5 — "Consultar todas las actividades desde la ficha de empresa."', () => {
  it('the ficha history lists linked AND general activities, all of them, even after a deal closes', async () => {
    const repo = makeFakeRepo();
    const ficha = await crearFicha(repo);
    const examenes = await crearNegocio(repo, ficha.idEmpresa, { nombre: 'Exámenes ocupacionales 2026' });
    const monitoreo = await crearNegocio(repo, ficha.idEmpresa, {
      nombre: 'Monitoreo cardíaco',
      etapa: 'contactado',
      medio: 'whatsapp',
    });

    // One linked activity per deal and one GENERAL activity (no deal at all, S6.4).
    await registrarActividad(repo, ficha.idEmpresa, examenes.idOportunidad, CONVERSAMOS);
    await registrarActividad(repo, ficha.idEmpresa, null, {
      direccion: 'entrante',
      medio: 'whatsapp',
      resultado: 'respondido',
      resumen: 'Agradeció el informe enviado.',
    });
    await registrarActividad(repo, ficha.idEmpresa, monitoreo.idOportunidad, {
      ...CONVERSAMOS,
      medio: 'whatsapp',
      resumen: 'Pidió alcance del monitoreo.',
    });

    // One deal closes as Perdida AFTER its activity was registered.
    await moverNegocio(repo, monitoreo.idOportunidad, 'perdida', { motivo: { categoria: 'sin_interes' } });

    const entradas = await historial(repo, ficha.idEmpresa);

    // ALL of them, newest first — history is complete regardless of deal state (S3).
    expect(entradas).toHaveLength(3);
    expect(entradas.map((e) => e.idOportunidad)).toEqual([
      monitoreo.idOportunidad,
      null,
      examenes.idOportunidad,
    ]);
    expect(entradas.map((e) => e.idInteraccion)).toEqual([3, 2, 1]);
    // The linked entries carry their summaries; the general one carries its own.
    expect(entradas[0]).toMatchObject({ resumen: 'Pidió alcance del monitoreo.', idOportunidad: monitoreo.idOportunidad });
    expect(entradas[1]).toMatchObject({
      resultado: 'respondido',
      medio: 'whatsapp',
      resumen: 'Agradeció el informe enviado.',
      idOportunidad: null,
    });
    expect(entradas[2]).toMatchObject({ resumen: 'Pidió cotización para 40 trabajadores.', idOportunidad: examenes.idOportunidad });

    // The ficha that owns the full history is still one single row.
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toEqual(ficha);
  });
});

// ---------------------------------------------------------------------------
// Comprobación 6 — "Cerrar una oportunidad como ganada sin alterar otras negociaciones abiertas."
// ---------------------------------------------------------------------------

describe('Comprobación 6 — "Cerrar una oportunidad como ganada sin alterar otras negociaciones abiertas."', () => {
  it('closes ONE deal as Ganada; the sibling, other empresas and the ficha stay untouched', async () => {
    const repo = makeFakeRepo();
    const ficha = await crearFicha(repo, {}, { relacion: 'cliente' });
    const ganada = await crearNegocio(repo, ficha.idEmpresa, { nombre: 'Exámenes ocupacionales 2026' });
    const abierta = await crearNegocio(repo, ficha.idEmpresa, {
      nombre: 'Monitoreo cardíaco',
      etapa: 'en_seguimiento',
      medio: 'correo',
    });
    // Another empresa with its own open negotiation must not be touched either.
    const otraFicha = await crearFicha(repo, DATOS_OTRA_EMPRESA);
    const otroNegocio = await crearNegocio(repo, otraFicha.idEmpresa, { nombre: 'Vacantes mineras' });

    // Walk the winning deal: Por contactar → Contactado (linked activity leaves a
    // próxima acción) → Cotizado (the action is still there) → Ganada.
    await registrarActividad(repo, ficha.idEmpresa, ganada.idOportunidad, CONVERSAMOS);
    await moverNegocio(repo, ganada.idOportunidad, 'cotizado');
    expect(storedDeal(repo, ganada.idOportunidad).proximaAccion).toEqual(ACCION);
    const historialAntes = await historial(repo, ficha.idEmpresa);
    const abiertaAntes = structuredClone(storedDeal(repo, abierta.idOportunidad));
    const otroNegocioAntes = structuredClone(storedDeal(repo, otroNegocio.idOportunidad));

    const cerrada = await moverNegocio(repo, ganada.idOportunidad, 'ganada');

    // The deal is Ganada: terminal stage, no next action, no loss reason.
    expect(cerrada.etapa).toBe('ganada');
    expect(cerrada.proximaAccion).toBeNull();
    expect(cerrada.motivo).toBeNull();

    // Other open negotiations untouched: the sibling deal AND the other empresa's deal.
    expect(storedDeal(repo, abierta.idOportunidad)).toEqual(abiertaAntes);
    expect(storedDeal(repo, abierta.idOportunidad).etapa).toBe('en_seguimiento');
    expect(storedDeal(repo, otroNegocio.idOportunidad)).toEqual(otroNegocioAntes);

    // Winning is NOT an empresa estado change: both fichas intact, relación still Cliente.
    expect(repo.rows).toHaveLength(2);
    expect(repo.rows[0]).toEqual(ficha);
    expect(repo.rows[1]).toEqual(otraFicha);
    expect(repo.rows[0]?.relacion).toBe('cliente');

    // The won deal keeps its history.
    expect(await historial(repo, ficha.idEmpresa)).toEqual(historialAntes);
  });
});

// ---------------------------------------------------------------------------
// Comprobación 7 — "Identificar a un cliente inactivo sin clasificarlo como prospecto o perdido."
// ---------------------------------------------------------------------------

describe('Comprobación 7 — "Identificar a un cliente inactivo sin clasificarlo como prospecto o perdido."', () => {
  it('a cliente whose last service is 5 months old shows Sin actividad reciente and stays Cliente', async () => {
    const repo = makeFakeRepo();
    const ficha = await crearFicha(repo, {}, { relacion: 'cliente' });
    const negocio = await crearNegocio(repo, ficha.idEmpresa, { nombre: 'Exámenes ocupacionales 2026' });
    const atenciones = fakeAtenciones({ [DATOS_EMPRESA.ruc]: '2026-05-31' }); // exactly 5 months before HOY
    const negocioAntes = structuredClone(storedDeal(repo, negocio.idOportunidad));
    const escriturasAntes = repo.escrituras;

    const resultado = await new ConsultarAtencionUseCase(repo.empresaRepo, atenciones).execute(ficha.idEmpresa, HOY);

    // The inactivity IS identified: the service signal comes live from SIGLA,
    // queried with the ficha RUC, and the 4-month threshold marks it inactive.
    expect(atenciones.rucs).toEqual([DATOS_EMPRESA.ruc]);
    expect(resultado.actividad).toEqual({ ultimaAtencion: '2026-05-31', ruc: DATOS_EMPRESA.ruc });
    expect(resultado.estado).toBe('sin_actividad');
    // It is a real inactivity flag, not the "no data" states.
    expect(resultado.estado).not.toBe('sin_informacion');
    expect(resultado.estado).not.toBe('pendiente_primera');

    // The ficha is NEVER reclassified: relación stays 'cliente', row untouched,
    // and the domain has no 'perdido' relación for empresas at all.
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toEqual(ficha);
    expect(repo.rows[0]?.relacion).toBe('cliente');
    expect(RELACIONES).toEqual(['prospecto', 'cliente']);

    // The consult is a pure read: no write, no deal change.
    expect(repo.escrituras).toBe(escriturasAntes);
    expect(storedDeal(repo, negocio.idOportunidad)).toEqual(negocioAntes);
  });
});
