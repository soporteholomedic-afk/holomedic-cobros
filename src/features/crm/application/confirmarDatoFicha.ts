import type { CampoFicha, FichaConversacion } from '../domain/entities';
import { ConflictError, ValidationError } from '../domain/errors';
import type { ConversacionCrmRepository, CrmEmpresaRepositoryPort } from '../domain/ports';
import { ConversacionNoEncontradaError } from './obtenerHiloConversacion';
import type { ObtenerFichaConversacionUseCase } from './obtenerFichaConversacion';

// Re-export: the ficha use cases share the bandeja typed 404 (the
// memorias precedent).
export { ConversacionNoEncontradaError };

/**
 * ConfirmarDatoFichaUseCase (agente-ia-crm E3·T4) — the operator
 * confirm that lands a ficha datum AND promotes it to the canonical
 * column. Two steps, in order:
 *
 * 1. upsertExtraccionFicha — origen 'HUMANO', confirmado true, with
 *    the SAME keying the motor writes (owner first: cargo →
 *    contactoId, trabajadores/sedes → empresaId; when the owner is
 *    missing the OTHER side keys the row so it stays reachable —
 *    sedes on a contacto-only conversation). Landing on the SAME row
 *    the IA wrote is what makes the T1 human-wins rule bite: a later
 *    IA re-extraction can never override this row.
 * 2. Promote (campo-specific): cargo → actualizarCargoContacto;
 *    trabajadores → actualizarCantidadTrabajadores (parsed int ≥ 1);
 *    sedes → NOTHING (ficha-only by locked design). The promotion
 *    methods are optional capabilities — absent ⇒ the confirm still
 *    lands (upsert done), only the canonical column lags
 *    (actualizarModo precedent).
 *
 * Validation: valor trim 1..500 (ValidationError); trabajadores must
 * be a strict integer ≥ 1 — an unparseable value is REJECTED with a
 * typed error (never stored as text: the ficha keeps no knowingly
 * wrong headcount); campo ∈ union (defensive — the route narrows the
 * body). Typed conflicts (ConflictError): cargo requires a contacto,
 * trabajadores requires an empresa, sedes requires either.
 *
 * Returns the REFRESHED FichaConversacion (obtenerFichaConversacion
 * reuse — the caller renders the post-confirm card directly).
 */
export interface ConfirmarDatoFichaEntrada {
  conversacionId: number;
  campo: CampoFicha;
  valor: string;
  /**
   * Acting session user. The E3·T1 schema keeps no per-row actor
   * column (actualizadoEn only) — reserved for the audit slice that
   * adds one; the route always passes it.
   */
  usuario: string;
}

export interface ConfirmarDatoFichaDeps {
  conversaciones: Pick<
    ConversacionCrmRepository,
    'obtenerPorId' | 'upsertExtraccionFicha' | 'actualizarCargoContacto'
  >;
  empresas: Pick<CrmEmpresaRepositoryPort, 'actualizarCantidadTrabajadores'>;
  /** The read use case — reused for the refreshed return (DI, no re-build). */
  obtenerFicha: ObtenerFichaConversacionUseCase;
}

const CAMPOS_FICHA: readonly CampoFicha[] = ['cargo', 'trabajadores', 'sedes'];
const VALOR_MAX_CARACTERES = 500;
/** Strict integer literal (already trimmed) — no "120abc", no "12.5". */
const PATRON_ENTERO = /^\d+$/;

export class ConfirmarDatoFichaUseCase {
  constructor(private readonly deps: ConfirmarDatoFichaDeps) {}

  async ejecutar(entrada: ConfirmarDatoFichaEntrada): Promise<FichaConversacion> {
    if (!CAMPOS_FICHA.includes(entrada.campo)) {
      throw new ValidationError(`"campo" debe ser uno de: ${CAMPOS_FICHA.join(', ')}`);
    }
    const valor = entrada.valor.trim();
    if (valor.length < 1 || valor.length > VALOR_MAX_CARACTERES) {
      throw new ValidationError(
        `"valor" debe tener entre 1 y ${VALOR_MAX_CARACTERES} caracteres`,
      );
    }

    const conversacion = await this.deps.conversaciones.obtenerPorId(entrada.conversacionId);
    if (conversacion === null) throw new ConversacionNoEncontradaError();
    const contactoId = conversacion.contactoId;
    const empresaId = conversacion.empresaId;

    let trabajadores: number | null = null;
    if (entrada.campo === 'cargo') {
      if (contactoId === null) {
        throw new ConflictError(
          'La conversación no tiene contacto vinculado: no hay cargo que confirmar',
        );
      }
    } else if (entrada.campo === 'trabajadores') {
      if (empresaId === null) {
        throw new ConflictError(
          'La conversación no tiene empresa vinculada: no hay trabajadores que confirmar',
        );
      }
      if (!PATRON_ENTERO.test(valor)) {
        throw new ValidationError('"trabajadores" debe ser un número entero mayor o igual a 1');
      }
      trabajadores = Number.parseInt(valor, 10);
      if (trabajadores < 1) {
        throw new ValidationError('"trabajadores" debe ser un número entero mayor o igual a 1');
      }
    } else if (contactoId === null && empresaId === null) {
      throw new ConflictError(
        'La conversación no tiene contacto ni empresa vinculados: no hay ficha donde confirmar',
      );
    }

    // 1. Land the HUMAN-confirmed row (motor keying — same dedup tuple).
    //    Owner first (cargo → contacto, trabajadores/sedes → empresa);
    //    when the owner is missing the OTHER side keys the row so it
    //    stays reachable (sedes on a contacto-only conversation —
    //    "empresaId o contactoId", the locked requirement).
    const upsert = this.deps.conversaciones.upsertExtraccionFicha;
    if (upsert === undefined) {
      throw new Error(
        'confirmarDatoFicha requiere un adaptador de conversaciones con upsertExtraccionFicha (capacidad E3·T1)',
      );
    }
    const claveContacto = entrada.campo === 'cargo' ? contactoId : empresaId !== null ? null : contactoId;
    const claveEmpresa = entrada.campo === 'cargo' ? (contactoId !== null ? null : empresaId) : empresaId;
    await upsert.call(this.deps.conversaciones, {
      contactoId: claveContacto,
      empresaId: claveEmpresa,
      campo: entrada.campo,
      valor,
      origen: 'HUMANO',
      confirmado: true,
    });

    // 2. Promote to the canonical column (campo-specific, optional
    //    capabilities — absent ⇒ land-only).
    if (entrada.campo === 'cargo' && contactoId !== null) {
      await this.deps.conversaciones.actualizarCargoContacto?.(contactoId, valor);
    }
    if (entrada.campo === 'trabajadores' && trabajadores !== null && empresaId !== null) {
      await this.deps.empresas.actualizarCantidadTrabajadores?.(empresaId, trabajadores);
    }
    // sedes: no promotion by locked design (ficha-only).

    return this.deps.obtenerFicha.ejecutar(entrada.conversacionId);
  }
}
