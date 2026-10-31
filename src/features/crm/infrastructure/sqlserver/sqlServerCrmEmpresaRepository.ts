import { randomUUID } from 'node:crypto';
import mssql from 'mssql';

import type { ICrmEmpresaRepository } from '../../domain/ports';
import type {
  Contacto,
  DatosEmpresa,
  Empresa,
  Etapa,
  EstadoEmpresa,
  Medio,
  Motivo,
  MotivoCategoria,
  NuevaEmpresa,
} from '../../domain/entities';
import {
  EmpresaNotFoundError,
  RucDuplicadoError,
  SectorDuplicadoError,
} from '../../domain/errors';

interface EmpresaDbRow {
  idEmpresa: string;
  razonSocial: string;
  ruc: string;
  sector: string | null;
  notas: string | null;
  etapa: string;
  medio: string | null;
  motivoCategoria: string | null;
  motivoDetalle1: string | null;
  motivoDetalle2: string | null;
  motivoNotas: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContactoDbRow {
  idEmpresa: string;
  nombre: string;
  telefono: string;
  correo: string | null;
  esPrincipal: boolean;
}

/** SQL Server error numbers for a violated PRIMARY KEY/UNIQUE constraint or unique index. */
const UNIQUE_VIOLATION = new Set([2627, 2601]);
/** Raised by our own `THROW` when an UPDATE matched no empresa. */
const NOT_FOUND = 50404;

function numeroDeError(error: unknown): number | undefined {
  return (error as { number?: number } | null)?.number;
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
  return {
    idEmpresa: row.idEmpresa,
    razonSocial: row.razonSocial,
    ruc: row.ruc,
    sector: row.sector ?? null,
    notas: row.notas ?? null,
    etapa: row.etapa as Etapa,
    medio: (row.medio as Medio | null) ?? null,
    motivo,
    contactos: contactos.map(
      (c): Contacto => ({ nombre: c.nombre, telefono: c.telefono, correo: c.correo ?? null }),
    ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SELECT_EMPRESA = /* sql */ `
  SELECT e.idEmpresa, e.razonSocial, e.ruc, s.nombre AS sector, e.notas, e.etapa, e.medio,
         e.motivoCategoria, e.motivoDetalle1, e.motivoDetalle2, e.motivoNotas,
         e.createdAt, e.updatedAt
  FROM dbo.CrmEmpresa e
  LEFT JOIN dbo.CrmSector s ON s.idSector = e.idSector`;

const SELECT_CONTACTOS = /* sql */ `
  SELECT c.idEmpresa, c.nombre, c.telefono, c.correo, c.esPrincipal
  FROM dbo.CrmContacto c`;

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

  async findByRuc(ruc: string): Promise<Empresa | null> {
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
        throw new RucDuplicadoError(input.ruc);
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
        throw new RucDuplicadoError(datos.ruc);
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
