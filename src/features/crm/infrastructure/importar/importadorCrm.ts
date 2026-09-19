import * as mssql from 'mssql';

import { normalizarCorreo, normalizarNombre } from '../../domain/normalizar';
import type { CrmImportadorPort, RegistroImportacion, ResultadoGrupoImport } from '../../domain/ports';
import { planificarMergeContactos } from '../../domain/importar/mergeContactos';
import type { ContactoExistenteMerge } from '../../domain/importar/mergeContactos';
import type { GrupoEmpresaImportado } from '../../domain/importar/validarImportacion';

import { mapearConflictoUnico } from '../sqlserver/conflictos';
import { withCrmTransaction } from '../sqlserver/withCrmTransaction';

/**
 * Import boundary adapter (tasks pr6/WU3, design §4).
 *
 * `SqlServerCrmImportador` — executes ONE validated RUC group per
 * `withCrmTransaction` (design §2a: a failing group never rolls back
 * valid groups; the use case catches per-group errors):
 * - create mode: inserts empresa + contactos + correos (pr3
 *   `insertContacto` semantics, principal flags as validated).
 * - update mode: updates the empresa fields and applies the D1 merge
 *   rule via the pure planner — name-match updates teléfono (if
 *   provided) and UNIONs correos; no match appends a new contacto;
 *   correo overlap without name match still creates AND emits a
 *   non-blocking warning. New contactos never displace the existing
 *   principal (`esPrincipal = 0` — D1 covers teléfono/correos only,
 *   and the filtered unique index would reject a second principal).
 *   `responsable` is deliberately NOT touched on update: cartera
 *   assignments (spec G5) own that state, the import must not rewrite
 *   it.
 *
 * Unique violations (2601/2627) map to the shared Spanish
 * `ConflictError`; the use case turns them into per-group report rows.
 *
 * The pure client-row mapper `mapearFilasImportCrm` moved to the domain
 * layer (pr8) so the browser-side parser shares it without importing
 * `mssql`; re-exported here for the pr6/pr7 consumers.
 */
export { mapearFilasImportCrm } from '../../domain/importar/mapearFilas';

interface EmpresaIdRow {
  id: number;
}

interface ContactoConCorreosRow {
  id: number;
  nombre: string;
  nombreNormalizado: string;
  telefono: string | null;
  correo: string | null;
}

/** Anything insertable as a contacto (validated import row or plan creation). */
interface ContactoAInsertar {
  nombre: string;
  telefono: string | null;
  correos: string[];
}

export class SqlServerCrmImportador implements CrmImportadorPort {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async ejecutarGrupo(grupo: GrupoEmpresaImportado, usuario: string): Promise<ResultadoGrupoImport> {
    try {
      return await withCrmTransaction(this.pool, async (tx) => {
        const existente = await tx
          .request()
          .input('rucNormalizado', mssql.VarChar(30), grupo.ruc)
          .query('SELECT id FROM dbo.CRM_Empresas WHERE rucNormalizado = @rucNormalizado');
        const empresaId = (existente.recordset as EmpresaIdRow[])[0]?.id;

        if (empresaId === undefined) {
          return this.crearEmpresa(tx, grupo, usuario);
        }
        return this.actualizarEmpresa(tx, empresaId, grupo, usuario);
      });
    } catch (err: unknown) {
      throw mapearConflictoUnico(err);
    }
  }

  async registrarImportacion(registro: RegistroImportacion): Promise<number> {
    const result = await this.pool
      .request()
      .input('archivoNombre', mssql.NVarChar(300), registro.archivoNombre)
      .input('totalFilas', mssql.Int, registro.totalFilas)
      .input('filasValidas', mssql.Int, registro.filasValidas)
      .input('empresasCreadas', mssql.Int, registro.empresasCreadas)
      .input('empresasActualizadas', mssql.Int, registro.empresasActualizadas)
      .input('contactosCreados', mssql.Int, registro.contactosCreados)
      .input('contactosActualizados', mssql.Int, registro.contactosActualizados)
      .input('erroresJson', mssql.NVarChar(mssql.MAX), registro.erroresJson)
      .input('ejecutadoPor', mssql.NVarChar(200), registro.ejecutadoPor).query(`
        INSERT INTO dbo.CRM_Importaciones
          (archivoNombre, totalFilas, filasValidas, empresasCreadas, empresasActualizadas,
           contactosCreados, contactosActualizados, erroresJson, ejecutadoPor)
        OUTPUT INSERTED.id
        VALUES (@archivoNombre, @totalFilas, @filasValidas, @empresasCreadas, @empresasActualizadas,
                @contactosCreados, @contactosActualizados, @erroresJson, @ejecutadoPor)
      `);
    const id = (result.recordset as EmpresaIdRow[])[0]?.id;
    if (id === undefined) throw new Error('INSERT de CRM_Importaciones no devolvió id');
    return id;
  }

