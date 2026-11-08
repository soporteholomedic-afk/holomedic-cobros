import type { ICrmEmpresaRepository } from '../domain/ports';
import { MAX_CONTACTOS, type Contacto, type Empresa } from '../domain/entities';
import { DatosEmpresaInvalidosError, EmpresaNotFoundError, RucDeOtraEmpresaError } from '../domain/errors';
import { validarRuc } from './validar';

const mismoContacto = (a: Contacto, b: Contacto): boolean =>
  a.nombre === b.nombre && a.telefono === b.telefono && a.correo === b.correo;

/**
 * Add the RUC to a "Falta RUC" ficha.
 * - Free RUC: saved.
 * - RUC of another empresa and `unir` false: `RucDeOtraEmpresaError` carrying
 *   the other ficha's id, name and relacion.
 * - `unir` true: the ficha is merged INTO the other one (`fusionar`, empresa
 *   level): history, oportunidades and contacts move, this ficha disappears.
 *   The destination keeps its own RUC, sector and relacion; the origin's
 *   notes are appended. Each oportunidad keeps its own stage and follow-up
 *   state — the merge never rewrites deals.
 *
 * The merge is rejected BEFORE writing when it would leave more than
 * MAX_CONTACTOS contacts.
 */
export class CompletarRucUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(idEmpresa: string, ruc: string, opciones: { unir: boolean }): Promise<Empresa> {
    const valido = validarRuc(ruc);
    const actual = await this.repo.getById(idEmpresa);
    if (!actual) throw new EmpresaNotFoundError(idEmpresa);

    const otra = await this.repo.findByRuc(valido);
    if (!otra || otra.idEmpresa === idEmpresa) {
      return this.repo.update(idEmpresa, {
        razonSocial: actual.razonSocial,
        ruc: valido,
        sector: actual.sector,
        contactos: actual.contactos,
        notas: actual.notas,
        direccion: actual.direccion,
      });
    }
    if (!opciones.unir) {
      throw new RucDeOtraEmpresaError({
        idEmpresa: otra.idEmpresa,
        razonSocial: otra.razonSocial,
        relacion: otra.relacion,
      });
    }

    const nuevos = actual.contactos.filter((c) => !otra.contactos.some((d) => mismoContacto(c, d)));
    if (otra.contactos.length + nuevos.length > MAX_CONTACTOS) {
      throw new DatosEmpresaInvalidosError(
        `Al unir, la tarjeta tendría más de ${MAX_CONTACTOS} contactos. Quita alguno antes de unirlas.`,
      );
    }

    return this.repo.fusionar(idEmpresa, otra.idEmpresa);
  }
}
