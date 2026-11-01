import type { ICrmEmpresaRepository } from '../../domain/ports';
import type { Empresa, Interaccion } from '../../domain/entities';
import { EmpresaNotFoundError, RucDuplicadoError } from '../../domain/errors';

export const NOW = '2026-10-31T15:00:00.000Z';
/** `hoy` as the callers compute it (America/Lima). */
export const HOY = '2026-10-31';
export const USUARIO = { sub: 'u-1', nombre: 'Scott Palomino' };

export interface FakeRepo extends ICrmEmpresaRepository {
  rows: Empresa[];
  interacciones: Interaccion[];
  /** Every call that changes storage (create, update, updateEstado, updateSeguimiento, addInteraccion, fusionar). */
  escrituras: number;
  /** Calls to `updateSeguimiento` only. */
  seguimientos: number;
}

export function empresa(parcial: Partial<Empresa> = {}): Empresa {
  return {
    idEmpresa: 'e-1',
    razonSocial: 'Constructora Andina S.A.C.',
    ruc: '20512345678',
    sector: 'Construcción',
    contactos: [{ nombre: 'Marcela Quispe', telefono: '987 654 321', correo: null }],
    notas: null,
    etapa: 'por_contactar',
    medio: null,
    medioOtro: null,
    motivo: null,
    intentosSinRespuesta: 0,
    faltaResponderDesde: null,
    proximaAccion: null,
    origen: null,
    sugerenciaDescartadaEn: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...parcial,
  };
}

/** In-memory repository mirroring the semantics of SqlServerCrmEmpresaRepository. */
export function makeFakeRepo(seed: Empresa[] = [], historial: Interaccion[] = []): FakeRepo {
  const rows: Empresa[] = seed.map((r) => structuredClone(r));
  const interacciones: Interaccion[] = historial.map((i) => structuredClone(i));
  let seqEmpresa = 0;
  let seqInteraccion = interacciones.reduce((m, i) => Math.max(m, i.idInteraccion), 0);
  const buscar = (id: string): Empresa => {
    const row = rows.find((r) => r.idEmpresa === id);
    if (!row) throw new EmpresaNotFoundError(id);
    return row;
  };
  const repo: FakeRepo = {
    rows,
    interacciones,
    escrituras: 0,
    seguimientos: 0,
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
        etapa: input.etapa,
        origen: input.origen,
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
    async updateEstado(id, estado) {
      repo.escrituras++;
      const row = buscar(id);
      row.etapa = estado.etapa;
      row.medio = estado.medio;
      row.motivo = estado.motivo ? { ...estado.motivo } : null;
      return structuredClone(row);
    },
    async updateSeguimiento(id, s, interaccion) {
      repo.escrituras++;
      repo.seguimientos++;
      const row = buscar(id);
      row.etapa = s.etapa;
      row.medio = s.medio;
      row.medioOtro = s.medioOtro;
      row.motivo = s.motivo ? { ...s.motivo } : null;
      row.intentosSinRespuesta = s.intentosSinRespuesta;
      row.faltaResponderDesde = s.faltaResponderDesde;
      row.proximaAccion = s.proximaAccion ? { ...s.proximaAccion } : null;
      row.sugerenciaDescartadaEn = s.sugerenciaDescartadaEn;
      if (interaccion) {
        interacciones.push({ idInteraccion: ++seqInteraccion, idEmpresa: id, fecha: NOW, ...interaccion });
      }
      return structuredClone(row);
    },
    async addInteraccion(idEmpresa, interaccion) {
      repo.escrituras++;
      buscar(idEmpresa);
      const fila: Interaccion = { idInteraccion: ++seqInteraccion, idEmpresa, fecha: NOW, ...interaccion };
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
      return ['Construcción', 'Comercio y Tiendas'];
    },
    async createSector(nombre) {
      repo.escrituras++;
      return nombre;
    },
  };
  return repo;
}

/** Snapshot to prove that a rejected input stored nothing. */
export function foto(repo: FakeRepo): { rows: Empresa[]; interacciones: Interaccion[]; escrituras: number } {
  return structuredClone({ rows: repo.rows, interacciones: repo.interacciones, escrituras: repo.escrituras });
}
