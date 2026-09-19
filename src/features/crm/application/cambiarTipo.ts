import type { TipoEmpresa } from '../domain/entities';
import { NotFoundError, ValidationError } from '../domain/errors';
import { fechaHoy } from '../domain/cadence';
import type { Clock, CrmEmpresaRepositoryPort, CrmPipelineRepositoryPort } from '../domain/ports';

export interface CambiarTipoInput {
  empresaId: number;
  nuevoTipo: TipoEmpresa;
  usuario: string;
}

export interface ResultadoCambiarTipo {
  tipo: TipoEmpresa;
  /** true → the adapter also writes the ConversiónProspectoACliente row. */
  conversion: boolean;
}

const TIPOS: readonly TipoEmpresa[] = ['Cliente', 'Prospecto'];

/**
 * CambiarTipoUseCase — T16 (design D3/D4, spec G6 scenario): the
 * Prospecto→Cliente conversion is a TIPO update, not a pipeline stage
 * change, so it never touches the pipeline row nor CRM_Transiciones.
 * The result event fires ONLY on Prospecto→Cliente — the design's
 * 6-event catalog has no "demotion" event, so Cliente→Prospecto is a
 * silent tipo update. The adapter (SqlServerPipelineRepository
 * .cambiarTipo) writes the tipo + optional result row in ONE
 * transaction; this use case owns the direction decision and the
 * no-op guard.
 */
export class CambiarTipoUseCase {
  constructor(
    private readonly empresas: CrmEmpresaRepositoryPort,
    private readonly pipelines: CrmPipelineRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(input: CambiarTipoInput): Promise<ResultadoCambiarTipo> {
    if (!TIPOS.includes(input.nuevoTipo)) {
      throw new ValidationError('El tipo debe ser Cliente o Prospecto');
    }

    const empresa = await this.empresas.obtenerPorId(input.empresaId);
    if (!empresa) {
      throw new NotFoundError('Empresa no encontrada');
    }
    if (empresa.tipo === input.nuevoTipo) {
      throw new ValidationError(`La empresa ya es ${input.nuevoTipo}`);
    }

    const conversion = empresa.tipo === 'Prospecto' && input.nuevoTipo === 'Cliente';
    await this.pipelines.cambiarTipo({
      empresaId: input.empresaId,
      nuevoTipo: input.nuevoTipo,
      usuario: input.usuario,
      hoy: fechaHoy(this.clock),
      convertir: conversion,
    });

    return { tipo: input.nuevoTipo, conversion };
  }
}
