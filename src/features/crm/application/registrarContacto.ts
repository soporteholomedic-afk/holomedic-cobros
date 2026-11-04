import type { ICrmEmpresaRepository } from '../domain/ports';
import {
  DIRECCIONES,
  RESULTADOS,
  type Direccion,
  type Empresa,
  type Interaccion,
  type NuevaInteraccion,
  type Resultado,
  type SeguimientoEmpresa,
} from '../domain/entities';
import { DatosEmpresaInvalidosError, EmpresaNotFoundError } from '../domain/errors';
import { validarMedioContacto, validarProximaAccion, validarResumen } from './validar';

/** Raw contact data as received from the API (not yet validated). */
export interface RegistrarContactoDatos {
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

/** What the transition reads from the empresa (a card that does not exist yet can be described too). */
export type EstadoPrevio = Pick<
  Empresa,
  'etapa' | 'motivo' | 'intentosSinRespuesta' | 'faltaResponderDesde' | 'sugerenciaDescartadaEn'
>;

export interface ContactoCalculado {
  seguimiento: SeguimientoEmpresa;
  interaccion: NuevaInteraccion;
}

/**
 * Validate a contact and compute the new follow-up state and the interaction
 * to store (L8). Pure: it reads nothing and writes nothing, so callers can run
 * it BEFORE their first write and a rejected input stores nothing.
 */
export function calcularContacto(
  previo: EstadoPrevio,
  datos: RegistrarContactoDatos,
  usuario: UsuarioSesion,
  hoy: string,
  now: Date,
): ContactoCalculado {
  if (previo.etapa === 'perdido') {
    throw new DatosEmpresaInvalidosError('No se puede registrar un contacto en una empresa en Perdido.');
  }
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

  const etapa = previo.etapa === 'por_contactar' ? 'contactado' : previo.etapa;
  const proximaAccion = validarProximaAccion(datos.proximaAccion, {
    requerida: etapa !== 'cliente',
    hoy,
  });

  const fallido = resultado === 'no_contesto' || resultado === 'deje_mensaje';
  const seguimiento: SeguimientoEmpresa = {
    etapa,
    medio,
    medioOtro,
    motivo: previo.motivo,
    intentosSinRespuesta: fallido ? previo.intentosSinRespuesta + 1 : 0,
    // A failed attempt leaves a pending reply alone; every other result sets or clears it.
    faltaResponderDesde: fallido
      ? previo.faltaResponderDesde
      : resultado === 'pendiente'
        ? now.toISOString()
        : null,
    proximaAccion,
    // Only a failed attempt keeps the dismissed suggestion: it shows again after one more.
    sugerenciaDescartadaEn: fallido ? previo.sugerenciaDescartadaEn : null,
  };
  const interaccion: NuevaInteraccion = {
    idUsuario: usuario.sub,
    nombreUsuario: usuario.nombre,
    direccion,
    medio,
    medioOtro,
    resultado,
    resumen,
  };
  return { seguimiento, interaccion };
}

/**
 * Register one contact on an existing card: we reached out (conversamos / no
 * contestó / dejé mensaje) or they did (respondido / pendiente). The new
 * state and the history entry go through ONE `updateSeguimiento` call, so
 * both exist or neither does. Validation runs before it: a rejected input
 * stores nothing. Perdido cards are rejected.
 */
export class RegistrarContactoUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(
    idEmpresa: string,
    datos: RegistrarContactoDatos,
    usuario: UsuarioSesion,
    hoy: string,
    now: Date = new Date(),
  ): Promise<{ empresa: Empresa; interaccion: Interaccion }> {
    const actual = await this.repo.getById(idEmpresa);
    if (!actual) throw new EmpresaNotFoundError(idEmpresa);
    const { seguimiento, interaccion } = calcularContacto(actual, datos, usuario, hoy, now);
    const empresa = await this.repo.updateSeguimiento(idEmpresa, seguimiento, interaccion);
    return { empresa, interaccion: await this.entradaGuardada(idEmpresa) };
  }

  /** The row just stored (the newest of the history), read back so the caller gets its id and timestamp. */
  private async entradaGuardada(idEmpresa: string): Promise<Interaccion> {
    const [reciente] = await this.repo.listInteracciones(idEmpresa);
    if (!reciente) throw new Error(`Interacción not readable right after insert for ${idEmpresa}`);
    return reciente;
  }
}