  /** Fresh RUC: land the full aggregate with the validated principal flags. */
  private async crearEmpresa(
    tx: mssql.Transaction,
    grupo: GrupoEmpresaImportado,
    usuario: string,
  ): Promise<ResultadoGrupoImport> {
    // The raw RUC formatting is not preserved by grouping — the
    // normalized key IS the RUC the file carried.
    const inserted = await tx
      .request()
      .input('ruc', mssql.NVarChar(30), grupo.ruc)
      .input('rucNormalizado', mssql.VarChar(30), grupo.ruc)
      .input('razonSocial', mssql.NVarChar(200), grupo.razonSocial)
      .input('tipo', mssql.VarChar(10), grupo.tipo)
      .input('origen', mssql.VarChar(10), grupo.origen ?? null)
      .input('proyectoObra', mssql.NVarChar(200), grupo.proyectoObra ?? null)
      .input('destinoComun', mssql.NVarChar(200), grupo.destinoComun ?? null)
      .input('notas', mssql.NVarChar(mssql.MAX), grupo.notas ?? null)
      .input('responsable', mssql.NVarChar(200), grupo.responsable ?? null)
      .input('createdBy', mssql.NVarChar(200), usuario).query(`
        INSERT INTO dbo.CRM_Empresas
          (ruc, rucNormalizado, razonSocial, tipo, origen, proyectoObra, destinoComun, notas, responsable, createdBy)
        OUTPUT INSERTED.id
        VALUES (@ruc, @rucNormalizado, @razonSocial, @tipo, @origen, @proyectoObra, @destinoComun, @notas, @responsable, @createdBy)
      `);
    const empresaId = (inserted.recordset as EmpresaIdRow[])[0]?.id;
    if (empresaId === undefined) throw new Error('INSERT de CRM_Empresas no devolvió id');

    for (const contacto of grupo.contactos) {
      await this.insertarContacto(tx, empresaId, contacto, contacto.esPrincipal);
    }

    return { modo: 'crear', contactosCreados: grupo.contactos.length, contactosActualizados: 0, advertencias: [] };
  }

  /** Existing RUC: refresh empresa fields and apply the D1 merge plan. */
  private async actualizarEmpresa(
    tx: mssql.Transaction,
    empresaId: number,
    grupo: GrupoEmpresaImportado,
    usuario: string,
  ): Promise<ResultadoGrupoImport> {
    // `responsable` intentionally omitted — see the class JSDoc.
    await tx
      .request()
      .input('id', mssql.Int, empresaId)
      .input('razonSocial', mssql.NVarChar(200), grupo.razonSocial)
      .input('tipo', mssql.VarChar(10), grupo.tipo)
      .input('origen', mssql.VarChar(10), grupo.origen ?? null)
      .input('proyectoObra', mssql.NVarChar(200), grupo.proyectoObra ?? null)
      .input('destinoComun', mssql.NVarChar(200), grupo.destinoComun ?? null)
      .input('notas', mssql.NVarChar(mssql.MAX), grupo.notas ?? null)
      .input('updatedBy', mssql.NVarChar(200), usuario).query(`
        UPDATE dbo.CRM_Empresas
        SET razonSocial = @razonSocial, tipo = @tipo, origen = @origen, proyectoObra = @proyectoObra,
            destinoComun = @destinoComun, notas = @notas, updatedBy = @updatedBy, updatedAt = SYSDATETIME()
        WHERE id = @id
      `);

    const existentes = await this.cargarContactos(tx, empresaId);
    const plan = planificarMergeContactos(existentes, grupo.contactos, grupo.filas[0] ?? 0);

    for (const actualizacion of plan.actualizaciones) {
      await tx
        .request()
        .input('id', mssql.Int, actualizacion.contactoId)
        .input('telefono', mssql.VarChar(30), actualizacion.telefono)
        .query(
          'UPDATE dbo.CRM_Contactos SET telefono = @telefono, updatedAt = SYSDATETIME() WHERE id = @id',
        );
      for (const correo of actualizacion.correosNuevos) {
        await this.insertarCorreo(tx, actualizacion.contactoId, correo);
      }
    }

    for (const creacion of plan.creaciones) {
      // esPrincipal forced false in update mode: the existing principal
      // is preserved (see class JSDoc).
      await this.insertarContacto(tx, empresaId, creacion, false);
    }

    return {
      modo: 'actualizar',
      contactosCreados: plan.creaciones.length,
      contactosActualizados: plan.actualizaciones.length,
      advertencias: plan.advertencias,
    };
  }

