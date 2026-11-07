import { randomUUID } from 'node:crypto';
import mssql from 'mssql';

import type { ICrmEmpresaRepository } from '../../domain/ports';
import type {
  Contacto,
  DatosEmpresa,
  Direccion,
  Empresa,
  IconoSector,
  Interaccion,
  Medio,
  NuevaEmpresa,
  NuevaInteraccion,
  Relacion,
  Resultado,
  Sector,
} from '../../domain/entities';
import { esIconoSector } from '../../domain/entities';
import {
  DatosEmpresaInvalidosError,
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
  direccion: string | null;
  relacion: string;
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
  /** Oportunidad the activity belongs to; NULL when it is a general activity. */
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

/** SQL Server error numbers for a violated PRIMARY KEY/UNIQUE constraint or unique index. */
const UNIQUE_VIOLATION = new Set([2627, 2601]);
/** Raised by our own `THROW` when an UPDATE matched no empresa. */
const NOT_FOUND = 50404;
/** Raised by `fusionar` when the destination does not exist (the origin uses `NOT_FOUND`). */
const NOT_FOUND_DESTINO = 50405;
/** Foreign key violation: the interaction points to an empresa that does not exist. */
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

function rowToEmpresa(row: EmpresaDbRow, contactos: ContactoDbRow[]): Empresa {
  return {
    idEmpresa: row.idEmpresa,
    razonSocial: row.razonSocial,
    ruc: row.ruc ?? null,
    sector: row.sector ?? null,
    notas: row.notas ?? null,
    direccion: row.direccion ?? null,
    relacion: row.relacion as Relacion,
    contactos: contactos.map(
      (c): Contacto => ({ nombre: c.nombre ?? null, telefono: c.telefono ?? null, correo: c.correo ?? null }),
    ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SELECT_EMPRESA = /* sql */ `
  SELECT e.idEmpresa, e.razonSocial, e.ruc, s.nombre AS sector, e.notas, e.direccion, e.relacion,
         e.createdAt, e.updatedAt
  FROM dbo.CrmEmpresa e
  LEFT JOIN dbo.CrmSector s ON s.idSector = e.idSector`;

const SELECT_CONTACTOS = /* sql */ `
  SELECT c.idEmpresa, c.nombre, c.telefono, c.correo, c.esPrincipal
  FROM dbo.CrmContacto c`;

const SELECT_INTERACCION = /* sql */ `
  SELECT idInteraccion, idEmpresa, idOportunidad, fecha, idUsuario, nombreUsuario, direccion, medio,
         medioOtro, resultado, resumen
  FROM dbo.CrmInteraccion`;

/** Parameters of `INSERT INTO dbo.CrmInteraccion`, bound to `@idEmpresa` + the fields of `i`. */
function inputsInteraccion(request: mssql.Request, i: NuevaInteraccion): void {
  request
    .input('ioid', mssql.NVarChar(50), i.idOportunidad)
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
  VALUES (@idEmpresa, @ioid, @idUsuario, @nombreUsuario, @direccion, @imedio, @imedioOtro, @resultado, @resumen)`;

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
        .input('direccion', mssql.NVarChar(300), input.direccion)
        .input('relacion', mssql.NVarChar(20), input.relacion);
      const contactos = inputsContactos(request, input.contactos);
      await request.query(`
        SET XACT_ABORT ON;
        BEGIN TRAN;
        INSERT INTO dbo.CrmEmpresa (idEmpresa, razonSocial, ruc, idSector, notas, relacion, direccion)
        VALUES (@idEmpresa, @razonSocial, @ruc,
                (SELECT idSector FROM dbo.CrmSector WHERE nombre = @sector), @notas, @relacion, @direccion);
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
        .input('notas', mssql.NVarChar(mssql.MAX), datos.notas)
        .input('direccion', mssql.NVarChar(300), datos.direccion);
      const contactos = inputsContactos(request, datos.contactos);
      await request.query(`
        SET XACT_ABORT ON;
        BEGIN TRAN;
        UPDATE dbo.CrmEmpresa
           SET razonSocial = @razonSocial, ruc = @ruc, notas = @notas, direccion = @direccion,
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

  async updateRelacion(id: string, relacion: Relacion): Promise<Empresa> {
    const result = await this.pool
      .request()
      .input('id', mssql.NVarChar(50), id)
      .input('relacion', mssql.NVarChar(20), relacion).query(`
        UPDATE dbo.CrmEmpresa
           SET relacion = @relacion, updatedAt = SYSUTCDATETIME()
        OUTPUT INSERTED.idEmpresa
         WHERE idEmpresa = @id
      `);
    if (result.recordset.length === 0) throw new EmpresaNotFoundError(id);
    const actualizada = await this.getById(id);
    if (!actualizada) throw new EmpresaNotFoundError(id);
    return actualizada;
  }

  async addInteraccion(idEmpresa: string, interaccion: NuevaInteraccion): Promise<Interaccion> {
    const request = this.pool.request().input('idEmpresa', mssql.NVarChar(50), idEmpresa);
    inputsInteraccion(request, interaccion);
    let result: mssql.IResult<InteraccionDbRow>;
    try {
      result = await request.query<InteraccionDbRow>(`
      ${INSERT_INTERACCION.replace(
        'VALUES',
        `OUTPUT INSERTED.idInteraccion, INSERTED.idEmpresa, INSERTED.idOportunidad, INSERTED.fecha,
           INSERTED.idUsuario, INSERTED.nombreUsuario, INSERTED.direccion, INSERTED.medio,
           INSERTED.medioOtro, INSERTED.resultado, INSERTED.resumen
    VALUES`,
      )}
    `);
    } catch (error) {
      // 547 covers FOREIGN KEY and CHECK violations; only the empresa foreign
      // key means a missing empresa (a linked oportunidad that does not exist
      // is the caller's bad data and must surface as-is).
      if (
        numeroDeError(error) === FK_VIOLATION &&
        /FK_CrmInteraccion_empresa/i.test((error as Error).message)
      ) {
        throw new EmpresaNotFoundError(idEmpresa);
      }
      throw error;
    }
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
    if (idOrigen === idDestino) {
      throw new DatosEmpresaInvalidosError('No se puede unir una tarjeta consigo misma.');
    }
    try {
      await this.pool
        .request()
        .input('origen', mssql.NVarChar(50), idOrigen)
        .input('destino', mssql.NVarChar(50), idDestino).query(`
        SET XACT_ABORT ON;
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM dbo.CrmEmpresa WHERE idEmpresa = @origen)
          THROW ${NOT_FOUND}, 'empresa de origen no encontrada', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.CrmEmpresa WHERE idEmpresa = @destino)
          THROW ${NOT_FOUND_DESTINO}, 'empresa de destino no encontrada', 1;
        UPDATE dbo.CrmInteraccion SET idEmpresa = @destino WHERE idEmpresa = @origen;
        -- The oportunidades are cards of the empresa: they move with it too,
        -- before the origin row (and its cascade) disappears.
        UPDATE dbo.CrmOportunidad SET idEmpresa = @destino WHERE idEmpresa = @origen;
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
        UPDATE d SET notas = CASE
                       WHEN o.notas IS NULL THEN d.notas
                       WHEN d.notas IS NULL THEN o.notas
                       WHEN d.notas = o.notas THEN d.notas
                       ELSE d.notas + CHAR(10) + CHAR(10) + o.notas END,
                     updatedAt = SYSUTCDATETIME()
          FROM dbo.CrmEmpresa d
          JOIN dbo.CrmEmpresa o ON o.idEmpresa = @origen
         WHERE d.idEmpresa = @destino;
        DELETE FROM dbo.CrmEmpresa WHERE idEmpresa = @origen;
        COMMIT;
      `);
    } catch (error) {
      const number = numeroDeError(error);
      if (number === NOT_FOUND) throw new EmpresaNotFoundError(idOrigen);
      if (number === NOT_FOUND_DESTINO) throw new EmpresaNotFoundError(idDestino);
      throw error;
    }
    const destino = await this.getById(idDestino);
    if (!destino) throw new EmpresaNotFoundError(idDestino);
    return destino;
  }

  async listSectores(): Promise<Sector[]> {
    const result = await this.pool
      .request()
      .query<{ nombre: string; icono: string | null }>(`SELECT nombre, icono FROM dbo.CrmSector ORDER BY nombre`);
    return result.recordset.map(filaSector);
  }

  async createSector(nombre: string, icono: IconoSector | null): Promise<Sector> {
    try {
      const result = await this.pool
        .request()
        .input('nombre', mssql.NVarChar(50), nombre)
        .input('icono', mssql.NVarChar(20), icono)
        .query<{ nombre: string; icono: string | null }>(
          `INSERT INTO dbo.CrmSector (nombre, icono) OUTPUT INSERTED.nombre, INSERTED.icono VALUES (@nombre, @icono)`,
        );
      const fila = result.recordset[0];
      return fila ? filaSector(fila) : { nombre, icono };
    } catch (error) {
      const number = numeroDeError(error);
      if (number !== undefined && UNIQUE_VIOLATION.has(number)) throw new SectorDuplicadoError(nombre);
      throw error;
    }
  }
}

/** A stored icon that is not in the closed list (edited by hand) reads as "no icon". */
function filaSector(fila: { nombre: string; icono?: string | null }): Sector {
  return { nombre: fila.nombre, icono: esIconoSector(fila.icono) ? fila.icono : null };
}
