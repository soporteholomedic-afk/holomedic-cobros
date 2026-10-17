import * as mssql from 'mssql';

import type { AuditoriaConfigCrm, EntradaConfigCrm } from '../../domain/entities';
import type {
  CambioConfig,
  ConfigCrmRepository,
  EliminarConfigInput,
  GuardarConfigInput,
  ListarAuditoriaConfigInput,
} from '../../domain/ports';

import { withCrmTransaction } from './withCrmTransaction';

/**
 * SQL Server adapter for the platform-configuration port
 * (agente-ia-crm E5·T2). Thin persister over CRM_Config +
 * CRM_ConfigAuditoria: encryption is the caller's job, so a secret row
 * arrives here already as ciphertext. What THIS layer guarantees:
 * - every write and its audit row share ONE transaction (no change
 *   without a trail, no trail without a change);
 * - secret values NEVER reach the audit trail — for `esSecreto` rows
 *   valorAnterior/valorNuevo are stored NULL (only the fact of the
 *   change is recorded);
 * - `listar` matches the prefix literally (LIKE wildcards escaped).
 */

const CLAVE_MAX_CARACTERES = 100;
const VALOR_MAX_CARACTERES = 2000;
const LIMITE_AUDITORIA_POR_DEFECTO = 50;
const LIMITE_AUDITORIA_MAXIMO = 200;

interface ConfigRow {
  clave: string;
  valor: string;
  esSecreto: boolean;
  actualizadoPor: string;
  actualizadoEn: Date;
}

interface AuditoriaRow {
  id: number | string;
  clave: string;
  usuario: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  esSecreto: boolean;
  creadoEn: Date;
}

function mapearConfig(row: ConfigRow): EntradaConfigCrm {
  return {
    clave: row.clave,
    valor: row.valor,
    esSecreto: Boolean(row.esSecreto),
    actualizadoPor: row.actualizadoPor,
    actualizadoEn: row.actualizadoEn,
  };
}

function mapearAuditoria(row: AuditoriaRow): AuditoriaConfigCrm {
  return {
    id: Number(row.id),
    clave: row.clave,
    usuario: row.usuario,
    valorAnterior: row.valorAnterior,
    valorNuevo: row.valorNuevo,
    esSecreto: Boolean(row.esSecreto),
    creadoEn: row.creadoEn,
  };
}