  /** Existing contactos of ONE empresa with their stored correos (D1 scope). */
  private async cargarContactos(
    tx: mssql.Transaction,
    empresaId: number,
  ): Promise<ContactoExistenteMerge[]> {
    const result = await tx
      .request()
      .input('empresaId', mssql.Int, empresaId).query(`
        SELECT c.id, c.nombre, c.nombreNormalizado, c.telefono, cr.correo
        FROM dbo.CRM_Contactos c
        LEFT JOIN dbo.CRM_Correos cr ON cr.contactoId = c.id
        WHERE c.empresaId = @empresaId
        ORDER BY c.id, cr.id
      `);

    const porId = new Map<number, ContactoExistenteMerge>();
    for (const row of result.recordset as ContactoConCorreosRow[]) {
      let contacto = porId.get(row.id);
      if (!contacto) {
        contacto = {
          id: row.id,
          nombre: row.nombre,
          nombreNormalizado: row.nombreNormalizado,
          telefono: row.telefono,
          correos: [],
        };
        porId.set(row.id, contacto);
      }
      if (row.correo !== null) contacto.correos.push(row.correo);
    }
    return [...porId.values()];
  }

  private async insertarContacto(
    tx: mssql.Transaction,
    empresaId: number,
    contacto: ContactoAInsertar,
    esPrincipal: boolean,
  ): Promise<number> {
    const inserted = await tx
      .request()
      .input('empresaId', mssql.Int, empresaId)
      .input('nombre', mssql.NVarChar(200), contacto.nombre)
      .input('nombreNormalizado', mssql.VarChar(200), normalizarNombre(contacto.nombre))
      .input('telefono', mssql.VarChar(30), contacto.telefono ?? null)
      .input('esPrincipal', mssql.Bit, esPrincipal).query(`
        INSERT INTO dbo.CRM_Contactos (empresaId, nombre, nombreNormalizado, telefono, esPrincipal)
        OUTPUT INSERTED.id
        VALUES (@empresaId, @nombre, @nombreNormalizado, @telefono, @esPrincipal)
      `);
    const contactoId = (inserted.recordset as EmpresaIdRow[])[0]?.id;
    if (contactoId === undefined) throw new Error('INSERT de CRM_Contactos no devolvió id');

    const seen = new Set<string>();
    for (const raw of contacto.correos) {
      const correo = normalizarCorreo(raw);
      if (correo === '' || seen.has(correo)) continue; // union semantics (UQ backstop)
      seen.add(correo);
      await this.insertarCorreo(tx, contactoId, correo);
    }
    return contactoId;
  }

  private async insertarCorreo(tx: mssql.Transaction, contactoId: number, correo: string): Promise<void> {
    await tx
      .request()
      .input('contactoId', mssql.Int, contactoId)
      .input('correo', mssql.VarChar(320), correo)
      .query('INSERT INTO dbo.CRM_Correos (contactoId, correo) VALUES (@contactoId, @correo)');
  }
}
