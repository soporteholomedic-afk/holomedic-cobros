/**
 * `buildEmailViewDataFromWizard` is the pure helper that maps the
 * wizard's per-ficha picks (CAMO + EMO maps keyed `dni::idAten`)
 * into the `{ selectedPatients, fileRefs }` shape `EmailEditor`
 * expects.
 *
 * Multi-proyecto change (REQ-108, design D6): for every resolved
 * person the helper iterates that person's `fichas` (stable order —
 * the first-appearance order the rest of the pipeline relies on)
 * and looks up `pickKey(dni, ficha.idAten)` in both maps. One
 * patient with picks on N fichas flattens into N fileRefs with
 * distinct idAten. Each resolved ref is stamped with its ficha's
 * `proyecto` (REQ-104, D6 — empty → undefined, request-level
 * destino applies). Stray picks (the dni disappeared from `people`,
 * e.g. a mid-wizard refetch) still attach, passing through
 * UNSTAMPED — no fabrication.
 *
 * Spec coverage:
 *  - REQ-108 — S-108.1 multi-ref flattening, legacy flow unchanged.
 *  - Legacy REQ-007 — handoff payload (S-012), REQ-009 tipoExamen,
 *    ADICIONAL stamp preservation (S-13).
 */
import type { SelectedFileRef } from '../../domain/entities';
import { pickKey, type WizardFilePick } from '../hooks/useEnvioWizard';
import type { UnifiedPerson } from '@/types/sp-result';

/**
 * Output of `buildEmailViewDataFromWizard`. The wizard shell
 * composes the full `EmailViewData` (from
 * `helpers/emailViewDataFromFiles`) on top of this shape before
 * handing it to `EmailEditor`.
 */
export interface WizardEmailViewData {
  /**
   * Per-patient label for the EmailEditor recipient list + the
   * attachment panel. `files` is the basename array (e.g.
   * `['75618561CERT.pdf', '75618561EXPED.pdf']`) — the fileRef
   * entries (with the LAN-share location triple) live in `fileRefs`.
   * Always present for every dni in `selectedDnIs` (even when all
   * picks are null/undefined — the EmailEditor surfaces a "no
   * files" warning for those patients).
   */
  selectedPatients: Record<string, { patientName: string; files: string[] }>;
  /**
   * Flat array of every picked file across every patient, with
   * `tipoExamen` set on every entry (`'CAMO'` for CAMO picks,
   * `'EMO'` for EMO picks). The use-case rename (`sendResults.ts:181`)
   * prefers this field over the tipo inferred from `name` via
   * `parseReadyFile`. Skipped picks (null / undefined) are NOT
   * pushed here.
   */
  fileRefs: SelectedFileRef[];
}

export interface BuildEmailViewDataInput {
  /** DNIs the operator picked at Step 1. Drives the iteration order. */
  selectedDnIs: ReadonlySet<string>;
  /** CAMO picks keyed by `pickKey(dni, idAten)`; `null` = Saltar. */
  camoPicks: Readonly<Record<string, WizardFilePick>>;
  /** EMO picks keyed by `pickKey(dni, idAten)`; `null` = Saltar. */
  emoPicks: Readonly<Record<string, WizardFilePick>>;
  /** The full people list (used to resolve `patientName` per dni). */
  people: ReadonlyArray<UnifiedPerson>;
}

/** All non-null picks under `dni::` (stray-branch prefix scan). */
function strayPicks(
  record: Readonly<Record<string, WizardFilePick>>,
  dni: string,
): NonNullable<WizardFilePick>[] {
  const picks: NonNullable<WizardFilePick>[] = [];
  const prefix = `${dni}::`;
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith(prefix) && value !== null) picks.push(value);
  }
  return picks;
}

/**
 * Build the `{ selectedPatients, fileRefs }` payload the wizard
 * hands to the `EmailEditor` overlay. Pure — no I/O, no React,
 * no `useState`. The wizard shell wraps the result with
 * `companyId`/`companyName`/`nombreCompleto`/`destino` to produce
 * the full `EmailViewData` the route expects.
 */
export function buildEmailViewDataFromWizard(
  input: BuildEmailViewDataInput,
): WizardEmailViewData {
  const selectedPatients: Record<string, { patientName: string; files: string[] }> = {};
  const fileRefs: SelectedFileRef[] = [];

  for (const dni of input.selectedDnIs) {
    const person = input.people.find((p) => p.dni === dni);
    if (!person) {
      // Defensive: a dni in `selectedDnIs` that is no longer in
      // `people` (e.g. the table refetched mid-wizard) is dropped
      // from `selectedPatients`. The pick maps may still carry refs
      // for it — push them to `fileRefs` so the LAN-share file
      // is still attached (the ref shape is self-describing).
      // PR-2 (REQ-8): preserve an existing stamp (`ref.tipoExamen ?? 'CAMO'`)
      // — a pick already stamped 'ADICIONAL' by the wizard step must
      // survive the email build (S-13), never overwritten by a hardcoded
      // 'CAMO'/'EMO'. Strays are NOT stamped with `nombreCompleto`.
      for (const pick of strayPicks(input.camoPicks, dni)) {
        fileRefs.push({ ...pick.ref, tipoExamen: pick.ref.tipoExamen ?? 'CAMO' });
      }
      for (const pick of strayPicks(input.emoPicks, dni)) {
        fileRefs.push({ ...pick.ref, tipoExamen: pick.ref.tipoExamen ?? 'EMO' });
      }
      continue;
    }

    // Per-ficha flattening (D6): iterate the person's fichas in
    // stable order; each ficha contributes its CAMO pick then its
    // EMO pick (parallel to the legacy per-patient order).
    const files: string[] = [];
    for (const ficha of person.fichas) {
      const key = pickKey(dni, ficha.idAten);
      const camo = input.camoPicks[key];
      const emo = input.emoPicks[key];

      if (camo) {
        files.push(camo.displayName);
        fileRefs.push({
          ...camo.ref,
          tipoExamen: camo.ref.tipoExamen ?? 'CAMO',
          // Per-ref patient name (multi-patient fix): the use-case
          // rename prefers this over the request-level scalar.
          nombreCompleto: person.nombre,
          // Per-ref project (REQ-104, D6): the use-case rename
          // prefers this over the request-level `destino`. Empty
          // ficha proyecto → undefined (request-level applies).
          proyecto: ficha.proyecto || undefined,
        });
      }
      if (emo) {
        files.push(emo.displayName);
        fileRefs.push({
          ...emo.ref,
          tipoExamen: emo.ref.tipoExamen ?? 'EMO',
          nombreCompleto: person.nombre,
          proyecto: ficha.proyecto || undefined,
        });
      }
    }

    // The patient entry is always present — even when `files` is
    // empty — so the EmailEditor can show the recipient + render
    // the "no files" warning when all picks are null.
    selectedPatients[dni] = { patientName: person.nombre, files };
  }

  return { selectedPatients, fileRefs };
}
