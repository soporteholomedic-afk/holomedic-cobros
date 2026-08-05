import type { EntrevistaOsteomuscular } from '@/types/entrevista-osteomuscular';
import type { IEntrevistaOsteomuscularRepository } from '@/features/entrevista-osteomuscular/domain/ports';
import { isValidDetalleIrradiacion } from '@/features/entrevista-osteomuscular/domain/detalleIrradiacion';

export type SaveEntrevistaResult =
  | { ok: true }
  | { ok: false; error: string };

export interface SaveEntrevistaInput {
  idAtencion: string;
  entrevista: unknown;
}

/**
 * Use case: save (upsert) the osteomuscular interview of an attention.
 *
 * Validates the external payload before persisting:
 * - idAtencion must be non-empty
 * - the payload must carry the columna sections (cervical / dorsal / lumboSacra)
 * - every `detalleIrradiacion` must comply with format + length rules
 */
export class SaveEntrevistaOsteomuscularUseCase {
  constructor(private readonly repo: IEntrevistaOsteomuscularRepository) {}

  async execute(input: SaveEntrevistaInput): Promise<SaveEntrevistaResult> {
    if (!input.idAtencion?.trim()) {
      return { ok: false, error: 'idAtencion es requerido' };
    }

    const narrowed = narrowEntrevista(input.entrevista);
    if (!narrowed.ok) return { ok: false, error: narrowed.error };

    const entrevista: EntrevistaOsteomuscular = {
      ...narrowed.entrevista,
      idAtencion: input.idAtencion.trim(),
    };

    try {
      await this.repo.save(entrevista);
      return { ok: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error desconocido al guardar';
      return { ok: false, error: message };
    }
  }
}

type NarrowResult =
  | { ok: true; entrevista: EntrevistaOsteomuscular }
  | { ok: false; error: string };

function narrowEntrevista(value: unknown): NarrowResult {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'entrevista es requerida' };
  }

  const entrevista = value as EntrevistaOsteomuscular;
  const columna = entrevista.columna;
  if (!columna || typeof columna !== 'object') {
    return { ok: false, error: 'entrevista.columna es requerida' };
  }

  const secciones: Array<[string, unknown]> = [
    ['cervical', columna.cervical],
    ['dorsal', columna.dorsal],
    ['lumboSacra', columna.lumboSacra],
  ];

  for (const [nombre, seccion] of secciones) {
    if (!seccion || typeof seccion !== 'object') {
      return { ok: false, error: `entrevista.columna.${nombre} es requerida` };
    }
    const irradiacion = (seccion as { irradiacion?: unknown }).irradiacion;
    if (!irradiacion || typeof irradiacion !== 'object') {
      return { ok: false, error: `entrevista.columna.${nombre}.irradiacion es requerida` };
    }
    const detalle = (irradiacion as { detalleIrradiacion?: unknown }).detalleIrradiacion;
    if (typeof detalle !== 'string' || !isValidDetalleIrradiacion(detalle)) {
      return {
        ok: false,
        error: `entrevista.columna.${nombre}.irradiacion.detalleIrradiacion no cumple el formato o la longitud permitida`,
      };
    }
  }

  return { ok: true, entrevista };
}
