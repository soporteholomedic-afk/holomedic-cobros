import * as mssql from 'mssql';

import type {
  ActualizarEmpresaInput,
  Contacto,
  CrearContactoInput,
  CrearEmpresaInput,
  Empresa,
} from '../../domain/entities';
import { normalizarCorreo, normalizarNombre, normalizarRuc } from '../../domain/normalizar';
import type { CrmEmpresaRepositoryPort, FiltrosEmpresas } from '../../domain/ports';

import { mapearConflictoUnico } from './conflictos';
import { withCrmTransaction } from './withCrmTransaction';

/**
 * SQL Server adapter for the empresa registry port (design §4). Every
 * read assembles the FULL aggregate (empresa + contactos + correos) so
 * the application layer never sees row fragments; every write that
 * spans the three tables (crear) runs inside `withCrmTransaction` so a
 * mid-flight failure leaves zero residue.
 *
 * Normalized dedup keys are derived here from the raw input via the
 * domain rules (`normalizarRuc`/`normalizarNombre`/`normalizarCorreo`)
 * — `UQ_CRM_Empresas_RucNormalizado`, `UQ_CRM_Contactos_EmpresaNombre`,
 * `UQ_CRM_Correos_ContactoCorreo` and the filtered
 * `UX_CRM_Contactos_Principal` are the enforcement backstops, and any
 * unique violation (2601/2627) is mapped to the typed `ConflictError`
 * the pr4 routes translate into HTTP 409. `LIKE` filtering relies on
 * the database's case-insensitive collation, matching the port's
 * case-insensitive `q` semantics.
 *
 * Known port limitation (kept as pr1 fixed the contract): the port
 * carries no actor parameter, so `createdBy`/`updatedBy` stay NULL
 * until a slice needs audit attribution.
 */

interface EmpresaRow {
  id: number;
  ruc: string;
  rucNormalizado: string;
  razonSocial: string;
  tipo: string;
  origen: string | null;
  proyectoObra: string | null;
  destinoComun: string | null;
  notas: string | null;
  responsable: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContactoRow {
  id: number;
  empresaId: number;
  nombre: string;
  telefono: string | null;
  esPrincipal: boolean;
}

interface CorreoRow {
  id: number;
  contactoId: number;
  correo: string;
}

/** Both `ConnectionPool` and `Transaction` expose `.request()`. */
interface RequestSource {
  request(): mssql.Request;
}

export class SqlServerEmpresaRepository implements CrmEmpresaRepositoryPort {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async crear(datos: CrearEmpresaInput): Promise<Empresa> {
    try {
      return await withCrmTransaction(this.pool, async (tx) => {
        const inserted = await tx
          .request()
          .input('ruc', mssql.NVarChar(30), datos.ruc.trim())
          .input('rucNormalizado', mssql.VarChar(30), normalizarRuc(datos.ruc))
          .input('razonSocial', mssql.NVarChar(200), datos.razonSocial)
          .input('tipo', mssql.VarChar(10), datos.tipo)
          .input('origen', mssql.VarChar(10), datos.origen ?? null)
          .input('proyectoObra', mssql.NVarChar(200), datos.proyectoObra ?? null)
          .input('destinoComun', mssql.NVarChar(200), datos.destinoComun ?? null)
          .input('notas', mssql.NVarChar(mssql.MAX), datos.notas ?? null)
          .input('responsable', mssql.NVarChar(200), datos.responsable ?? null).query(`
            INSERT INTO dbo.CRM_Empresas
              (ruc, rucNormalizado, razonSocial, tipo, origen, proyectoObra, destinoComun, notas, responsable)
            OUTPUT INSERTED.id
            VALUES (@ruc, @rucNormalizado, @razonSocial, @tipo, @origen, @proyectoObra, @destinoComun, @notas, @responsable)
          `);
        const empresaId = (inserted.recordset as { id: number }[])[0]?.id;
        if (empresaId === undefined) throw new Error('INSERT de CRM_Empresas no devolvió id');

        for (const contacto of datos.contactos) {
          await this.insertContacto(tx, empresaId, contacto);
        }

        const empresa = (await this.cargar(tx, [empresaId])).get(empresaId);
        if (!empresa) throw new Error('La empresa recién creada no pudo releerse');
        return empresa;
      });
    } catch (err: unknown) {
      throw mapearConflictoUnico(err);
    }
  }

