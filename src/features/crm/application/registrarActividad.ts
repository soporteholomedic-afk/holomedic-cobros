import {
  DIRECCIONES,
  ETAPAS_CERRADAS,
  RESULTADOS,
  type Direccion,
  type Empresa,
  type Interaccion,
  type Medio,
  type NuevaInteraccion,
  type Oportunidad,
  type Resultado,
  type SeguimientoOportunidad,
} from '../domain/entities';
import {
  DatosEmpresaInvalidosError,
  EmpresaNotFoundError,
  OportunidadDeOtraEmpresaError,
  OportunidadNotFoundError,
} from '../domain/errors';
import type { ICrmEmpresaRepository, ICrmOportunidadRepository } from '../domain/ports';
import { validarMedioContacto, validarProximaAccion, validarResumen } from './validar';

/** Raw activity data as received from the API (not yet validated). */
export interface RegistrarActividadDatos {
  direccion: string;
  medio: string;
  medioOtro?: string | null;
  resultado: string;
  resumen?: string | null;
  /** Raw next action; `null`/`undefined` means "Sin próxima acción" where allowed. */
  proximaAccion?: unknown;
}

export interface UsuarioSesion {
  sub: string;
  nombre: string;
}

/** Results each direction can have (L8). */
const RESULTADOS_POR_DIRECCION: Record<Direccion, readonly Resultado[]> = {
  saliente: ['conversamos', 'no_contesto', 'deje_mensaje'],
  entrante: ['pendiente', 'respondido'],
};

/** What the transition reads from the oportunidad. */
export type EstadoPrevio = Pick<
  Oportunidad,
  'etapa' | 'medio' | 'medioOtro' | 'motivo' | 'intentosSinRespuesta' | 'faltaResponderDesde' | 'sugerenciaDescartadaEn'
>;

export interface ActividadCalculada {
  seguimiento: SeguimientoOportunidad;
  /** The activity without its `idOportunidad`: the caller fills it on write. */
  interaccion: Omit<NuevaInteraccion, 'idOportunidad'>;
}

/**
 * Validate the common fields of an activity (either kind) and answer them.
 * Pure: it reads nothing and writes nothing, so callers can run it BEFORE
 * their first write and a rejected input stores nothing.
 */
function validarActividad(
  datos: RegistrarActividadDatos,
  usuario: UsuarioSesion,
): { direccion: Direccion; medio: Medio; medioOtro: string | null; resultado: Resultado; resumen: string | null } {
  if (typeof datos.direccion !== 'string' || !(DIRECCIONES as readonly string[]).includes(datos.direccion)) {
    throw new DatosEmpresaInvalidosError('Elige si contactamos nosotros o nos contactaron.');
  }
  const direccion = datos.direccion as Direccion;
  if (typeof datos.resultado !== 'string' || !(RESULTADOS as readonly string[]).includes(datos.resultado)) {
    throw new DatosEmpresaInvalidosError('Elige el resultado del contacto.');
  }
  const resultado = datos.resultado as Resultado;
  if (!RESULTADOS_POR_DIRECCION[direccion].includes(resultado)) {
    throw new DatosEmpresaInvalidosError('El resultado no corresponde a la dirección del contacto.');
  }
  const { medio, medioOtro } = validarMedioContacto(datos.medio, datos.medioOtro);
  const conversacion = resultado === 'conversamos' || resultado === 'respondido';
  const resumen = validarResumen(datos.resumen, conversacion);
  return { direccion, medio, medioOtro, resultado, resumen };
}

/**
 * Validate an activity linked to one oportunidad and compute its new
 * follow-up state (S1/S4). Pure: it reads nothing and writes nothing, so
 * callers can run it BEFORE their first write and a rejected input stores
 * nothing. Perdida deals are rejected — a lost deal keeps its history and any
 * new negotiation is a NEW oportunidad (S6.8).
 */
