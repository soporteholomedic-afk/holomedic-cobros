import type { DatosSunat } from '../domain/entities';
import type { IConsultaRucServicio } from '../domain/ports';
import { validarRuc } from './validar';

/**
 * SUNAT lookup by RUC for the alta form and the "Falta RUC" card
 * (crm-consulta-sunat T4, S1/S5). The RUC is validated FIRST: an
 * invalid one fails fast with the standard 400 path and never reaches
 * apifacturacion (a paid service) nor the config read. The servicio
 * errors (no configurado → 503, no encontrado → 404, servicio caído →
 * 502) propagate unchanged for the route to map.
 */
export class ConsultarRucUseCase {
  constructor(private readonly servicio: IConsultaRucServicio) {}

  async execute(ruc: string): Promise<DatosSunat> {
    const valido = validarRuc(ruc);
    return this.servicio.consultar(valido);
  }
}
