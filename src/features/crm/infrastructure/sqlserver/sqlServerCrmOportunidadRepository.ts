import { randomUUID } from 'node:crypto';
import mssql from 'mssql';

import type { ICrmOportunidadRepository } from '../../domain/ports';
import type {
  AccionTipo,
  DatosOportunidad,
  Direccion,
  EtapaOportunidad,
  Interaccion,
  Medio,
  Motivo,
  MotivoCategoria,
  NuevaInteraccion,
  NuevaOportunidad,
  Origen,
  Oportunidad,
  ProximaAccion,
  Resultado,
  SeguimientoOportunidad,
} from '../../domain/entities';
import { EmpresaNotFoundError, OportunidadNotFoundError } from '../../domain/errors';

interface OportunidadDbRow {
  idOportunidad: string;
  idEmpresa: string;
  nombre: string;
  responsableId: string | null;
  responsableNombre: string | null;
  origen: string | null;
  servicio: string | null;
  /** The driver returns DECIMAL as a string; the domain wants a number. */
  montoEstimado: string | number | null;
  etapa: string;
  medio: string | null;
  medioOtro: string | null;
  motivoCategoria: string | null;
  motivoDetalle1: string | null;
  motivoDetalle2: string | null;
  motivoNotas: string | null;
  intentosSinRespuesta: number;
  faltaResponderDesde: Date | null;
  proximaAccionTipo: string | null;
  proximaAccionDetalle: string | null;
  proximaAccionFecha: Date | null;
  sugerenciaDescartadaEn: number | null;
  migrada: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface InteraccionDbRow {
  idInteraccion: number;
  idEmpresa: string;
  idOportunidad: string | null;
  fecha: Date;
  idUsuario: string;
  nombreUsuario: string;
  direccion: string;
  medio: string;
  medioOtro: string | null;
  resultado: string;
  resumen: string | null;
}

/** Raised by our own `THROW` when an UPDATE matched no oportunidad. */
const NOT_FOUND = 50404;
/** Foreign key violation: the oportunidad points to an empresa that does not exist. */
const FK_VIOLATION = 547;

function numeroDeError(error: unknown): number | undefined {
  return (error as { number?: number } | null)?.number;
}

function rowToInteraccion(row: InteraccionDbRow): Interaccion {
  return {
    idInteraccion: row.idInteraccion,
    idEmpresa: row.idEmpresa,
    idOportunidad: row.idOportunidad ?? null,
    fecha: row.fecha.toISOString(),
    idUsuario: row.idUsuario,
    nombreUsuario: row.nombreUsuario,
    direccion: row.direccion as Direccion,
    medio: row.medio as Medio,
    medioOtro: row.medioOtro ?? null,
    resultado: row.resultado as Resultado,
    resumen: row.resumen ?? null,
  };
}

function rowToOportunidad(row: OportunidadDbRow): Oportunidad {
  const motivo: Motivo | null =
    row.motivoCategoria === null
      ? null
      : {
          categoria: row.motivoCategoria as MotivoCategoria,
          detalle1: row.motivoDetalle1 ?? null,
          detalle2: row.motivoDetalle2 ?? null,
          notas: row.motivoNotas ?? null,
        };
  const proximaAccion: ProximaAccion | null =
    row.proximaAccionTipo === null || row.proximaAccionFecha === null
      ? null
      : {
          tipo: row.proximaAccionTipo as AccionTipo,
          detalle: row.proximaAccionDetalle ?? null,
          // A DATE column comes back as that day at 00:00 UTC.
          fecha: row.proximaAccionFecha.toISOString().slice(0, 10),
        };
  return {
    idOportunidad: row.idOportunidad,
    idEmpresa: row.idEmpresa,
    nombre: row.nombre,
    responsableId: row.responsableId ?? null,
    responsableNombre: row.responsableNombre ?? null,
    origen: (row.origen as Origen | null) ?? null,
    servicio: row.servicio ?? null,
    montoEstimado: row.montoEstimado === null || row.montoEstimado === undefined ? null : Number(row.montoEstimado),
    etapa: row.etapa as EtapaOportunidad,
    medio: (row.medio as Medio | null) ?? null,
    medioOtro: row.medioOtro ?? null,
    motivo,
    intentosSinRespuesta: row.intentosSinRespuesta ?? 0,
    faltaResponderDesde: row.faltaResponderDesde ? row.faltaResponderDesde.toISOString() : null,
    proximaAccion,
    sugerenciaDescartadaEn: row.sugerenciaDescartadaEn ?? null,
    migrada: Boolean(row.migrada),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SELECT_OPORTUNIDAD = /* sql */ `
  SELECT idOportunidad, idEmpresa, nombre, responsableId, responsableNombre, origen, servicio,
         montoEstimado, etapa, medio, medioOtro, motivoCategoria, motivoDetalle1, motivoDetalle2,
         motivoNotas, intentosSinRespuesta, faltaResponderDesde, proximaAccionTipo, proximaAccionDetalle,
         proximaAccionFecha, sugerenciaDescartadaEn, migrada, createdAt, updatedAt
  FROM dbo.CrmOportunidad`;

/**
 * Parameters of `INSERT INTO dbo.CrmInteraccion` inside `updateSeguimiento`:
 * the activity always links to THIS oportunidad (@id), and its empresa comes
 * from the oportunidad row itself, so the caller cannot desynchronize them.
 */
function inputsInteraccion(request: mssql.Request, i: NuevaInteraccion): void {
  request
    .input('idUsuario', mssql.NVarChar(50), i.idUsuario)
    .input('nombreUsuario', mssql.NVarChar(200), i.nombreUsuario)
    .input('direccion', mssql.NVarChar(10), i.direccion)
    .input('imedio', mssql.NVarChar(10), i.medio)
    .input('imedioOtro', mssql.NVarChar(40), i.medioOtro)
    .input('resultado', mssql.NVarChar(20), i.resultado)
    .input('resumen', mssql.NVarChar(1000), i.resumen);
}

const INSERT_INTERACCION = /* sql */ `
  INSERT INTO dbo.CrmInteraccion
    (idEmpresa, idOportunidad, idUsuario, nombreUsuario, direccion, medio, medioOtro, resultado, resumen)
  VALUES ((SELECT idEmpresa FROM dbo.CrmOportunidad WHERE idOportunidad = @id), @id,
          @idUsuario, @nombreUsuario, @direccion, @imedio, @imedioOtro, @resultado, @resumen)`;

/** One commercial deal of an empresa — the Kanban card. */
export class SqlServerCrmOportunidadRepository implements ICrmOportunidadRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async getById(idOportunidad: string): Promise<Oportunidad | null> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), idOportunidad)
      .query<OportunidadDbRow>(`
        ${SELECT_OPORTUNIDAD}
        WHERE idOportunidad = @id
      `);
    const fila = result.recordset[0];
    return fila ? rowToOportunidad(fila) : null;
  }

  async list(): Promise<Oportunidad[]> {
    const result = await this.pool.request().query<OportunidadDbRow>(`
      ${SELECT_OPORTUNIDAD}
      ORDER BY createdAt DESC, idOportunidad DESC
    `);
    return result.recordset.map(rowToOportunidad);
  }

  async listByEmpresa(idEmpresa: string): Promise<Oportunidad[]> {
    const result = await this.pool
      .request()
      .input('idEmpresa', mssql.NVarChar(50), idEmpresa)
      .query<OportunidadDbRow>(`
        ${SELECT_OPORTUNIDAD}
        WHERE idEmpresa = @idEmpresa
        ORDER BY createdAt DESC, idOportunidad DESC
      `);
    return result.recordset.map(rowToOportunidad);
  }

  async create(idEmpresa: string, datos: NuevaOportunidad, migrada = false): Promise<Oportunidad> {
    const id = randomUUID();
    try {
      await this.pool
        .request()
        .input('id', mssql.NVarChar(50), id)
        .input('idEmpresa', mssql.NVarChar(50), idEmpresa)
        .input('nombre', mssql.NVarChar(120), datos.nombre)
        .input('responsableId', mssql.NVarChar(50), datos.responsableId)
        .input('responsableNombre', mssql.NVarChar(200), datos.responsableNombre)
        .input('origen', mssql.NVarChar(20), datos.origen)
        .input('servicio', mssql.NVarChar(120), datos.servicio)
        .input('montoEstimado', mssql.Decimal(12, 2), datos.montoEstimado)
        .input('etapa', mssql.NVarChar(20), datos.etapa)
        .input('medio', mssql.NVarChar(20), datos.medio)
        .input('medioOtro', mssql.NVarChar(80), datos.medioOtro)
        .input('migrada', mssql.Bit, migrada).query(`
        INSERT INTO dbo.CrmOportunidad
          (idOportunidad, idEmpresa, nombre, responsableId, responsableNombre, origen, servicio,
           montoEstimado, etapa, medio, medioOtro, migrada)
        VALUES (@id, @idEmpresa, @nombre, @responsableId, @responsableNombre, @origen, @servicio,
                @montoEstimado, @etapa, @medio, @medioOtro, @migrada)
      `);
    } catch (error) {
      // 547 covers FOREIGN KEY and CHECK violations; only the empresa foreign key means a missing empresa.
      if (numeroDeError(error) === FK_VIOLATION && /FOREIGN KEY/i.test((error as Error).message)) {
        throw new EmpresaNotFoundError(idEmpresa);
      }
      throw error;
    }
    const creada = await this.getById(id);
    if (!creada) throw new Error(`Oportunidad ${id} not readable right after insert`);
    return creada;
  }

  async updateDatos(idOportunidad: string, datos: DatosOportunidad): Promise<Oportunidad> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), idOportunidad)
      .input('nombre', mssql.NVarChar(120), datos.nombre)
      .input('responsableId', mssql.NVarChar(50), datos.responsableId)
      .input('responsableNombre', mssql.NVarChar(200), datos.responsableNombre)
      .input('origen', mssql.NVarChar(20), datos.origen)
      .input('servicio', mssql.NVarChar(120), datos.servicio)
      .input('montoEstimado', mssql.Decimal(12, 2), datos.montoEstimado).query(`
        UPDATE dbo.CrmOportunidad
           SET nombre = @nombre, responsableId = @responsableId, responsableNombre = @responsableNombre,
               origen = @origen, servicio = @servicio, montoEstimado = @montoEstimado,
               updatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.idOportunidad
         WHERE idOportunidad = @id
      `);
    if (result.recordset.length === 0) throw new OportunidadNotFoundError(idOportunidad);
    const actualizada = await this.getById(idOportunidad);
    if (!actualizada) throw new OportunidadNotFoundError(idOportunidad);
    return actualizada;
  }

  async updateSeguimiento(
    idOportunidad: string,
    seguimiento: SeguimientoOportunidad,
    interaccion: NuevaInteraccion | null,
  ): Promise<Oportunidad> {
    const m = seguimiento.motivo;
    const a = seguimiento.proximaAccion;
    const request = this.pool
      .request()
      .input('id', mssql.NVarChar(50), idOportunidad)
      .input('etapa', mssql.NVarChar(20), seguimiento.etapa)
      .input('medio', mssql.NVarChar(20), seguimiento.medio)
      .input('medioOtro', mssql.NVarChar(80), seguimiento.medioOtro)
      .input('motivoCategoria', mssql.NVarChar(20), m?.categoria ?? null)
      .input('motivoDetalle1', mssql.NVarChar(200), m?.detalle1 ?? null)
      .input('motivoDetalle2', mssql.NVarChar(200), m?.detalle2 ?? null)
      .input('motivoNotas', mssql.NVarChar(300), m?.notas ?? null)
      .input('intentosSinRespuesta', mssql.Int, seguimiento.intentosSinRespuesta)
      .input(
        'faltaResponderDesde',
        mssql.DateTime2(3),
        seguimiento.faltaResponderDesde ? new Date(seguimiento.faltaResponderDesde) : null,
      )
      .input('proximaAccionTipo', mssql.NVarChar(20), a?.tipo ?? null)
      .input('proximaAccionDetalle', mssql.NVarChar(80), a?.detalle ?? null)
      .input('proximaAccionFecha', mssql.VarChar(10), a?.fecha ?? null)
      .input('sugerenciaDescartadaEn', mssql.Int, seguimiento.sugerenciaDescartadaEn);
    if (interaccion) inputsInteraccion(request, interaccion);
    try {
      await request.query(`
        SET XACT_ABORT ON;
        BEGIN TRAN;
        UPDATE dbo.CrmOportunidad
           SET etapa = @etapa, medio = @medio, medioOtro = @medioOtro,
               motivoCategoria = @motivoCategoria, motivoDetalle1 = @motivoDetalle1,
               motivoDetalle2 = @motivoDetalle2, motivoNotas = @motivoNotas,
               intentosSinRespuesta = @intentosSinRespuesta,
               faltaResponderDesde = @faltaResponderDesde,
               proximaAccionTipo = @proximaAccionTipo,
               proximaAccionDetalle = @proximaAccionDetalle,
               proximaAccionFecha = CONVERT(DATE, @proximaAccionFecha, 23),
               sugerenciaDescartadaEn = @sugerenciaDescartadaEn,
               updatedAt = SYSUTCDATETIME()
         WHERE idOportunidad = @id;
        IF @@ROWCOUNT = 0 THROW ${NOT_FOUND}, 'oportunidad no encontrada', 1;
        ${interaccion ? `${INSERT_INTERACCION};` : ''}
        COMMIT;
      `);
    } catch (error) {
      if (numeroDeError(error) === NOT_FOUND) throw new OportunidadNotFoundError(idOportunidad);
      throw error;
    }
    const actualizada = await this.getById(idOportunidad);
    if (!actualizada) throw new OportunidadNotFoundError(idOportunidad);
    return actualizada;
  }
}
