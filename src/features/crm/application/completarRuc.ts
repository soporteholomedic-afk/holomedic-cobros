import type { ICrmEmpresaRepository } from '../domain/ports';
import { MAX_CONTACTOS, type Contacto, type Empresa } from '../domain/entities';
import {
  DatosEmpresaInvalidosError,
  EmpresaNotFoundError,
  RucDeOtraEmpresaError,
} from '../domain/errors';
import { seguimientoDe } from './seguimiento';
import { validarRuc } from './validar';

const mismoContacto = (a: Contacto, b: Contacto): boolean =>
  a.nombre === b.nombre && a.telefono === b.telefono && a.correo === b.correo;

/**
 * Add the RUC to a "Falta RUC" card (S6).
 * - Free RUC: saved.
 * - RUC of another empresa and `unir` false: `RucDeOtraEmpresaError` carrying the other one.
 * - `unir` true: the card is merged INTO the other one (`fusionar`): history and
 *   contacts move, this card disappears. The destination keeps its own RUC,
 *   sector, stage, notes (the origin's are appended) and attempt counter, and
 *   inherits the pending reply and the next action only when this card had a
 *   pending reply (L8).
 *
 * The merge is rejected BEFORE writing when it would leave more than
 * MAX_CONTACTOS contacts. The inheritance is a second write after `fusionar`
 * (`fusionar` is atomic by itself, the pair is not): if it fails, the merge
 * stands and the destination simply keeps its own pending reply and action.
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
      });
    }
    if (!opciones.unir) {
      throw new RucDeOtraEmpresaError({
        idEmpresa: otra.idEmpresa,
        razonSocial: otra.razonSocial,
        etapa: otra.etapa,
      });
    }

    const nuevos = actual.contactos.filter((c) => !otra.contactos.some((d) => mismoContacto(c, d)));
    if (otra.contactos.length + nuevos.length > MAX_CONTACTOS) {
      throw new DatosEmpresaInvalidosError(
        `Al unir, la tarjeta tendría más de ${MAX_CONTACTOS} contactos. Quita alguno antes de unirlas.`,
      );
    }

    const fusionada = await this.repo.fusionar(idEmpresa, otra.idEmpresa);
    if (actual.faltaResponderDesde === null) return fusionada;

    const desde =
      fusionada.faltaResponderDesde !== null && fusionada.faltaResponderDesde < actual.faltaResponderDesde
        ? fusionada.faltaResponderDesde
        : actual.faltaResponderDesde;
    return this.repo.updateSeguimiento(
      fusionada.idEmpresa,
      {
        ...seguimientoDe(fusionada),
        faltaResponderDesde: desde,
        proximaAccion: actual.proximaAccion ?? fusionada.proximaAccion,
      },
      null,
    );
  }
}
