import type { Empresa, Oportunidad, SeguimientoOportunidad } from '../domain/entities';
import { DatosEmpresaInvalidosError } from '../domain/errors';
import type { ICrmEmpresaRepository, ICrmOportunidadRepository } from '../domain/ports';
import { MAX_NOMBRE_OPORTUNIDAD } from '../domain/entities';
import { isValidCorreo } from '@/features/auth/domain/correo';
import type { UsuarioSesion } from './registrarActividad';
import { opcional, validarMedioContacto, validarOrigen, validarProximaAccion, validarRuc, validarResumen } from './validar';

/** Raw data of the "Nos contactaron" panel (not yet validated). */
export interface RegistrarEntranteDatos {
  razonSocial: string;
  medio: string;
  medioOtro?: string | null;
  persona?: string | null;
  telefono?: string | null;
  correo?: string | null;
  ruc?: string | null;
  /** "¿Qué necesita?", stored as the summary of the first interaction. */
  necesita?: string | null;
  origen?: string | null;
  /** Optional sector name; used only when a new ficha is created, ignored on an existing empresa. */
  sector?: string | null;
  /** Raw next action; required: the inbound contact always opens a deal waiting for our reply. */
  proximaAccion?: unknown;
}

export interface ResultadoEntrante {
  empresa: Empresa;
  /** The primera oportunidad created by this inbound contact. */
  oportunidad: Oportunidad;
  /** `true` when the deal was added to a ficha that already existed. */
  existente: boolean;
}

/** Name key: case-, accent-preserving, whitespace-insensitive. */
const clave = (nombre: string): string => nombre.trim().replace(/\s+/g, ' ').toLowerCase();

/** Deal name of an inbound contact: what they asked for, capped to the column limit. */
const nombreDeOportunidad = (resumen: string | null): string => {
  const base = resumen ?? 'Negocio entrante';
  return base.slice(0, MAX_NOMBRE_OPORTUNIDAD);
};

/**
 * Inbound contact ("Nos contactaron", S4). First look for the empresa: a RUC
 * or a name that already exists receives the NEW oportunidad on its existing
 * ficha (never a duplicated ficha, never a modified relacion — S6.1);
 * otherwise the ficha is created as Prospecto. Either way, this creates the
 * deal in Contactado, waiting for our reply (falta responder), with the
 * linked first activity.
 *
 * Everything is validated before the first write: a rejected input stores
 * nothing. A new empresa takes THREE writes (create ficha, create
 * oportunidad, updateSeguimiento), an existing one TWO: they are NOT atomic;
 * if a later one fails, what was written stands and the error reaches the
 * caller.
 */
export class RegistrarEntranteUseCase {
  constructor(
    private readonly empresas: ICrmEmpresaRepository,
    private readonly oportunidades: ICrmOportunidadRepository,
  ) {}

  async execute(
    datos: RegistrarEntranteDatos,
    usuario: UsuarioSesion,
    hoy: string,
    now: Date = new Date(),
  ): Promise<ResultadoEntrante> {
    const razonSocial = opcional(datos.razonSocial);
    if (razonSocial === null) throw new DatosEmpresaInvalidosError('La razón social es obligatoria');
    const { medio, medioOtro } = validarMedioContacto(datos.medio, datos.medioOtro);
    const persona = opcional(datos.persona);
    const telefono = opcional(datos.telefono);
    const correo = opcional(datos.correo);
    if (telefono === null && correo === null) {
      throw new DatosEmpresaInvalidosError('Escribe un teléfono o un correo.');
    }
    if (telefono !== null && telefono.replace(/\D/g, '').length !== 9) {
      throw new DatosEmpresaInvalidosError('El teléfono debe tener 9 dígitos.');
    }
    if (correo !== null && !isValidCorreo(correo)) {
      throw new DatosEmpresaInvalidosError('El correo no es válido.');
    }
    const rucTxt = opcional(datos.ruc);
    const ruc = rucTxt === null ? null : validarRuc(rucTxt);
    const origen = validarOrigen(datos.origen);
    const resumen = validarResumen(datos.necesita, false);
    const proximaAccion = validarProximaAccion(datos.proximaAccion, { requerida: true, hoy });

    const existente = await this.buscarExistente(razonSocial, ruc);
    // Only a new ficha takes a sector, and it is checked before any write.
    const sector = existente ? null : await this.resolverSector(datos.sector);

    const ficha =
      existente ??
      (await this.empresas.create({
        razonSocial,
        ruc,
        sector,
        contactos: [{ nombre: persona, telefono, correo }],
        notas: null,
        direccion: null,
        relacion: 'prospecto',
      }));

    const oportunidad = await this.oportunidades.create(ficha.idEmpresa, {
      nombre: nombreDeOportunidad(resumen),
      responsableId: null,
      responsableNombre: null,
      origen,
      servicio: null,
      montoEstimado: null,
      etapa: 'contactado',
      medio,
      medioOtro,
    });
    const seguimiento: SeguimientoOportunidad = {
      etapa: 'contactado',
      medio,
      medioOtro,
      motivo: null,
      intentosSinRespuesta: 0,
      faltaResponderDesde: now.toISOString(),
      proximaAccion,
      sugerenciaDescartadaEn: null,
    };
    await this.oportunidades.updateSeguimiento(oportunidad.idOportunidad, seguimiento, {
      idUsuario: usuario.sub,
      nombreUsuario: usuario.nombre,
      direccion: 'entrante',
      medio,
      medioOtro,
      resultado: 'pendiente',
      resumen,
      idOportunidad: oportunidad.idOportunidad,
    });
    return { empresa: ficha, oportunidad: await this.leida(oportunidad.idOportunidad), existente: existente !== null };
  }
  /** Stored spelling of the sector, or `null` when none was given. Unknown → DatosEmpresaInvalidosError. */
  private async resolverSector(texto: string | null | undefined): Promise<string | null> {
    const pedido = opcional(texto);
    if (pedido === null) return null;
    const hallado = (await this.empresas.listSectores()).find((s) => s.nombre.toLowerCase() === pedido.toLowerCase());
    if (!hallado) throw new DatosEmpresaInvalidosError(`Sector desconocido: ${pedido}`);
    return hallado.nombre;
  }

  private async buscarExistente(razonSocial: string, ruc: string | null): Promise<Empresa | null> {
    const porRuc = await this.empresas.findByRuc(ruc);
    if (porRuc) return porRuc;
    const buscada = clave(razonSocial);
    const todas = await this.empresas.list();
    return todas.find((e) => clave(e.razonSocial) === buscada) ?? null;
  }

  /** The oportunidad re-read after the follow-up write, so the caller sees the final state. */
  private async leida(idOportunidad: string): Promise<Oportunidad> {
    const leida = await this.oportunidades.getById(idOportunidad);
    if (!leida) throw new Error(`Oportunidad not readable right after insert: ${idOportunidad}`);
    return leida;
  }
}
