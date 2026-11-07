import type { ICrmEmpresaRepository } from '../domain/ports';
import { RucDuplicadoError } from '../domain/errors';
import type { FilaExcelEmpresa } from '../infrastructure/excel/leerExcelEmpresas';
import { isValidCorreo } from '@/features/auth/domain/correo';
import { opcional } from './validar';
import { CrearSectorUseCase, MAX_SECTOR, limpiarSector } from './sectores';

export type EstadoFila = 'ok' | 'err' | 'dup';

/** A file row after the checks: what the review screen shows. */
export interface FilaEvaluada extends FilaExcelEmpresa {
  estado: EstadoFila;
  /** Why the row is skipped; empty for ok rows. */
  nota: string;
  /** Only for ok rows: the sector does not exist yet and will be created. */
  sectorNuevo: boolean;
}

export interface ResumenImportacion {
  leidas: number;
  listas: number;
  errores: number;
  repetidas: number;
}

export interface ResultadoImportacion {
  importadas: number;
  sectoresNuevos: number;
  omitidas: number;
}

const RUC_RE = /^\d{11}$/;

/** First problem of a row, in the order of the template columns; `null` when it is fine. */
function problemaDeFila(f: FilaExcelEmpresa): string | null {
  const faltantes: Array<[string, string]> = [
    ['la razón social', f.razonSocial],
    ['el RUC', f.ruc],
    ['el sector', f.sector],
    ['el contacto', f.contacto],
    ['el teléfono', f.telefono],
  ];
  const falta = faltantes.find(([, valor]) => valor.trim() === '');
  if (falta) return `Falta ${falta[0]}`;
  if (!RUC_RE.test(f.ruc.trim())) return 'El RUC debe tener 11 dígitos';
  if (f.telefono.replace(/\D/g, '').length !== 9) return 'El teléfono debe tener 9 dígitos';
  const correo = opcional(f.correo);
  if (correo !== null && !isValidCorreo(correo)) return 'El correo no es válido';
  if (limpiarSector(f.sector).length > MAX_SECTOR) return `El sector admite hasta ${MAX_SECTOR} caracteres`;
  return null;
}

/**
 * Check every row against the file itself and the stored data. Read-only: the
 * review screen and the final import both start here, so they cannot disagree.
 */
export async function evaluarImportacion(
  filas: readonly FilaExcelEmpresa[],
  repo: ICrmEmpresaRepository,
): Promise<{ filas: FilaEvaluada[]; resumen: ResumenImportacion }> {
  const sectores = new Set((await repo.listSectores()).map((s) => s.nombre.toLowerCase()));
  const rucsGuardados = new Set((await repo.list()).map((e) => e.ruc));
  const primeraVez = new Map<string, number>();

  const evaluadas = filas.map((f): FilaEvaluada => {
    const base = { ...f, nota: '', sectorNuevo: false };
    const problema = problemaDeFila(f);
    if (problema) return { ...base, estado: 'err', nota: problema };
    const ruc = f.ruc.trim();
    if (rucsGuardados.has(ruc)) return { ...base, estado: 'dup', nota: 'Ya existe en el CRM' };
    const antes = primeraVez.get(ruc);
    if (antes !== undefined) return { ...base, estado: 'dup', nota: `Repetida en la fila ${antes}` };
    primeraVez.set(ruc, f.fila);
    return { ...base, estado: 'ok', sectorNuevo: !sectores.has(limpiarSector(f.sector).toLowerCase()) };
  });

  const cuenta = (estado: EstadoFila) => evaluadas.filter((f) => f.estado === estado).length;
  return {
    filas: evaluadas,
    resumen: { leidas: evaluadas.length, listas: cuenta('ok'), errores: cuenta('err'), repetidas: cuenta('dup') },
  };
}

/**
 * Import the ok rows into "Por contactar" (one principal contact each), after
 * creating the sectors they need. Rows with an error or repeated are skipped.
 */
export class ImportarEmpresasUseCase {
  constructor(private readonly repo: ICrmEmpresaRepository) {}

  async execute(filas: readonly FilaExcelEmpresa[]): Promise<ResultadoImportacion> {
    const { filas: evaluadas } = await evaluarImportacion(filas, this.repo);
    const listas = evaluadas.filter((f) => f.estado === 'ok');
    if (listas.length === 0) return { importadas: 0, sectoresNuevos: 0, omitidas: evaluadas.length };

    const nuevos = new Map<string, string>();
    for (const f of listas) {
      if (f.sectorNuevo && !nuevos.has(limpiarSector(f.sector).toLowerCase())) {
        nuevos.set(limpiarSector(f.sector).toLowerCase(), limpiarSector(f.sector));
      }
    }
    const crearSector = new CrearSectorUseCase(this.repo);
    for (const nombre of nuevos.values()) await crearSector.execute(nombre);

    const guardados = new Map((await this.repo.listSectores()).map((s) => [s.nombre.toLowerCase(), s.nombre]));
    let importadas = 0;
    for (const f of listas) {
      try {
        await this.repo.create({
          razonSocial: f.razonSocial.trim(),
          ruc: f.ruc.trim(),
          sector: guardados.get(limpiarSector(f.sector).toLowerCase()) ?? limpiarSector(f.sector),
          contactos: [{ nombre: f.contacto.trim(), telefono: f.telefono.trim(), correo: opcional(f.correo) }],
          notas: null,
          direccion: null,
          etapa: 'por_contactar',
          origen: null,
        });
        importadas++;
      } catch (error) {
        if (!(error instanceof RucDuplicadoError)) throw error;
      }
    }
    return { importadas, sectoresNuevos: nuevos.size, omitidas: evaluadas.length - importadas };
  }
}
