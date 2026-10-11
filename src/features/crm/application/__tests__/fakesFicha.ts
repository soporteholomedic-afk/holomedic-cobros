import type { ConversacionCrm, Empresa, ExtraccionFicha } from '../../domain/entities';
import type { ContactoConEmpresa } from '../../domain/ports';

/**
 * Shared in-memory fakes for the ficha-viva use-case suites (E3·T4,
 * obtenerFichaConversacion + confirmarDatoFicha). Hexagonal: the use
 * cases are exercised against the PORT contracts, never SQL Server.
 *
 * The conversaciones fake mirrors the OBSERVABLE contract the real
 * adapter enforces and the use cases rely on (T1 rule): the ficha
 * upsert dedups by (contactoId, empresaId, campo) with NULL-safe keys
 * and an IA re-extraction NEVER overwrites a HUMANO-confirmed row.
 */

export interface EntradaUpsertFicha {
  contactoId: number | null;
  empresaId: number | null;
  campo: ExtraccionFicha['campo'];
  valor: string;
  origen: ExtraccionFicha['origen'];
  confirmado: boolean;
}

export class FakeConversacionesFicha {
  filas: ConversacionCrm[] = [];
  contactos = new Map<number, ContactoConEmpresa>();
  extracciones: ExtraccionFicha[] = [];
  upserts: EntradaUpsertFicha[] = [];
  cargosActualizados: Array<{ contactoId: number; cargo: string }> = [];
  private siguienteExtraccionId = 100;

  sembrar(fila: ConversacionCrm): void {
    this.filas.push(fila);
  }

  sembrarContacto(contacto: ContactoConEmpresa): void {
    this.contactos.set(contacto.contactoId, contacto);
  }

  sembrarExtraccion(sobres: Partial<ExtraccionFicha> & Pick<ExtraccionFicha, 'campo' | 'valor'>): ExtraccionFicha {
    const fila: ExtraccionFicha = {
      id: this.siguienteExtraccionId++,
      contactoId: null,
      empresaId: null,
      origen: 'IA',
      confirmado: false,
      actualizadoEn: new Date(),
      ...sobres,
    };
    this.extracciones.push(fila);
    return fila;
  }

  async obtenerPorId(id: number): Promise<ConversacionCrm | null> {
    const fila = this.filas.find((f) => f.id === id);
    return fila ? structuredClone(fila) : null;
  }

  async obtenerContactoPorId(contactoId: number): Promise<ContactoConEmpresa | null> {
    const contacto = this.contactos.get(contactoId);
    return contacto ? structuredClone(contacto) : null;
  }

  async upsertExtraccionFicha(entrada: EntradaUpsertFicha): Promise<ExtraccionFicha> {
    this.upserts.push(structuredClone(entrada));
    const existente = this.extracciones.find(
      (fila) =>
        fila.contactoId === entrada.contactoId &&
        fila.empresaId === entrada.empresaId &&
        fila.campo === entrada.campo,
    );
    // T1 rule (SQL adapter contract): IA never overwrites HUMANO-confirmed.
    if (
      existente !== undefined &&
      existente.confirmado &&
      existente.origen === 'HUMANO' &&
      entrada.origen === 'IA'
    ) {
      return structuredClone(existente);
    }
    if (existente !== undefined) {
      existente.valor = entrada.valor;
      existente.origen = entrada.origen;
      existente.confirmado = entrada.confirmado;
      existente.actualizadoEn = new Date();
      return structuredClone(existente);
    }
    const fila: ExtraccionFicha = {
      id: this.siguienteExtraccionId++,
      contactoId: entrada.contactoId,
      empresaId: entrada.empresaId,
      campo: entrada.campo,
      valor: entrada.valor,
      origen: entrada.origen,
      confirmado: entrada.confirmado,
      actualizadoEn: new Date(),
    };
    this.extracciones.push(fila);
    return structuredClone(fila);
  }

  async listarExtraccionesFicha(
    contactoId: number | null,
    empresaId: number | null,
  ): Promise<ExtraccionFicha[]> {
    if (contactoId === null && empresaId === null) return [];
    const propias = this.extracciones.filter(
      (fila) =>
        (contactoId !== null && fila.contactoId === contactoId) ||
        (empresaId !== null && fila.empresaId === empresaId),
    );
    return [...propias].sort((a, b) => a.campo.localeCompare(b.campo) || a.id - b.id);
  }

  async actualizarCargoContacto(contactoId: number, cargo: string): Promise<ContactoConEmpresa | null> {
    this.cargosActualizados.push({ contactoId, cargo });
    const contacto = this.contactos.get(contactoId);
    if (contacto === undefined) return null;
    contacto.cargo = cargo;
    return structuredClone(contacto);
  }
}

export class FakeEmpresasFicha {
  filas: Empresa[] = [];
  cantidadActualizada: Array<{ empresaId: number; cantidad: number }> = [];

  async obtenerPorId(id: number): Promise<Empresa | null> {
    const fila = this.filas.find((f) => f.id === id);
    return fila ? structuredClone(fila) : null;
  }

  async actualizarCantidadTrabajadores(empresaId: number, cantidad: number): Promise<Empresa | null> {
    this.cantidadActualizada.push({ empresaId, cantidad });
    const fila = this.filas.find((f) => f.id === empresaId);
    if (fila === undefined) return null;
    fila.cantidadTrabajadores = cantidad;
    return structuredClone(fila);
  }
}

/** Base conversación row for the ficha suites (linked by default). */
export function conversacionFicha(sobres: Partial<ConversacionCrm> = {}): ConversacionCrm {
  const ahora = new Date().toISOString();
  return {
    id: 1,
    empresaId: 7,
    contactoId: 42,
    canal: 'WHATSAPP',
    telefono: '+595981234567',
    identificadorCanal: 'US.1349',
    estado: 'ACTIVA_IA',
    asignadaA: null,
    modo: 'IA',
    ultimoMensajeEn: ahora,
    noLeidos: 0,
    creadoEn: ahora,
    actualizadoEn: ahora,
    ...sobres,
  };
}

/** Base empresa row for the ficha suites. */
export function empresaFicha(sobres: Partial<Empresa> = {}): Empresa {
  return {
    id: 7,
    ruc: '80012345-6',
    rucNormalizado: '800123456',
    razonSocial: 'Constructora X S.A.',
    tipo: 'Cliente',
    origen: null,
    proyectoObra: null,
    destinoComun: null,
    notas: null,
    responsable: null,
    cantidadTrabajadores: null,
    contactos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...sobres,
  };
}
