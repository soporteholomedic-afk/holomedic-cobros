import type { CrearContactoInput, CrearEmpresaInput, Empresa } from '../domain/entities';
import { ValidationError } from '../domain/errors';
import { normalizarRuc } from '../domain/normalizar';
import type { CrmEmpresaRepositoryPort } from '../domain/ports';

/**
 * CrearEmpresaUseCase (spec G1 registro de empresas) — application
 * rules over the repository port; persistence and RUC-dedup
 * enforcement live in the adapter (UQ violation → ConflictError).
 *
 * Enforced here:
 * - ruc / razonSocial non-empty (after trimming / RUC normalization).
 * - at least one contacto, each with a nombre and at least one correo
 *   (spec G1 rejection scenario).
 * - exactly-one-principal: the FIRST contacto marked `esPrincipal`
 *   wins; with no marks the FIRST LISTED contacto is the default.
 *   Over-marking demotes everyone else — the DB filtered index is only
 *   a backstop.
 */
export class CrearEmpresaUseCase {
  constructor(private readonly repo: CrmEmpresaRepositoryPort) {}

  async execute(input: CrearEmpresaInput): Promise<Empresa> {
    if (normalizarRuc(input.ruc) === '') {
      throw new ValidationError('El RUC es obligatorio');
    }
    if (input.razonSocial.trim() === '') {
      throw new ValidationError('La razón social es obligatoria');
    }
    if (input.contactos.length === 0) {
      throw new ValidationError('La empresa requiere al menos un contacto');
    }
    for (const contacto of input.contactos) {
      if (contacto.nombre.trim() === '') {
        throw new ValidationError('Cada contacto requiere un nombre');
      }
      if (!contacto.correos.some((correo) => correo.trim() !== '')) {
        throw new ValidationError('Cada contacto requiere al menos un correo');
      }
    }

    const datos: CrearEmpresaInput = {
      ...input,
      razonSocial: input.razonSocial.trim(),
      contactos: resolverContactos(input.contactos),
    };
    return this.repo.crear(datos);
  }
}

/** Resolve the exactly-one-principal invariant app-side (see class doc). */
function resolverContactos(contactos: CrearContactoInput[]): CrearContactoInput[] {
  const primerMarcado = contactos.findIndex((c) => c.esPrincipal === true);
  const indicePrincipal = primerMarcado >= 0 ? primerMarcado : 0;
  return contactos.map((c, i) => ({
    ...c,
    nombre: c.nombre.trim(),
    esPrincipal: i === indicePrincipal,
  }));
}
