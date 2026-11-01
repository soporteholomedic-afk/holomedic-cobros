import type { ICrmEmpresaRepository } from '../domain/ports';
import type { Empresa } from '../domain/entities';
import { DatosEmpresaInvalidosError } from '../domain/errors';
import { isValidCorreo } from '@/features/auth/domain/correo';
import {
  calcularContacto,
  type EstadoPrevio,
  type UsuarioSesion,
} from './registrarContacto';
import { opcional, validarMedioContacto, validarOrigen, validarRuc } from './validar';

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
  /** Optional sector name; used only when a new card is created, ignored on an existing empresa. */
  sector?: string | null;
  /** Raw next action; required unless the empresa it lands on is a Cliente. */
  proximaAccion?: unknown;
}

export interface ResultadoEntrante {
  empresa: Empresa;
  /** `true` when the contact was added to a card that already existed. */
  existente: boolean;
}

/** Name key: case-, accent-preserving, whitespace-insensitive. */
const clave = (nombre: string): string => nombre.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Inbound contact ("Nos contactaron"). A RUC or a name that already exists adds
 * the contact to that card; otherwise a new card is created directly in
 * Contactado, marked "Falta responder" (L8).
 *
 * Everything is validated before the first write: a rejected input stores
 * nothing. A new card takes TWO writes, `create` and then `updateSeguimiento`
 * (stage, pending reply, next action and the first interaction): the
 * repository cannot create a card with its follow-up state in one step. They
 * are NOT atomic: if the second one fails, the card exists in Contactado
 * without history, and the error reaches the caller.
 */
export class RegistrarEntranteUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(
    datos: RegistrarEntranteDatos,
    usuario: UsuarioSesion,
    hoy: string,
    now: Date = new Date(),
  ): Promise<ResultadoEntrante> {
    const razonSocial = opcional(datos.razonSocial);
    if (razonSocial === null) throw new DatosEmpresaInvalidosError('La razón social es obligatoria');
    validarMedioContacto(datos.medio, datos.medioOtro);
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

    const existente = await this.buscarExistente(razonSocial, ruc);
    // Only a new card takes a sector, and it is checked before any write.
    const sector = existente ? null : await this.resolverSector(datos.sector);
    const previo: EstadoPrevio = existente ?? {
      etapa: 'por_contactar',
      motivo: null,
      intentosSinRespuesta: 0,
      faltaResponderDesde: null,
      sugerenciaDescartadaEn: null,
    };
    const { seguimiento, interaccion } = calcularContacto(
      previo,
      {
        direccion: 'entrante',
        medio: datos.medio,
        medioOtro: datos.medioOtro,
        resultado: 'pendiente',
        resumen: datos.necesita,
        proximaAccion: datos.proximaAccion,
      },
      usuario,
      hoy,
      now,
    );

    if (existente) {
      const empresa = await this.repo.updateSeguimiento(existente.idEmpresa, seguimiento, interaccion);
      return { empresa, existente: true };
    }
    const creada = await this.repo.create({
      razonSocial,
      ruc,
      sector,
      contactos: [{ nombre: persona, telefono, correo }],
      notas: null,
      etapa: 'contactado',
      origen,
    });
    const empresa = await this.repo.updateSeguimiento(creada.idEmpresa, seguimiento, interaccion);
    return { empresa, existente: false };
  }

  /** Stored spelling of the sector, or `null` when none was given. Unknown → DatosEmpresaInvalidosError. */
  private async resolverSector(texto: string | null | undefined): Promise<string | null> {
    const pedido = opcional(texto);
    if (pedido === null) return null;
    const hallado = (await this.repo.listSectores()).find((s) => s.nombre.toLowerCase() === pedido.toLowerCase());
    if (!hallado) throw new DatosEmpresaInvalidosError(`Sector desconocido: ${pedido}`);
    return hallado.nombre;
  }

  private async buscarExistente(razonSocial: string, ruc: string | null): Promise<Empresa | null> {
    const porRuc = await this.repo.findByRuc(ruc);
    if (porRuc) return porRuc;
    const buscada = clave(razonSocial);
    const todas = await this.repo.list();
    return todas.find((e) => clave(e.razonSocial) === buscada) ?? null;
  }
}
