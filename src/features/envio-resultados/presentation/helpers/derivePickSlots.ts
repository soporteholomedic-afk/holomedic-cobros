/**
 * `derivePickSlots` maps a patient's fichas into the per-ficha
 * CAMO/EMO pick slots rendered by Step2/Step3 (multi-proyecto
 * change, design D7).
 *
 * Only fichas with a non-empty `idAten` become slots — the
 * FilesModal needs the attendance id to list LEGAJOS. Slot order
 * follows `person.fichas` order, which is the first-appearance
 * order the rest of the pipeline relies on.
 *
 * Spec coverage (envio-resultados-multi-proyecto):
 *  - REQ-102 — one slot per (patient, ficha with non-empty idAten),
 *    proyecto label with an `Atención <idAten>` fallback.
 */
import { pickKey } from '../hooks/useEnvioWizard';
import type { UnifiedFicha, UnifiedPerson } from '@/types/sp-result';

/** One selectable CAMO/EMO slot for a patient's atención. */
export interface PickSlot {
  /** The ficha backing the slot (nroRuc/fecAte/tipoExamen binding). */
  ficha: UnifiedFicha;
  /** Composite pick key: `'<dni>::<idAten>'`. */
  key: string;
  /** Row label: the ficha's proyecto, or `Atención <idAten>`. */
  label: string;
}

/** Derive the pick slots for one patient. Pure — no I/O, no React. */
export function derivePickSlots(person: UnifiedPerson): PickSlot[] {
  const slots: PickSlot[] = [];
  for (const ficha of person.fichas) {
    if (ficha.idAten === '') continue;
    slots.push({
      ficha,
      key: pickKey(person.dni, ficha.idAten),
      label: ficha.proyecto || `Atención ${ficha.idAten}`,
    });
  }
  return slots;
}
