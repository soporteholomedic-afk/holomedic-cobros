import type { ICrmEmpresaRepository } from '../domain/ports';
import { SECTORES, type CrearEmpresaDatos, type Empresa, type Sector } from '../domain/entities';
import { DatosEmpresaInvalidosError, RucDuplicadoError } from '../domain/errors';
import { isValidCorreo } from '@/features/auth/domain/correo';

const RUC_RE = /^\d{11}$/;

function opcional(valor: string | null | undefined): string | null {
  const t = (valor ?? '').trim();
  return t.length > 0 ? t : null;
}

function obligatorio(valor: string, campo: string): string {
  const t = (valor ?? '').trim();
  if (t.length === 0) throw new DatosEmpresaInvalidosError(`${campo} es obligatorio`);
  return t;
}

/**
 * Create an empresa in the first board column ("Por contactar").
 * Validates before touching storage: a rejected input stores nothing.
 */
export class CrearEmpresaUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(datos: CrearEmpresaDatos): Promise<Empresa> {
    const razonSocial = obligatorio(datos.razonSocial, 'La razón social');
    const contactoNombre = obligatorio(datos.contactoNombre, 'El nombre del contacto');
    const contactoTelefono = obligatorio(datos.contactoTelefono, 'El teléfono');

    const ruc = (datos.ruc ?? '').trim();
    if (!RUC_RE.test(ruc)) throw new DatosEmpresaInvalidosError('El RUC debe tener 11 dígitos');

    const sectorTxt = opcional(datos.sector);
    if (sectorTxt !== null && !(SECTORES as readonly string[]).includes(sectorTxt)) {
      throw new DatosEmpresaInvalidosError(`Sector desconocido: ${sectorTxt}`);
    }
    const sector = sectorTxt as Sector | null;

    const contactoCorreo = opcional(datos.contactoCorreo);
    if (contactoCorreo !== null && !isValidCorreo(contactoCorreo)) {
      throw new DatosEmpresaInvalidosError('El correo no es válido');
    }

    if (await this.repo.findByRuc(ruc)) throw new RucDuplicadoError(ruc);

    return this.repo.create({
      razonSocial,
      ruc,
      sector,
      contactoNombre,
      contactoTelefono,
      contactoCorreo,
      notas: opcional(datos.notas),
      etapa: 'por_contactar',
    });
  }
}
