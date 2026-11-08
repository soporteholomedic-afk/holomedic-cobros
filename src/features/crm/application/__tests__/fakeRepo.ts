import type { ICrmEmpresaRepository, ICrmOportunidadRepository } from '../../domain/ports';
import type {
  Empresa,
  IconoSector,
  Interaccion,
  NuevaInteraccion,
  NuevaOportunidad,
  Oportunidad,
  Sector,
  SeguimientoOportunidad,
  DatosOportunidad,
} from '../../domain/entities';
import { EmpresaNotFoundError, OportunidadNotFoundError, RucDuplicadoError, SectorDuplicadoError } from '../../domain/errors';

export const NOW = '2026-10-31T15:00:00.000Z';
/** `hoy` as the callers compute it (America/Lima). */
export const HOY = '2026-10-31';
export const USUARIO = { sub: 'u-1', nombre: 'Scott Palomino' };

export interface FakeRepo {
  rows: Empresa[];
  oportunidades: Oportunidad[];
  interacciones: Interaccion[];
  sectores: Sector[];
  /** Every call that changes storage, on either view. */
  escrituras: number;
  /** Calls to the oportunidades `updateSeguimiento` only. */
  seguimientos: number;
  /** View to hand to use cases expecting `ICrmEmpresaRepository`. */
  empresaRepo: ICrmEmpresaRepository;
  /** View to hand to use cases expecting `ICrmOportunidadRepository`. */
  oportunidadRepo: ICrmOportunidadRepository;
}

export function empresa(parcial: Partial<Empresa> = {}): Empresa {
  return {
    idEmpresa: 'e-1',
    razonSocial: 'Constructora Andina S.A.C.',
    ruc: '20512345678',
    sector: 'Construcción',
    contactos: [{ nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null }],
    notas: null,
    direccion: null,
    relacion: 'prospecto',
    createdAt: NOW,
    updatedAt: NOW,
    ...parcial,
  };
}

export function oportunidad(parcial: Partial<Oportunidad> = {}): Oportunidad {
  return {
    idOportunidad: 'o-1',
    idEmpresa: 'e-1',
    nombre: 'Exámenes ocupacionales 2026',
    responsableId: null,
    responsableNombre: null,
    origen: null,
    servicio: null,
    montoEstimado: null,
    etapa: 'por_contactar',
    medio: null,
    medioOtro: null,
    motivo: null,
    intentosSinRespuesta: 0,
    faltaResponderDesde: null,
    proximaAccion: null,
    sugerenciaDescartadaEn: null,
    migrada: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...parcial,
  };
}

