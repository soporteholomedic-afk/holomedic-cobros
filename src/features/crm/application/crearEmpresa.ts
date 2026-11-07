import type { ICrmEmpresaRepository } from '../domain/ports';
import { RELACIONES, type CrearEmpresaDatos, type Empresa, type Relacion } from '../domain/entities';
import { DatosEmpresaInvalidosError } from '../domain/errors';
import { validarDatosEmpresa } from './validar';

/**
 * Create the permanent empresa ficha ONLY (S7.1): it never creates an
 * oportunidad. The ficha starts as Prospecto unless the caller says
 * otherwise; the commercial relationship is set here and never derived from
 * an oportunidad result.
 */
export class CrearEmpresaUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(datos: CrearEmpresaDatos, opciones: { relacion?: string } = {}): Promise<Empresa> {
    let relacion: Relacion = 'prospecto';
    if (opciones.relacion !== undefined && opciones.relacion !== null && opciones.relacion !== '') {
      if (!(RELACIONES as readonly string[]).includes(opciones.relacion)) {
        throw new DatosEmpresaInvalidosError('La relación debe ser Prospecto o Cliente');
      }
      relacion = opciones.relacion as Relacion;
    }
    const validos = await validarDatosEmpresa(datos, this.repo);
    return this.repo.create({ ...validos, relacion });
  }
}
