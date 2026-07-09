/**
 * Pure helper that aggregates per-ficha CAMO/EMO statuses from
 * `useLegajosStatus` into a per-patient, per-document three-state summary
 * (COMPLETO / PARCIAL / VACIO) plus the lists of patients that have or lack
 * each document.
 *
 * This is the building block for `DocumentVerificationModal`. It is kept
 * here (not inside the component) so the logic is trivially testable
 * without a DOM, and so the OR-merge rule can be reasoned about in one
 * place.
 *
 * OR-merge contract (spec "Per-Patient GENERAR Placeholders" + design §7):
 *   - A patient may carry several `UnifiedFicha` entries (e.g., the same
 *     DNI across multiple projects). We collapse to one row per patient
 *     (DNI). The patient is counted as HAVING the document if ANY of
 *     their fichas has it.
 *   - A `LegajosRowStatus` in loading or error state is defensive: after
 *     `checkAll` resolves, every ficha is settled, but if a row is
 *     missing/pending (e.g., the user opened the modal before checkAll
 *     started for that ficha) we still classify the patient as LACKING
 *     the document. A missing row is treated the same way.
 */
import type { LegajosRowStatus } from '@/features/envio-resultados/presentation/hooks/useLegajosStatus';
import type { UnifiedPerson } from '@/types/sp-result';

/** Three-state coverage result for one document type. */
export type DocumentCoverageState = 'COMPLETO' | 'PARCIAL' | 'VACIO';

/** Minimal patient identity needed by the modal to render a row. */
export interface PatientCoverageEntry {
  /** Normalized DNI — same key used by `UnifiedPerson.dni`. */
  dni: string;
  /** Human-readable patient name (mirrors `UnifiedPerson.nombre`). */
  nombrePaciente: string;
}

/** Result for a single document section (CAMO or EMO). */
export interface DocumentCoverageSection {
  state: DocumentCoverageState;
  with: ReadonlyArray<PatientCoverageEntry>;
  without: ReadonlyArray<PatientCoverageEntry>;
}

/** Top-level result covering both CAMO and EMO independently. */
export interface AggregatedDocumentStatus {
  camo: DocumentCoverageSection;
  emo: DocumentCoverageSection;
}

/**
 * True when the status is a settled "yes" for the requested document.
 * `loading`, `error`, or a missing entry are all treated as "no" (the
 * patient is counted as `without` for that document).
 */
function hasDocument(
  status: LegajosRowStatus | undefined,
  field: 'hasCamo' | 'hasEmo',
): boolean {
  if (!status) return false;
  if (status.loading) return false;
  if (status.error) return false;
  return status[field] === true;
}

/**
 * Section state is derived from the with/without counts:
 *   - 0 patients have it (empty batch OR everyone lacks it) → VACIO
 *   - 0 patients lack it (everyone has it) → COMPLETO
 *   - both lists non-empty → PARCIAL
 */
function resolveSectionState(
  withCount: number,
  withoutCount: number,
): DocumentCoverageState {
  if (withCount === 0) return 'VACIO';
  if (withoutCount === 0) return 'COMPLETO';
  return 'PARCIAL';
}

function toEntry(person: UnifiedPerson): PatientCoverageEntry {
  return { dni: person.dni, nombrePaciente: person.nombre };
}

/**
 * Build a single document section (CAMO or EMO) by OR-merging each
 * patient's fichas. Fichas with an empty `idAten` are skipped (they
 * have no `statuses` entry to look up).
 */
function aggregateSection(
  people: ReadonlyArray<UnifiedPerson>,
  statuses: Readonly<Record<string, LegajosRowStatus>>,
  field: 'hasCamo' | 'hasEmo',
): DocumentCoverageSection {
  const withDoc: PatientCoverageEntry[] = [];
  const withoutDoc: PatientCoverageEntry[] = [];

  for (const person of people) {
    const has = person.fichas.some(
      (ficha) => ficha.idAten !== '' && hasDocument(statuses[ficha.idAten], field),
    );

    const entry = toEntry(person);
    if (has) withDoc.push(entry);
    else withoutDoc.push(entry);
  }

  return {
    state: resolveSectionState(withDoc.length, withoutDoc.length),
    with: withDoc,
    without: withoutDoc,
  };
}

/**
 * Aggregate per-ficha CAMO/EMO statuses into the per-patient coverage
 * summary consumed by `DocumentVerificationModal`.
 *
 * @param statuses The map from `idAten` to its `LegajosRowStatus`, as
 *   produced by `useLegajosStatus().statuses`. Fichas without an entry
 *   in the map are treated as lacking both documents.
 * @param people The list of patients as resolved by
 *   `useUnifiedResults().people`. One entry per person (DNI); multi-ficha
 *   patients are collapsed via OR-merge.
 */
export function aggregateDocumentStatuses(
  statuses: Readonly<Record<string, LegajosRowStatus>>,
  people: ReadonlyArray<UnifiedPerson>,
): AggregatedDocumentStatus {
  return {
    camo: aggregateSection(people, statuses, 'hasCamo'),
    emo: aggregateSection(people, statuses, 'hasEmo'),
  };
}
