import { randomUUID } from 'node:crypto';
import mssql from 'mssql';

import type { ICrmEmpresaRepository } from '../../domain/ports';
import type {
  AccionTipo,
  Contacto,
  DatosEmpresa,
  Direccion,
  Empresa,
  Etapa,
  EstadoEmpresa,
  Interaccion,
  Medio,
  Motivo,
  MotivoCategoria,
  NuevaEmpresa,
  NuevaInteraccion,
  Origen,
  ProximaAccion,
  Resultado,
  SeguimientoEmpresa,
} from '../../domain/entities';
import {
  EmpresaNotFoundError,
  RucDuplicadoError,
  SectorDuplicadoError,
} from '../../domain/errors';

interface EmpresaDbRow {
  idEmpresa: string;
  razonSocial: string;
  ruc: string | null;
  sector: string | null;
  notas: string | null;
  etapa: string;
  medio: string | null;
  medioOtro: string | null;
  intentosSinRespuesta: number;
  faltaResponderDesde: Date | null;
  proximaAccionTipo: string | null;
  proximaAccionDetalle: string | null;
  proximaAccionFecha: Date | null;
  origen: string | null;
  sugerenciaDescartadaEn: number | null;
  motivoCategoria: string | null;
  motivoDetalle1: string | null;
  motivoDetalle2: string | null;
  motivoNotas: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContactoDbRow {
  idEmpresa: string;
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
  esPrincipal: boolean;
}

interface InteraccionDbRow {
  idInteraccion: number;
  idEmpresa: string;
  fecha: Date;
  idUsuario: string;
  nombreUsuario: string;
  direccion: string;
  medio: string;
  medioOtro: string | null;
  resultado: string;
  resumen: string | null;
}

/** SQL Server error numbers for a violated PRIMARY KEY/UNIQUE constraint or unique index. */
const UNIQUE_VIOLATION = new Set([2627, 2601]);
/** Raised by our own `THROW` when an UPDATE matched no empresa. */
const NOT_FOUND = 50404;

function numeroDeError(error: unknown): number | undefined {
  return (error as { number?: number } | null)?.number;
}

function rowToInteraccion(row: InteraccionDbRow): Interaccion {
  return {
    idInteraccion: row.idInteraccion,
    idEmpresa: row.idEmpresa,
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

function rowToEmpresa(row: EmpresaDbRow, contactos: ContactoDbRow[]): Empresa {
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
    idEmpresa: row.idEmpresa,
    razonSocial: row.razonSocial,
    ruc: row.ruc ?? null,
    sector: row.sector ?? null,
    notas: row.notas ?? null,
    etapa: row.etapa as Etapa,
    medio: (row.medio as Medio | null) ?? null,
    medioOtro: row.medioOtro ?? null,
    motivo,
    intentosSinRespuesta: row.intentosSinRespuesta ?? 0,
    faltaResponderDesde: row.faltaResponderDesde ? row.faltaResponderDesde.toISOString() : null,
    proximaAccion,
    origen: (row.origen as Origen | null) ?? null,
    sugerenciaDescartadaEn: row.sugerenciaDescartadaEn ?? null,
    contactos: contactos.map(
      (c): Contacto => ({ nombre: c.nombre ?? null, telefono: c.telefono ?? null, correo: c.correo ?? null }),
    ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SELECT_EMPRESA = /* sql */ `
  SELECT e.idEmpresa, e.razonSocial, e.ruc, s.nombre AS sector, e.notas, e.etapa, e.medio,
         e.medioOtro, e.intentosSinRespuesta, e.faltaResponderDesde, e.proximaAccionTipo,
         e.proximaAccionDetalle, e.proximaAccionFecha, e.origen, e.sugerenciaDescartadaEn,
         e.motivoCategoria, e.motivoDetalle1, e.motivoDetalle2, e.motivoNotas,
         e.createdAt, e.updatedAt
  FROM dbo.CrmEmpresa e
  LEFT JOIN dbo.CrmSector s ON s.idSector = e.idSector`;

const SELECT_CONTACTOS = /* sql */ `
  SELECT c.idEmpresa, c.nombre, c.telefono, c.correo, c.esPrincipal
  FROM dbo.CrmContacto c`;

const SELECT_INTERACCION = /* sql */ `
  SELECT idInteraccion, idEmpresa, fecha, idUsuario, nombreUsuario, direccion, medio, medioOtro,
         resultado, resumen
  FROM dbo.CrmInteraccion`;

/** Parameters of `INSERT INTO dbo.CrmInteraccion`, bound to `@idEmpresa` + the fields of `i`. */
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
    (idEmpresa, idUsuario, nombreUsuario, direccion, medio, medioOtro, resultado, resumen)
  VALUES (@idEmpresa, @idUsuario, @nombreUsuario, @direccion, @imedio, @imedioOtro, @resultado, @resumen)`;

/** Parameter names for contact `i`: n(ombre), t(eléfono), c(orreo), p(rincipal). */
function inputsContactos(request: mssql.Request, contactos: Contacto[]): string {
  const filas = contactos.map((c, i) => {
    request
      .input(`c${i}n`, mssql.NVarChar(200), c.nombre)
      .input(`c${i}t`, mssql.NVarChar(50), c.telefono)
      .input(`c${i}c`, mssql.NVarChar(200), c.correo)
      .input(`c${i}p`, mssql.Bit, i === 0);
    return `(@id, @c${i}n, @c${i}t, @c${i}c, @c${i}p, ${i})`;
  });
  return `INSERT INTO dbo.CrmContacto (idEmpresa, nombre, telefono, correo, esPrincipal, orden)
    VALUES ${filas.join(',\n           ')};`;
}

export class SqlServerCrmEmpresaRepository implements ICrmEmpresaRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  /** Empresas matching `where` plus their contacts, principal first. */
  private async leer(
    where: string,
    bind: (r: mssql.Request) => mssql.Request,
  ): Promise<Empresa[]> {
    const filtro = where ? `WHERE ${where}` : '';
    const result = await bind(this.pool.request()).query<EmpresaDbRow & ContactoDbRow>(`
      ${SELECT_EMPRESA}
      ${filtro}
      ORDER BY e.updatedAt DESC;
      ${SELECT_CONTACTOS}
      ${where ? `WHERE c.idEmpresa IN (SELECT e.idEmpresa FROM dbo.CrmEmpresa e ${filtro})` : ''}
      ORDER BY c.idEmpresa, c.esPrincipal DESC, c.orden;
    `);
    const [empresas = [], contactos = []] = result.recordsets as unknown as [
      EmpresaDbRow[],
      ContactoDbRow[],
    ];
    const porEmpresa = new Map<string, ContactoDbRow[]>();
    for (const c of contactos) {
      const lista = porEmpresa.get(c.idEmpresa) ?? [];
      lista.push(c);
      porEmpresa.set(c.idEmpresa, lista);
    }
    return empresas.map((e) => rowToEmpresa(e, porEmpresa.get(e.idEmpresa) ?? []));
  }

  async getById(id: string): Promise<Empresa | null> {
    const [empresa] = await this.leer('e.idEmpresa = @id', (r) =>
      r.input('id', mssql.NVarChar(50), id),
    );
    return empresa ?? null;
  }

  async findByRuc(ruc: string | null): Promise<Empresa | null> {
    if (ruc === null) return null;
    const [empresa] = await this.leer('e.ruc = @ruc', (r) => r.input('ruc', mssql.VarChar(11), ruc));
    return empresa ?? null;
  }

  async list(): Promise<Empresa[]> {
    return this.leer('', (r) => r);
  }

  async create(input: NuevaEmpresa): Promise<Empresa> {
    const id = randomUUID();
    try {
      const request = this.pool
        .request()
        .input('id', mssql.NVarChar(50), id)
        .input('idEmpresa', mssql.NVarChar(50), id)
        .input('razonSocial', mssql.NVarChar(200), input.razonSocial)
        .input('ruc', mssql.VarChar(11), input.ruc)
        .input('sector', mssql.NVarChar(50), input.sector)
        .input('notas', mssql.NVarChar(mssql.MAX), input.notas)
        .input('etapa', mssql.NVarChar(20), input.etapa);
      const contactos = inputsContactos(request, input.contactos);
      await request.query(`
        SET XACT_ABORT ON;
        BEGIN TRAN;
        INSERT INTO dbo.CrmEmpresa (idEmpresa, razonSocial, ruc, idSector, notas, etapa)
        VALUES (@idEmpresa, @razonSocial, @ruc,
                (SELECT idSector FROM dbo.CrmSector WHERE nombre = @sector), @notas, @etapa);
        ${contactos}
        COMMIT;
      `);
    } catch (error) {
      // Two concurrent creates can both pass the use case's RUC check;
      // the unique constraint is the real guard.
      const number = numeroDeError(error);
      if (number !== undefined && UNIQUE_VIOLATION.has(number)) {
        throw new RucDuplicadoError(input.ruc ?? '');
      }
      throw error;
    }
    const creada = await this.getById(id);
    if (!creada) throw new Error(`Empresa ${id} not readable right after insert`);
    return creada;
  }

  async update(id: string, datos: DatosEmpresa): Promise<Empresa> {
    try {
      const request = this.pool
        .request()
        .input('id', mssql.NVarChar(50), id)
        .input('razonSocial', mssql.NVarChar(200), datos.razonSocial)
        .input('ruc', mssql.VarChar(11), datos.ruc)
        .input('sector', mssql.NVarChar(50), datos.sector)
        .input('notas', mssql.NVarChar(mssql.MAX), datos.notas);
      const contactos = inputsContactos(request, datos.contactos);
      await request.query(`
        SET XACT_ABORT ON;
        BEGIN TRAN;
        UPDATE dbo.CrmEmpresa
           SET razonSocial = @razonSocial, ruc = @ruc, notas = @notas,
               idSector = (SELECT idSector FROM dbo.CrmSector WHERE nombre = @sector),
               updatedAt = SYSUTCDATETIME()
         WHERE idEmpresa = @id;
        IF @@ROWCOUNT = 0 THROW ${NOT_FOUND}, 'empresa no encontrada', 1;
        DELETE FROM dbo.CrmContacto WHERE idEmpresa = @id;
        ${contactos}
        COMMIT;
      `);
    } catch (error) {
      const number = numeroDeError(error);
      if (number === NOT_FOUND) throw new EmpresaNotFoundError(id);
      if (number !== undefined && UNIQUE_VIOLATION.has(number)) {
        throw new RucDuplicadoError(datos.ruc ?? '');
      }
      throw error;
    }
    const editada = await this.getById(id);
    if (!editada) throw new EmpresaNotFoundError(id);
    return editada;
  }

  async updateEstado(id: string, estado: EstadoEmpresa): Promise<Empresa> {
    const m = estado.motivo;
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .input('etapa', mssql.NVarChar(20), estado.etapa)
      .input('medio', mssql.NVarChar(10), estado.medio)
      .input('motivoCategoria', mssql.NVarChar(20), m?.categoria ?? null)
      .input('motivoDetalle1', mssql.NVarChar(200), m?.detalle1 ?? null)
      .input('motivoDetalle2', mssql.NVarChar(200), m?.detalle2 ?? null)
      .input('motivoNotas', mssql.NVarChar(300), m?.notas ?? null).query(`
        UPDATE dbo.CrmEmpresa
           SET etapa = @etapa, medio = @medio,
               motivoCategoria = @motivoCategoria, motivoDetalle1 = @motivoDetalle1,
               motivoDetalle2 = @motivoDetalle2, motivoNotas = @motivoNotas,
               updatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.idEmpresa
         WHERE idEmpresa = @id
      `);
    if (result.recordset.length === 0) throw new EmpresaNotFoundError(id);
    const actualizada = await this.getById(id);
    if (!actualizada) throw new EmpresaNotFoundError(id);
    return actualizada;
  }

  async updateSeguimiento(
    id: string,
    seguimiento: SeguimientoEmpresa,
    interaccion: NuevaInteraccion | null,
  ): Promise<Empresa> {
    const m = seguimiento.motivo;
    const a = seguimiento.proximaAccion;
    const request = this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .input('idEmpresa', mssql.NVarChar(50), id)
      .input('etapa', mssql.NVarChar(20), seguimiento.etapa)
      .input('medio', mssql.NVarChar(10), seguimiento.medio)
      .input('medioOtro', mssql.NVarChar(40), seguimiento.medioOtro)
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
        UPDATE dbo.CrmEmpresa
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
         WHERE idEmpresa = @id;
        IF @@ROWCOUNT = 0 THROW ${NOT_FOUND}, 'empresa no encontrada', 1;
        ${interaccion ? `${INSERT_INTERACCION};` : ''}
        COMMIT;
      `);
    } catch (error) {
      if (numeroDeError(error) === NOT_FOUND) throw new EmpresaNotFoundError(id);
      throw error;
    }
    const actualizada = await this.getById(id);
    if (!actualizada) throw new EmpresaNotFoundError(id);
    return actualizada;
  }

  async addInteraccion(idEmpresa: string, interaccion: NuevaInteraccion): Promise<Interaccion> {
    const request = this.pool.request().input('idEmpresa', mssql.NVarChar(50), idEmpresa);
    inputsInteraccion(request, interaccion);
    const result = await request.query<InteraccionDbRow>(`
      ${INSERT_INTERACCION.replace(
        'VALUES',
        `OUTPUT INSERTED.idInteraccion, INSERTED.idEmpresa, INSERTED.fecha, INSERTED.idUsuario,
           INSERTED.nombreUsuario, INSERTED.direccion, INSERTED.medio, INSERTED.medioOtro,
           INSERTED.resultado, INSERTED.resumen
    VALUES`,
      )}
    `);
    const fila = result.recordset[0];
    if (!fila) throw new Error(`Interacción not readable right after insert for ${idEmpresa}`);
    return rowToInteraccion(fila);
  }

  async listInteracciones(idEmpresa: string): Promise<Interaccion[]> {
    const result = await this.pool
      .request()
      .input('idEmpresa', mssql.NVarChar(50), idEmpresa)
      .query<InteraccionDbRow>(`
        ${SELECT_INTERACCION}
        WHERE idEmpresa = @idEmpresa
        ORDER BY fecha DESC, idInteraccion DESC
      `);
    return result.recordset.map(rowToInteraccion);
  }

  async fusionar(idOrigen: string, idDestino: string): Promise<Empresa> {
    if (idOrigen === idDestino) throw new Error('No se puede unir una empresa consigo misma');
    try {
      await this.pool
        .request()
        .input('origen', mssql.NVarChar(50), idOrigen)
        .input('destino', mssql.NVarChar(50), idDestino).query(`
        SET XACT_ABORT ON;
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM dbo.CrmEmpresa WHERE idEmpresa = @origen)
          OR NOT EXISTS (SELECT 1 FROM dbo.CrmEmpresa WHERE idEmpresa = @destino)
          THROW ${NOT_FOUND}, 'empresa no encontrada', 1;
        UPDATE dbo.CrmInteraccion SET idEmpresa = @destino WHERE idEmpresa = @origen;
        UPDATE o SET idEmpresa = @destino, esPrincipal = 0,
                     orden = o.orden + 1000
          FROM dbo.CrmContacto o
         WHERE o.idEmpresa = @origen
           AND NOT EXISTS (
             SELECT 1 FROM dbo.CrmContacto d
              WHERE d.idEmpresa = @destino
                AND ISNULL(d.nombre, N'') = ISNULL(o.nombre, N'')
                AND ISNULL(d.telefono, N'') = ISNULL(o.telefono, N'')
                AND ISNULL(d.correo, N'') = ISNULL(o.correo, N''));
        DELETE FROM dbo.CrmEmpresa WHERE idEmpresa = @origen;
        UPDATE dbo.CrmEmpresa SET updatedAt = SYSUTCDATETIME() WHERE idEmpresa = @destino;
        COMMIT;
      `);
    } catch (error) {
      if (numeroDeError(error) === NOT_FOUND) throw new EmpresaNotFoundError(idOrigen);
      throw error;
    }
    const destino = await this.getById(idDestino);
    if (!destino) throw new EmpresaNotFoundError(idDestino);
    return destino;
  }

  async listSectores(): Promise<string[]> {
    const result = await this.pool
      .request()
      .query<{ nombre: string }>(`SELECT nombre FROM dbo.CrmSector ORDER BY nombre`);
    return result.recordset.map((r) => r.nombre);
  }

  async createSector(nombre: string): Promise<string> {
    try {
      const result = await this.pool
        .request()
        .input('nombre', mssql.NVarChar(50), nombre)
        .query<{ nombre: string }>(
          `INSERT INTO dbo.CrmSector (nombre) OUTPUT INSERTED.nombre VALUES (@nombre)`,
        );
      return result.recordset[0]?.nombre ?? nombre;
    } catch (error) {
      const number = numeroDeError(error);
      if (number !== undefined && UNIQUE_VIOLATION.has(number)) throw new SectorDuplicadoError(nombre);
      throw error;
    }
  }
}
