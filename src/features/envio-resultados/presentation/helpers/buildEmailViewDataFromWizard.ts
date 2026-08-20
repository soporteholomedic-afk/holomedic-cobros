/**
 * PR envio-resultados CAMO/EMO wizard — WU-3.1.
 *
 * `buildEmailViewDataFromWizard` is the pure helper that maps the
 * wizard's per-patient picks (CAMO + EMO maps) into the
 * `{ selectedPatients, fileRefs }` shape `EmailEditor` expects.
 *
 * The wizard is the multi-patient counterpart of the per-row
 * `emailViewDataFromFiles` bridge. The legacy bridge carries
 * `patients: Patient[]` for the AttachmentList; the wizard path
 * carries only `{ selectedPatients, fileRefs }` (the AttachmentList
 * is not exercised in the wizard flow — that is a known scope
 * limitation, not a bug). The wizard shell composes the full
 * `EmailViewData` for `onContinueToEmail` by enriching this partial
 * with `companyId`/`companyName`/`nombreCompleto`/`destino`.
 *
 * Spec coverage (from `sdd/envio-resultados-camo-emo/spec`):
 *  - REQ-007 — Step 4 Resumen handoff.
 *  - REQ-009 — SelectedFileRef.tipoExamen populated on every ref.
 *  - Scenario S-011 (summary row), S-012 (handoff payload).
 */
import type { SelectedFileRef } from '../../domain/entities';
import type { WizardFilePick } from '../hooks/useEnvioWizard';
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
   * Always present for every dni in `selectedDnIs` (even when both
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
  /** Per-dni CAMO pick; `null` = Saltar; `undefined` = not yet picked. */
  camoByDni: Readonly<Record<string, WizardFilePick>>;
  /** Per-dni EMO pick; `null` = Saltar; `undefined` = not yet picked. */
  emoByDni: Readonly<Record<string, WizardFilePick>>;
  /** The full people list (used to resolve `patientName` per dni). */
  people: ReadonlyArray<UnifiedPerson>;
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
      // from `selectedPatients`. The pick map may still carry refs
      // for it — push them to `fileRefs` so the LAN-share file
      // is still attached (the ref shape is self-describing).
      // PR-2 (REQ-8): preserve an existing stamp (`ref.tipoExamen ?? 'CAMO'`)
      // — a pick already stamped 'ADICIONAL' by the wizard step must
      // survive the email build (S-13), never overwritten by a hardcoded
      // 'CAMO'/'EMO'.
      const strayCamo = input.camoByDni[dni];
      const strayEmo = input.emoByDni[dni];
      if (strayCamo) {
        fileRefs.push({ ...strayCamo.ref, tipoExamen: strayCamo.ref.tipoExamen ?? 'CAMO' });
      }
      if (strayEmo) {
        fileRefs.push({ ...strayEmo.ref, tipoExamen: strayEmo.ref.tipoExamen ?? 'EMO' });
      }
      continue;
    }

    const camo = input.camoByDni[dni];
    const emo = input.emoByDni[dni];
    const files: string[] = [];

    if (camo) {
      files.push(camo.displayName);
      fileRefs.push({
        ...camo.ref,
        tipoExamen: camo.ref.tipoExamen ?? 'CAMO',
        // Per-ref patient name (multi-patient fix): the use-case
        // rename prefers this over the request-level scalar.
        nombreCompleto: person.nombre,
      });
    }
    if (emo) {
      files.push(emo.displayName);
      fileRefs.push({
        ...emo.ref,
        tipoExamen: emo.ref.tipoExamen ?? 'EMO',
        nombreCompleto: person.nombre,
      });
    }

    // The patient entry is always present — even when `files` is
    // empty — so the EmailEditor can show the recipient + render
    // the "no files" warning when both picks are null.
    selectedPatients[dni] = { patientName: person.nombre, files };
  }

  return { selectedPatients, fileRefs };
}