export function calcularActividad(
  previo: EstadoPrevio,
  datos: RegistrarActividadDatos,
  usuario: UsuarioSesion,
  hoy: string,
  now: Date,
): ActividadCalculada {
  if (previo.etapa === 'perdida') {
    throw new DatosEmpresaInvalidosError('No se puede registrar una actividad en una oportunidad en Perdida.');
  }
  const base = validarActividad(datos, usuario);
  const etapa = previo.etapa === 'por_contactar' ? 'contactado' : previo.etapa;
  const abierta = !ETAPAS_CERRADAS.includes(etapa);
  const proximaAccion = validarProximaAccion(datos.proximaAccion, { requerida: abierta, hoy });

  const fallido = base.resultado === 'no_contesto' || base.resultado === 'deje_mensaje';
  const seguimiento: SeguimientoOportunidad = {
    etapa,
    medio: base.medio,
    medioOtro: base.medioOtro,
    motivo: previo.motivo,
    intentosSinRespuesta: fallido ? previo.intentosSinRespuesta + 1 : 0,
    // A failed attempt leaves a pending reply alone; every other result sets or clears it.
    faltaResponderDesde: fallido
      ? previo.faltaResponderDesde
      : base.resultado === 'pendiente'
        ? now.toISOString()
        : null,
    proximaAccion,
    // Only a failed attempt keeps the dismissed suggestion: it shows again after one more.
    sugerenciaDescartadaEn: fallido ? previo.sugerenciaDescartadaEn : null,
  };
  const interaccion: Omit<NuevaInteraccion, 'idOportunidad'> = {
    idUsuario: usuario.sub,
    nombreUsuario: usuario.nombre,
    direccion: base.direccion,
    medio: base.medio,
    medioOtro: base.medioOtro,
    resultado: base.resultado,
    resumen: base.resumen,
  };
  return { seguimiento, interaccion };
}

export interface ResultadoActividad {
  /** The empresa of the activity (its history holds the row). */
  empresa: Empresa;
  /** The deal advanced, or `null` for a general activity (S6.4). */
  oportunidad: Oportunidad | null;
  /** The row just stored, with its id, timestamp and `idOportunidad` link. */
  interaccion: Interaccion;
}

/**
 * Register one activity (llamada, correo, WhatsApp...) — called "Registrar
 * actividad", the old "Registrar contacto" (S4). The caller says whether it
 * belongs to a specific oportunidad:
 * - With `idOportunidad`: the deal must exist AND belong to `idEmpresa`
 *   (OportunidadDeOtraEmpresaError otherwise). The SAME state machine as
 *   before runs, relative to the deal, and state + history entry go through
 *   ONE `updateSeguimiento` call, so both exist or neither does.
 * - With `null`: a general activity — pure `addInteraccion` on the empresa
 *   history, no deal is required or advanced, and no next action is asked
 *   for (S6.4: "Si la llamada es general... se registra solamente en el
 *   historial de la empresa").
 * Validation runs before any write: a rejected input stores nothing.
 */
export class RegistrarActividadUseCase {
  constructor(
    private readonly empresas: ICrmEmpresaRepository,
    private readonly oportunidades: ICrmOportunidadRepository,
  ) {}

  async execute(
    idEmpresa: string,
    idOportunidad: string | null,
    datos: RegistrarActividadDatos,
    usuario: UsuarioSesion,
    hoy: string,
    now: Date = new Date(),
  ): Promise<ResultadoActividad> {
    if (idOportunidad === null) return this.registrarGeneral(idEmpresa, datos, usuario);

    const actual = await this.oportunidades.getById(idOportunidad);
    if (!actual) throw new OportunidadNotFoundError(idOportunidad);
    if (actual.idEmpresa !== idEmpresa) throw new OportunidadDeOtraEmpresaError(idOportunidad, idEmpresa);
    const empresa = await this.empresas.getById(idEmpresa);
    if (!empresa) throw new EmpresaNotFoundError(idEmpresa);

    const { seguimiento, interaccion } = calcularActividad(actual, datos, usuario, hoy, now);
    const oportunidad = await this.oportunidades.updateSeguimiento(idOportunidad, seguimiento, {
      ...interaccion,
      idOportunidad,
    });
    return { empresa, oportunidad, interaccion: await this.entradaGuardada(idEmpresa) };
  }

  /** A general activity: history only, nothing else written, no next action required. */
  private async registrarGeneral(
    idEmpresa: string,
    datos: RegistrarActividadDatos,
    usuario: UsuarioSesion,
  ): Promise<ResultadoActividad> {
    const empresa = await this.empresas.getById(idEmpresa);
    if (!empresa) throw new EmpresaNotFoundError(idEmpresa);
    const base = validarActividad(datos, usuario);
    const interaccion = await this.empresas.addInteraccion(idEmpresa, {
      idUsuario: usuario.sub,
      nombreUsuario: usuario.nombre,
      direccion: base.direccion,
      medio: base.medio,
      medioOtro: base.medioOtro,
      resultado: base.resultado,
      resumen: base.resumen,
      idOportunidad: null,
    });
    return { empresa, oportunidad: null, interaccion };
  }

  /** The row just stored (the newest of the history), read back so the caller gets its id and timestamp. */
  private async entradaGuardada(idEmpresa: string): Promise<Interaccion> {
    const [reciente] = await this.empresas.listInteracciones(idEmpresa);
    if (!reciente) throw new Error(`Interacción not readable right after insert for ${idEmpresa}`);
    return reciente;
  }
}