/** Escape LIKE metacharacters so a prefix is matched literally. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_[]/g, (caracter) => `\\${caracter}`);
}

function normalizarClave(clave: string): string {
  const limpia = clave.trim();
  if (limpia.length === 0) {
    throw new Error('La clave de configuración no puede estar vacía.');
  }
  if (limpia.length > CLAVE_MAX_CARACTERES) {
    throw new Error(`La clave de configuración supera ${CLAVE_MAX_CARACTERES} caracteres.`);
  }
  return limpia;
}

function acotarLimite(limite: number | undefined): number {
  if (limite === undefined || !Number.isFinite(limite)) return LIMITE_AUDITORIA_POR_DEFECTO;
  return Math.min(Math.max(Math.trunc(limite), 1), LIMITE_AUDITORIA_MAXIMO);
}

export class SqlServerConfigRepository implements ConfigCrmRepository {
  constructor(private readonly pool: mssql.ConnectionPool) {}

  async obtener(clave: string): Promise<EntradaConfigCrm | null> {
    const result = await this.pool
      .request()
      .input('clave', mssql.NVarChar(CLAVE_MAX_CARACTERES), clave)
      .query<ConfigRow>(
        `SELECT clave, valor, esSecreto, actualizadoPor, actualizadoEn
           FROM dbo.CRM_Config WHERE clave = @clave`,
      );
    const row = result.recordset[0];
    return row ? mapearConfig(row) : null;
  }

  async listar(prefijo: string): Promise<EntradaConfigCrm[]> {
    const result = await this.pool
      .request()
      .input('patron', mssql.NVarChar(CLAVE_MAX_CARACTERES * 2), `${escaparLike(prefijo)}%`)
      .query<ConfigRow>(
        `SELECT clave, valor, esSecreto, actualizadoPor, actualizadoEn
           FROM dbo.CRM_Config
          WHERE clave LIKE @patron ESCAPE '\\'
          ORDER BY clave`,
      );
    return result.recordset.map(mapearConfig);
  }

  async guardar(input: GuardarConfigInput): Promise<void> {
    await this.guardarVarios(
      [{ clave: input.clave, valor: input.valor, esSecreto: input.esSecreto }],
      input.usuario,
    );
  }

  async guardarVarios(cambios: CambioConfig[], usuario: string): Promise<void> {
    // Validate EVERYTHING before opening the transaction: a bad entry
    // never leaves a partial write behind.
    const normalizados = cambios.map((cambio) => {
      const clave = normalizarClave(cambio.clave);
      if (cambio.valor.length > VALOR_MAX_CARACTERES) {
        throw new Error(`El valor de configuración supera ${VALOR_MAX_CARACTERES} caracteres.`);
      }
      return { clave, valor: cambio.valor, esSecreto: cambio.esSecreto };
    });
    if (normalizados.length === 0) return;

    await withCrmTransaction(this.pool, async (tx) => {
      for (const cambio of normalizados) {
        await this.upsertar(tx, cambio, usuario);
      }
    });
  }

  async eliminar(input: EliminarConfigInput): Promise<void> {
    const clave = normalizarClave(input.clave);

    await withCrmTransaction(this.pool, async (tx) => {
      const previa = await new mssql.Request(tx)
        .input('clave', mssql.NVarChar(CLAVE_MAX_CARACTERES), clave)
        .query<{ valor: string; esSecreto: boolean }>(
          `SELECT valor, esSecreto FROM dbo.CRM_Config WITH (UPDLOCK, HOLDLOCK)
            WHERE clave = @clave`,
        );
      const existente = previa.recordset[0];
      if (!existente) return;

      await new mssql.Request(tx)
        .input('clave', mssql.NVarChar(CLAVE_MAX_CARACTERES), clave)
        .query('DELETE FROM dbo.CRM_Config WHERE clave = @clave');

      await this.auditar(tx, {
        clave,
        usuario: input.usuario,
        esSecreto: Boolean(existente.esSecreto),
        valorAnterior: existente.valor,
        valorNuevo: null,
      });
    });
  }

  async listarAuditoria(input: ListarAuditoriaConfigInput = {}): Promise<AuditoriaConfigCrm[]> {
    const request = this.pool
      .request()
      .input('limite', mssql.Int, acotarLimite(input.limite));
    const condiciones: string[] = [];
    if (input.clave !== undefined) {
      request.input('clave', mssql.NVarChar(CLAVE_MAX_CARACTERES), input.clave);
      condiciones.push('clave = @clave');
    }
    if (input.prefijo !== undefined && input.prefijo !== '') {
      request.input(
        'patron',
        mssql.NVarChar(CLAVE_MAX_CARACTERES * 2),
        `${escaparLike(input.prefijo)}%`,
      );
      condiciones.push("clave LIKE @patron ESCAPE '\\'");
    }
    const filtro = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const result = await request.query<AuditoriaRow>(
      `SELECT TOP (@limite) id, clave, usuario, valorAnterior, valorNuevo, esSecreto, creadoEn
         FROM dbo.CRM_ConfigAuditoria
         ${filtro}
        ORDER BY id DESC`,
    );
    return result.recordset.map(mapearAuditoria);
  }

  /** Upsert one row + its audit row inside the caller's transaction. */
  private async upsertar(
    tx: mssql.Transaction,
    cambio: CambioConfig,
    usuario: string,
  ): Promise<void> {
    // UPDLOCK/HOLDLOCK: the previous value read and the upsert are one
    // atomic unit, so the audit row's valorAnterior is never stale.
    const previa = await new mssql.Request(tx)
      .input('clave', mssql.NVarChar(CLAVE_MAX_CARACTERES), cambio.clave)
      .query<{ valor: string }>(
        'SELECT valor FROM dbo.CRM_Config WITH (UPDLOCK, HOLDLOCK) WHERE clave = @clave',
      );
    const existente = previa.recordset[0];

    await new mssql.Request(tx)
      .input('clave', mssql.NVarChar(CLAVE_MAX_CARACTERES), cambio.clave)
      .input('valor', mssql.NVarChar(VALOR_MAX_CARACTERES), cambio.valor)
      .input('esSecreto', mssql.Bit, cambio.esSecreto)
      .input('usuario', mssql.NVarChar(200), usuario)
      .query(
        existente
          ? `UPDATE dbo.CRM_Config
                SET valor = @valor, esSecreto = @esSecreto,
                    actualizadoPor = @usuario, actualizadoEn = SYSDATETIME()
              WHERE clave = @clave`
          : `INSERT INTO dbo.CRM_Config (clave, valor, esSecreto, actualizadoPor)
                VALUES (@clave, @valor, @esSecreto, @usuario)`,
      );

    await this.auditar(tx, {
      clave: cambio.clave,
      usuario,
      esSecreto: cambio.esSecreto,
      valorAnterior: existente ? existente.valor : null,
      valorNuevo: cambio.valor,
    });
  }

  /** Append one trail row inside the caller's transaction. Secrets never store values. */
  private async auditar(
    tx: mssql.Transaction,
    fila: {
      clave: string;
      usuario: string;
      esSecreto: boolean;
      valorAnterior: string | null;
      valorNuevo: string | null;
    },
  ): Promise<void> {
    await new mssql.Request(tx)
      .input('clave', mssql.NVarChar(CLAVE_MAX_CARACTERES), fila.clave)
      .input('usuario', mssql.NVarChar(200), fila.usuario)
      .input('valorAnterior', mssql.NVarChar(VALOR_MAX_CARACTERES), fila.esSecreto ? null : fila.valorAnterior)
      .input('valorNuevo', mssql.NVarChar(VALOR_MAX_CARACTERES), fila.esSecreto ? null : fila.valorNuevo)
      .input('esSecreto', mssql.Bit, fila.esSecreto)
      .query(
        `INSERT INTO dbo.CRM_ConfigAuditoria (clave, usuario, valorAnterior, valorNuevo, esSecreto)
              VALUES (@clave, @usuario, @valorAnterior, @valorNuevo, @esSecreto)`,
      );
  }
}
