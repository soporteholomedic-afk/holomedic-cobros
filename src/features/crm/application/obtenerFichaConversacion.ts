import type {
  CampoFicha,
  ContactoFicha,
  DatoFicha,
  EmpresaFicha,
  ExtraccionFicha,
  FichaConversacion,
} from '../domain/entities';
import type {
  ContactoConEmpresa,
  ConversacionCrmRepository,
  CrmEmpresaRepositoryPort,
} from '../domain/ports';
import { ConversacionNoEncontradaError } from './obtenerHiloConversacion';

// Re-export: the ficha use cases share the bandeja typed 404 (the
// memorias precedent).
export { ConversacionNoEncontradaError };

/**
 * ObtenerFichaConversacionUseCase (agente-ia-crm E3·T4) — the living
 * contact card (ficha viva) READ: one conversation's merged card.
 *
 * Merged view per campo:
 * - cargo: the CANONICAL CRM_Contactos.cargo wins when set (origen
 *   'canonico', confirmado true); otherwise the LATEST extraction
 *   (max id per campo) from listarExtraccionesFicha over the
 *   contactoId OR empresaId columns.
 * - trabajadores: the CANONICAL CRM_Empresas.cantidadTrabajadores
 *   wins when set (stringified for uniformity); otherwise the latest
 *   extraction.
 * - sedes: ALWAYS the latest extraction — ficha-only by locked
 *   design (no canonical column, no promotion).
 *
 * A `valor` null with placeholder origen/confirmado means "sin dato"
 * — the shape stays total so the UI reads Record<CampoFicha,
 * DatoFicha> without key checks. listarExtraccionesFicha is an
 * optional capability: without it the extracciones side degrades to
 * empty (canonical fields still render — memorias listar precedent).
 */

export interface ObtenerFichaConversacionDeps {
  conversaciones: Pick<
    ConversacionCrmRepository,
    'obtenerPorId' | 'obtenerContactoPorId' | 'listarExtraccionesFicha'
  >;
  empresas: Pick<CrmEmpresaRepositoryPort, 'obtenerPorId'>;
}

const CAMPOS_FICHA: readonly CampoFicha[] = ['cargo', 'trabajadores', 'sedes'];

/** The placeholder datum shown when nothing backs a campo. */
const DATO_VACIO: DatoFicha = { valor: null, origen: 'IA', confirmado: false };

export class ObtenerFichaConversacionUseCase {
  constructor(private readonly deps: ObtenerFichaConversacionDeps) {}

  async ejecutar(conversacionId: number): Promise<FichaConversacion> {
    const conversacion = await this.deps.conversaciones.obtenerPorId(conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();

    // Contacto: the row's OWN empresaId is authoritative when the
    // conversation row lags (they move together through vincular).
    const contactoLeido: ContactoConEmpresa | null =
      conversacion.contactoId !== null
        ? await this.deps.conversaciones.obtenerContactoPorId(conversacion.contactoId)
        : null;
    const contacto: ContactoFicha | null =
      contactoLeido !== null
        ? {
            id: contactoLeido.contactoId,
            nombre: contactoLeido.nombreContacto,
            telefono: contactoLeido.telefono,
            cargo: contactoLeido.cargo ?? null,
          }
        : null;
    const empresaId = conversacion.empresaId ?? contactoLeido?.empresaId ?? null;

    const empresaLeida = empresaId !== null ? await this.deps.empresas.obtenerPorId(empresaId) : null;
    const empresa: EmpresaFicha | null =
      empresaLeida !== null
        ? {
            id: empresaLeida.id,
            razonSocial: empresaLeida.razonSocial,
            cantidadTrabajadores: empresaLeida.cantidadTrabajadores ?? null,
          }
        : null;

    // Latest extraction per campo — listar orders by (campo, id), so
    // the LAST row seen per campo is the latest. Optional capability:
    // absent ⇔ no extracciones (canonical fields still render).
    const listar = this.deps.conversaciones.listarExtraccionesFicha;
    const filas: ExtraccionFicha[] =
      listar === undefined ? [] : await listar.call(this.deps.conversaciones, conversacion.contactoId, empresaId);
    const ultimaPorCampo = new Map<CampoFicha, ExtraccionFicha>();
    for (const fila of filas) {
      ultimaPorCampo.set(fila.campo, fila);
    }

    const datos = {} as Record<CampoFicha, DatoFicha>;
    for (const campo of CAMPOS_FICHA) {
      const canonico = this.valorCanonico(campo, contacto, empresa);
      if (canonico !== null) {
        datos[campo] = { valor: canonico, origen: 'canonico', confirmado: true };
        continue;
      }
      const extraccion = ultimaPorCampo.get(campo);
      datos[campo] =
        extraccion === undefined
          ? { ...DATO_VACIO }
          : { valor: extraccion.valor, origen: extraccion.origen, confirmado: extraccion.confirmado };
    }

    return { conversacionId, contacto, empresa, datos };
  }

  /** Canonical column as a display string, null when unset (sedes: never). */
  private valorCanonico(
    campo: CampoFicha,
    contacto: ContactoFicha | null,
    empresa: EmpresaFicha | null,
  ): string | null {
    if (campo === 'cargo') {
      return contacto !== null && contacto.cargo !== null && contacto.cargo.trim() !== ''
        ? contacto.cargo
        : null;
    }
    if (campo === 'trabajadores') {
      return empresa !== null && empresa.cantidadTrabajadores !== null
        ? String(empresa.cantidadTrabajadores)
        : null;
    }
    return null; // sedes: ficha-only by locked design
  }
}
