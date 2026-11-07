import { ETAPAS_OPORTUNIDAD, type EtapaOportunidad, type Oportunidad } from '../domain/entities';
import { EmpresaNotFoundError, EtapaInvalidaError } from '../domain/errors';
import type { ICrmEmpresaRepository, ICrmOportunidadRepository } from '../domain/ports';
import { validarDatosOportunidad, validarMedioContacto } from './validar';

/** Raw create form data as received from the API (not yet validated). */
export interface CrearOportunidadDatos {
  nombre: string;
  servicio?: string | null;
  responsableId?: string | null;
  responsableNombre?: string | null;
  origen?: string | null;
  montoEstimado?: unknown;
  /** Initial stage; defaults to Por contactar. */
  etapa?: string | null;
  medio?: string | null;
  medioOtro?: string | null;
}

/**
 * Create one commercial deal of an EXISTING empresa (S1/S4): the ficha is
 * never duplicated and its relacion is never touched — a client asking for
 * another service gets a new oportunidad, not a new empresa (S6.1, S5.2).
 * Validation runs before the existence check and both before the write, so a
 * rejected input stores nothing.
 */
export class CrearOportunidadUseCase {
  constructor(
    private readonly empresas: ICrmEmpresaRepository,
    private readonly oportunidades: ICrmOportunidadRepository,
  ) {}

  async execute(idEmpresa: string, datos: CrearOportunidadDatos): Promise<Oportunidad> {
    const base = validarDatosOportunidad(datos);
    const etapaTexto = datos.etapa === undefined || datos.etapa === null || datos.etapa === '' ? 'por_contactar' : datos.etapa;
    if (typeof etapaTexto !== 'string' || !(ETAPAS_OPORTUNIDAD as readonly string[]).includes(etapaTexto)) {
      throw new EtapaInvalidaError(String(etapaTexto));
    }
    const etapa = etapaTexto as EtapaOportunidad;
    // A deal that starts past Por contactar already had a first contact, so it
    // needs its medium; Por contactar has none yet and ignores whatever arrives.
    const { medio, medioOtro } =
      etapa === 'por_contactar' ? { medio: null, medioOtro: null } : validarMedioContacto(datos.medio, datos.medioOtro);
    if (!(await this.empresas.getById(idEmpresa))) throw new EmpresaNotFoundError(idEmpresa);
    return this.oportunidades.create(idEmpresa, { ...base, etapa, medio, medioOtro });
  }
}