  async listar(filtros?: FiltrosEmpresas): Promise<Empresa[]> {
    const clauses: string[] = [];
    const request = this.pool.request();
    const q = filtros?.q?.trim();
    if (q !== undefined && q !== '') {
      clauses.push('(razonSocial LIKE @q OR ruc LIKE @q OR rucNormalizado LIKE @q)');
      request.input('q', mssql.NVarChar(200), `%${q}%`);
    }
    if (filtros?.tipo !== undefined) {
      clauses.push('tipo = @tipo');
      request.input('tipo', mssql.VarChar(10), filtros.tipo);
    }
    if (filtros?.responsable !== undefined) {
      if (filtros.responsable === null) {
        clauses.push('responsable IS NULL');
      } else {
        clauses.push('responsable = @responsable');
        request.input('responsable', mssql.NVarChar(200), filtros.responsable);
      }
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await request.query(`SELECT id FROM dbo.CRM_Empresas ${where} ORDER BY id`);
    const ids = (result.recordset as { id: number }[]).map((row) => row.id);
    const cargadas = await this.cargar(this.pool, ids);
    return ids.flatMap((id) => {
      const empresa = cargadas.get(id);
      return empresa ? [empresa] : [];
    });
  }

  async obtenerPorId(id: number): Promise<Empresa | null> {
    const cargadas = await this.cargar(this.pool, [id]);
    return cargadas.get(id) ?? null;
  }

  async actualizar(id: number, cambios: ActualizarEmpresaInput): Promise<Empresa | null> {
    const sets: string[] = [];
    const request = this.pool.request().input('id', mssql.Int, id);
    if (cambios.razonSocial !== undefined) {
      sets.push('razonSocial = @razonSocial');
      request.input('razonSocial', mssql.NVarChar(200), cambios.razonSocial);
    }
    if (cambios.tipo !== undefined) {
      sets.push('tipo = @tipo');
      request.input('tipo', mssql.VarChar(10), cambios.tipo);
    }
    if (cambios.origen !== undefined) {
      sets.push('origen = @origen');
      request.input('origen', mssql.VarChar(10), cambios.origen);
    }
    if (cambios.proyectoObra !== undefined) {
      sets.push('proyectoObra = @proyectoObra');
      request.input('proyectoObra', mssql.NVarChar(200), cambios.proyectoObra);
    }
    if (cambios.destinoComun !== undefined) {
      sets.push('destinoComun = @destinoComun');
      request.input('destinoComun', mssql.NVarChar(200), cambios.destinoComun);
    }
    if (cambios.notas !== undefined) {
      sets.push('notas = @notas');
      request.input('notas', mssql.NVarChar(mssql.MAX), cambios.notas);
    }
    if (cambios.responsable !== undefined) {
      sets.push('responsable = @responsable');
      request.input('responsable', mssql.NVarChar(200), cambios.responsable);
    }
    if (sets.length === 0) return this.obtenerPorId(id);

    const result = await request.query(`
      UPDATE dbo.CRM_Empresas SET ${sets.join(', ')}, updatedAt = SYSDATETIME() WHERE id = @id
    `);
    if ((result.rowsAffected[0] ?? 0) === 0) return null;
    return this.obtenerPorId(id);
  }

  private async insertContacto(
    tx: mssql.Transaction,
    empresaId: number,
    contacto: CrearContactoInput,
  ): Promise<void> {
    const inserted = await tx
      .request()
      .input('empresaId', mssql.Int, empresaId)
      .input('nombre', mssql.NVarChar(200), contacto.nombre)
      .input('nombreNormalizado', mssql.VarChar(200), normalizarNombre(contacto.nombre))
      .input('telefono', mssql.VarChar(30), contacto.telefono ?? null)
      .input('esPrincipal', mssql.Bit, contacto.esPrincipal === true)
      .query(`
        INSERT INTO dbo.CRM_Contactos (empresaId, nombre, nombreNormalizado, telefono, esPrincipal)
        OUTPUT INSERTED.id
        VALUES (@empresaId, @nombre, @nombreNormalizado, @telefono, @esPrincipal)
      `);
    const contactoId = (inserted.recordset as { id: number }[])[0]?.id;
    if (contactoId === undefined) throw new Error('INSERT de CRM_Contactos no devolvió id');

    const seen = new Set<string>();
    for (const raw of contacto.correos) {
      const correo = normalizarCorreo(raw);
      if (correo === '' || seen.has(correo)) continue; // union semantics (UQ backstop)
      seen.add(correo);
      await tx
        .request()
        .input('contactoId', mssql.Int, contactoId)
        .input('correo', mssql.VarChar(320), correo)
        .query('INSERT INTO dbo.CRM_Correos (contactoId, correo) VALUES (@contactoId, @correo)');
    }
  }

  /** Assemble full aggregates for the given empresa ids (3 queries). */
  private async cargar(source: RequestSource, ids: number[]): Promise<Map<number, Empresa>> {
    const vacio = new Map<number, Empresa>();
    if (ids.length === 0) return vacio;

    const placeholders = ids.map((_, i) => `@id${i}`);
    const request = source.request();
    ids.forEach((id, i) => request.input(`id${i}`, mssql.Int, id));

    const empresasRes = await request.query(`
      SELECT id, ruc, rucNormalizado, razonSocial, tipo, origen, proyectoObra, destinoComun,
             notas, responsable, createdAt, updatedAt
      FROM dbo.CRM_Empresas WHERE id IN (${placeholders.join(', ')}) ORDER BY id
    `);
    const contactosRes = await request.query(`
      SELECT id, empresaId, nombre, telefono, esPrincipal
      FROM dbo.CRM_Contactos WHERE empresaId IN (${placeholders.join(', ')}) ORDER BY id
    `);
    const contactoIds = (contactosRes.recordset as ContactoRow[]).map((row) => row.id);
    const correos: CorreoRow[] =
      contactoIds.length > 0 ? (await this.cargarCorreos(source, contactoIds)).recordset : [];

    const correosPorContacto = new Map<number, CorreoRow[]>();
    for (const correo of correos) {
      const lista = correosPorContacto.get(correo.contactoId) ?? [];
      lista.push(correo);
      correosPorContacto.set(correo.contactoId, lista);
    }

    const resultado = new Map<number, Empresa>();
    for (const row of empresasRes.recordset as EmpresaRow[]) {
      const contactos: Contacto[] = (contactosRes.recordset as ContactoRow[])
        .filter((c) => c.empresaId === row.id)
        .map((c) => ({
          id: c.id,
          empresaId: c.empresaId,
          nombre: c.nombre,
          telefono: c.telefono,
          esPrincipal: c.esPrincipal,
          correos: (correosPorContacto.get(c.id) ?? []).map((correo) => ({
            id: correo.id,
            contactoId: correo.contactoId,
            correo: correo.correo,
          })),
        }));
      resultado.set(row.id, {
        id: row.id,
        ruc: row.ruc,
        rucNormalizado: row.rucNormalizado,
        razonSocial: row.razonSocial,
        tipo: row.tipo as Empresa['tipo'],
        origen: (row.origen ?? null) as Empresa['origen'],
        proyectoObra: row.proyectoObra,
        destinoComun: row.destinoComun,
        notas: row.notas,
        responsable: row.responsable,
        contactos,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    }
    return resultado;
  }

  private async cargarCorreos(
    source: RequestSource,
    contactoIds: number[],
  ): Promise<{ recordset: CorreoRow[] }> {
    const placeholders = contactoIds.map((_, i) => `@cid${i}`);
    const request = source.request();
    contactoIds.forEach((id, i) => request.input(`cid${i}`, mssql.Int, id));
    return request.query(`
      SELECT id, contactoId, correo FROM dbo.CRM_Correos
      WHERE contactoId IN (${placeholders.join(', ')}) ORDER BY id
    `);
  }
}
