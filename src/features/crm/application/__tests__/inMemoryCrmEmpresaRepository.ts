import type {
  ActualizarEmpresaInput,
  Contacto,
  Correo,
  CrearEmpresaInput,
  Empresa,
} from '../../domain/entities';
import type { CrmEmpresaRepositoryPort, FiltrosEmpresas } from '../../domain/ports';
import { ConflictError } from '../../domain/errors';
import { normalizarCorreo, normalizarRuc } from '../../domain/normalizar';

/**
 * In-memory fake implementing `CrmEmpresaRepositoryPort` for use-case
 * unit tests (hexagonal: application logic is tested against the port
 * contract, never against SQL Server).
 *
 * The fake mirrors the adapter's observable contract — the parts the
 * real DB enforces that the use cases rely on:
 * - RUC dedup on the NORMALIZED key (`UQ_CRM_Empresas_RucNormalizado`
 *   semantics) → `ConflictError`, exactly like the adapter's
 *   unique-violation mapping.
 * - Correos stored normalized (lowercase, trimmed) and deduped per
 *   contacto (`UQ_CRM_Correos_ContactoCorreo` union semantics).
 * - Auto-assigned ids (IDENTITY semantics) and audit stamps.
 *
 * Filter semantics match the port docs: `q` is a case-insensitive
 * substring over razonSocial / ruc / rucNormalizado; `tipo` exact;
 * `responsable` exact, with `null` filtering unassigned (pool) empresas.
 */
export class InMemoryCrmEmpresaRepository implements CrmEmpresaRepositoryPort {
  private empresas = new Map<number, Empresa>();
  private contactoSeq = 0;
  private correoSeq = 0;

  async crear(datos: CrearEmpresaInput): Promise<Empresa> {
    const rucNormalizado = normalizarRuc(datos.ruc);
    for (const existente of this.empresas.values()) {
      if (existente.rucNormalizado === rucNormalizado) {
        throw new ConflictError('Ya existe una empresa con ese RUC');
      }
    }

    const now = new Date().toISOString();
    const id = this.nextEmpresaId();
    const empresa: Empresa = {
      id,
      ruc: datos.ruc,
      rucNormalizado,
      razonSocial: datos.razonSocial,
      tipo: datos.tipo,
      origen: datos.origen ?? null,
      proyectoObra: datos.proyectoObra ?? null,
      destinoComun: datos.destinoComun ?? null,
      notas: datos.notas ?? null,
      responsable: datos.responsable ?? null,
      contactos: datos.contactos.map((c) => this.mapContacto(id, c)),
      createdAt: now,
      updatedAt: now,
    };
    this.empresas.set(id, empresa);
    return structuredClone(empresa);
  }

  async listar(filtros?: FiltrosEmpresas): Promise<Empresa[]> {
    const q = filtros?.q?.trim().toLowerCase();
    const resultados = [...this.empresas.values()].filter((e) => {
      if (filtros?.tipo !== undefined && e.tipo !== filtros.tipo) return false;
      if (filtros?.responsable !== undefined) {
        if (filtros.responsable === null) {
          if (e.responsable !== null) return false;
        } else if (e.responsable !== filtros.responsable) {
          return false;
        }
      }
      if (q !== undefined && q !== '') {
        const hit =
          e.razonSocial.toLowerCase().includes(q) ||
          e.ruc.toLowerCase().includes(q) ||
          e.rucNormalizado.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
    return structuredClone(resultados);
  }

  async obtenerPorId(id: number): Promise<Empresa | null> {
    const empresa = this.empresas.get(id);
    return empresa ? structuredClone(empresa) : null;
  }

  async actualizar(id: number, cambios: ActualizarEmpresaInput): Promise<Empresa | null> {
    const empresa = this.empresas.get(id);
    if (!empresa) return null;

    if (cambios.razonSocial !== undefined) empresa.razonSocial = cambios.razonSocial;
    if (cambios.tipo !== undefined) empresa.tipo = cambios.tipo;
    if (cambios.origen !== undefined) empresa.origen = cambios.origen;
    if (cambios.proyectoObra !== undefined) empresa.proyectoObra = cambios.proyectoObra;
    if (cambios.destinoComun !== undefined) empresa.destinoComun = cambios.destinoComun;
    if (cambios.notas !== undefined) empresa.notas = cambios.notas;
    if (cambios.responsable !== undefined) empresa.responsable = cambios.responsable;
    empresa.updatedAt = new Date().toISOString();
    return structuredClone(empresa);
  }

  private nextEmpresaId(): number {
    // Monotonic per-process id (IDENTITY semantics for a fresh registry).
    let max = 0;
    for (const id of this.empresas.keys()) max = Math.max(max, id);
    return max + 1;
  }

  private mapContacto(empresaId: number, c: CrearEmpresaInput['contactos'][number]): Contacto {
    const contactoId = ++this.contactoSeq;
    const seen = new Set<string>();
    const correos: Correo[] = [];
    for (const raw of c.correos) {
      const correo = normalizarCorreo(raw);
      if (correo === '' || seen.has(correo)) continue;
      seen.add(correo);
      correos.push({ id: ++this.correoSeq, contactoId, correo });
    }
    return {
      id: contactoId,
      empresaId,
      nombre: c.nombre,
      telefono: c.telefono ?? null,
      esPrincipal: c.esPrincipal === true,
      correos,
    };
  }
}