/** In-memory pair of repositories mirroring the semantics of the SQL adapters. */
export function makeFakeRepo(
  seed: Empresa[] = [],
  historial: Interaccion[] = [],
  seedOportunidades: Oportunidad[] = [],
): FakeRepo {
  const rows: Empresa[] = seed.map((r) => structuredClone(r));
  const interacciones: Interaccion[] = historial.map((i) => structuredClone(i));
  const oportunidades: Oportunidad[] = seedOportunidades.map((o) => structuredClone(o));
  const sectores: Sector[] = [
    { nombre: 'Construcción', icono: 'casco' },
    { nombre: 'Comercio y Tiendas', icono: 'tienda' },
  ];
  const repo: FakeRepo = {
    rows,
    oportunidades,
    interacciones,
    sectores,
    escrituras: 0,
    seguimientos: 0,
    empresaRepo: {} as ICrmEmpresaRepository,
    oportunidadRepo: {} as ICrmOportunidadRepository,
  };
  let seqEmpresa = 0;
  let seqOportunidad = 0;
  let seqInteraccion = interacciones.reduce((m, i) => Math.max(m, i.idInteraccion), 0);
  const buscar = (id: string): Empresa => {
    const row = rows.find((r) => r.idEmpresa === id);
    if (!row) throw new EmpresaNotFoundError(id);
    return row;
  };
  const buscarOportunidad = (id: string): Oportunidad => {
    const row = oportunidades.find((o) => o.idOportunidad === id);
    if (!row) throw new OportunidadNotFoundError(id);
    return row;
  };

  const empresaRepo: ICrmEmpresaRepository = {
    async getById(id) {
      const row = rows.find((r) => r.idEmpresa === id);
      return row ? structuredClone(row) : null;
    },
    async findByRuc(ruc) {
      const row = ruc === null ? undefined : rows.find((r) => r.ruc === ruc);
      return row ? structuredClone(row) : null;
    },
    async list() {
      return rows.map((r) => structuredClone(r));
    },
    async create(input) {
      repo.escrituras++;
      if (input.ruc !== null && rows.some((r) => r.ruc === input.ruc)) throw new RucDuplicadoError(input.ruc);
      const row = empresa({
        idEmpresa: `e-nueva-${++seqEmpresa}`,
        razonSocial: input.razonSocial,
        ruc: input.ruc,
        sector: input.sector,
        contactos: structuredClone(input.contactos),
        notas: input.notas,
        direccion: input.direccion,
        relacion: input.relacion,
      });
      rows.push(row);
      return structuredClone(row);
    },
    async update(id, datos) {
      repo.escrituras++;
      const row = buscar(id);
      if (datos.ruc !== null && rows.some((r) => r.idEmpresa !== id && r.ruc === datos.ruc)) {
        throw new RucDuplicadoError(datos.ruc);
      }
      Object.assign(row, structuredClone(datos));
      return structuredClone(row);
    },
    async updateRelacion(id, relacion) {
      repo.escrituras++;
      const row = buscar(id);
      row.relacion = relacion;
      return structuredClone(row);
    },
    async addInteraccion(idEmpresa, interaccion: NuevaInteraccion) {
      repo.escrituras++;
      const row = buscar(idEmpresa);
      const fila: Interaccion = {
        idInteraccion: ++seqInteraccion,
        idEmpresa: row.idEmpresa,
        idOportunidad: interaccion.idOportunidad,
        fecha: NOW,
        idUsuario: interaccion.idUsuario,
        nombreUsuario: interaccion.nombreUsuario,
        direccion: interaccion.direccion,
        medio: interaccion.medio,
        medioOtro: interaccion.medioOtro,
        resultado: interaccion.resultado,
        resumen: interaccion.resumen,
      };
      interacciones.push(fila);
      return structuredClone(fila);
    },
    async listInteracciones(idEmpresa) {
      return interacciones
        .filter((i) => i.idEmpresa === idEmpresa)
        .sort((a, b) => b.idInteraccion - a.idInteraccion)
        .map((i) => structuredClone(i));
    },
    async fusionar(idOrigen, idDestino) {
      repo.escrituras++;
      const origen = buscar(idOrigen);
      const destino = buscar(idDestino);
      for (const i of interacciones) if (i.idEmpresa === idOrigen) i.idEmpresa = idDestino;
      for (const o of oportunidades) if (o.idEmpresa === idOrigen) o.idEmpresa = idDestino;
      for (const c of origen.contactos) {
        const repetido = destino.contactos.some(
          (d) => d.nombre === c.nombre && d.telefono === c.telefono && d.correo === c.correo,
        );
        if (!repetido) destino.contactos.push(structuredClone(c));
      }
      // Same rule as the SQL: notes are appended, never dropped.
      if (origen.notas !== null && origen.notas !== destino.notas) {
        destino.notas = destino.notas === null ? origen.notas : `${destino.notas}\n\n${origen.notas}`;
      }
      rows.splice(rows.indexOf(origen), 1);
      return structuredClone(destino);
    },
    async listSectores() {
      return [...sectores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    },
    async createSector(nombre, icono: IconoSector | null) {
      repo.escrituras++;
      if (sectores.some((s) => s.nombre.toLowerCase() === nombre.toLowerCase())) {
        throw new SectorDuplicadoError(nombre);
      }
      const creado: Sector = { nombre, icono };
      sectores.push(creado);
      return { ...creado };
    },
  };

  const oportunidadRepo: ICrmOportunidadRepository = {
    async getById(id) {
      const row = oportunidades.find((o) => o.idOportunidad === id);
      return row ? structuredClone(row) : null;
    },
    async list() {
      // Newest first: the last created comes first.
      return [...oportunidades].reverse().map((o) => structuredClone(o));
    },
    async listByEmpresa(idEmpresa) {
      return oportunidades
        .filter((o) => o.idEmpresa === idEmpresa)
        .reverse()
        .map((o) => structuredClone(o));
    },
    async create(idEmpresa, datos: NuevaOportunidad, migrada = false) {
      repo.escrituras++;
      const empresaRow = buscar(idEmpresa);
      const row = oportunidad({
        idOportunidad: `o-nueva-${++seqOportunidad}`,
        idEmpresa: empresaRow.idEmpresa,
        nombre: datos.nombre,
        responsableId: datos.responsableId,
        responsableNombre: datos.responsableNombre,
        origen: datos.origen,
        servicio: datos.servicio,
        montoEstimado: datos.montoEstimado,
        etapa: datos.etapa,
        medio: datos.medio,
        medioOtro: datos.medioOtro,
        migrada,
      });
      oportunidades.push(row);
      return structuredClone(row);
    },
    async updateDatos(id, datos: DatosOportunidad) {
      repo.escrituras++;
      const row = buscarOportunidad(id);
      row.nombre = datos.nombre;
      row.responsableId = datos.responsableId;
      row.responsableNombre = datos.responsableNombre;
      row.origen = datos.origen;
      row.servicio = datos.servicio;
      row.montoEstimado = datos.montoEstimado;
      return structuredClone(row);
    },
    async updateSeguimiento(id, s: SeguimientoOportunidad, interaccion: NuevaInteraccion | null) {
      repo.escrituras++;
      repo.seguimientos++;
      const row = buscarOportunidad(id);
      row.etapa = s.etapa;
      row.medio = s.medio;
      row.medioOtro = s.medioOtro;
      row.motivo = s.motivo ? { ...s.motivo } : null;
      row.intentosSinRespuesta = s.intentosSinRespuesta;
      row.faltaResponderDesde = s.faltaResponderDesde;
      row.proximaAccion = s.proximaAccion ? { ...s.proximaAccion } : null;
      row.sugerenciaDescartadaEn = s.sugerenciaDescartadaEn;
      if (interaccion) {
        // The caller owns `idOportunidad`: stored as given, so a use case that
        // forgets to link the activity is visible in tests.
        interacciones.push({
          idInteraccion: ++seqInteraccion,
          idEmpresa: row.idEmpresa,
          fecha: NOW,
          ...interaccion,
        });
      }
      return structuredClone(row);
    },
  };

  repo.empresaRepo = empresaRepo;
  repo.oportunidadRepo = oportunidadRepo;
  return repo;
}

/** Snapshot to prove that a rejected input stored nothing. */
export function foto(repo: FakeRepo): {
  rows: Empresa[];
  oportunidades: Oportunidad[];
  interacciones: Interaccion[];
  escrituras: number;
} {
  return structuredClone({
    rows: repo.rows,
    oportunidades: repo.oportunidades,
    interacciones: repo.interacciones,
    escrituras: repo.escrituras,
  });
}
