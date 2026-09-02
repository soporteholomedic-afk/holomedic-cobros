import type { Patient, SelectedFileRef } from '../../domain/entities';
import { parseReadyFile } from '../../domain/ready-files/parseReadyFile';
import { renameReadyFile } from '../../domain/ready-files/renameReadyFile';
import {
  looksLikeGeneratedCertificate,
  renameGeneratedCertificate,
} from '../../domain/generated-files/renameGeneratedCertificate';
import {
  validateDeliveryName,
  type DeliveryNameIssue,
} from '../../domain/attachments/validateDeliveryName';

/**
 * One rename row for `AttachmentList` (WU-4, design §Presentation):
 * the pure projection of a display file onto its send-payload ref,
 * carrying everything the composer needs to render the effective
 * delivery name (REQ-01) and the rename affordance.
 */
export interface AttachmentRenameItem {
  /**
   * Composite key of the matched `SelectedFileRef`
   * (`ruc::dni::idAten::path::name`, the `splitFileRef` convention) —
   * the key `AttachmentList.onRename(refKey, next)` and the
   * `nameOverrides` state are addressed by. `null` for a display row
   * with no matching ref (safe no-op: not editable, never merged).
   */
  refKey: string | null;
  /** Label the row already shows today (PatientFile name, else basename). */
  displayName: string;
  /** Disk name the file is read by — never changed by a rename (REQ-06). */
  storedName: string;
  /**
   * What the operator sees as the final attachment name: the validated
   * override when present, else the auto preview (REQ-01). Mirrors the
   * server precedence in `sendResults.ts` (`override ??
   * renameReadyFile ?? renameGeneratedCertificate`).
   */
  effectiveName: string;
  /** True when a validated, non-empty override applies. */
  overridden: boolean;
  /**
   * Rejected-override signal for the blocking red chip (REQ-03): the
   * shared validator's typed issue. `null` when the override is valid
   * or absent — the effective name is then always deliverable.
   */
  issue: DeliveryNameIssue | null;
}

/** Selection shape of `EmailEditor.selectedPatients` (readonly view). */
export type SelectedPatientsMap = Readonly<
  Record<string, { patientName: string; files: readonly string[] }>
>;

/**
 * Recompose a ref into the display id the FilesModal flow uses:
 * `PatientFile.id === ${folderPath}::${name}` with `''` folder for root
 * (`splitFileRef` convention — root refs display as `::name`).
 */
function recomposeFileRef(ref: SelectedFileRef): string {
  return `${ref.path}::${ref.name}`;
}

/** Display row → file basename (`path::name` composites strip the path). */
function basenameOf(display: string): string {
  const idx = display.indexOf('::');
  return idx < 0 ? display : display.slice(idx + 2);
}

/**
 * Composite key of a `SelectedFileRef`
 * (`ruc::dni::idAten::path::name` — the `splitFileRef` convention).
 *
 * WU-5 refactor: this join IS the addressing contract between the
 * matcher, the composer's `nameOverrides` state and its
 * `fileRefs`-merge — it lives here (the module that introduced the
 * refKey concept) so the three surfaces cannot drift.
 */
export function refKeyOf(ref: SelectedFileRef): string {
  return [ref.ruc, ref.dni, ref.idAten, ref.path, ref.name].join('::');
}

/**
 * Row label: the PatientFile name when the display row resolves inside
 * `patients`, else the basename of the raw display string (wizard flow,
 * unmatched rows).
 */
function displayNameFor(
  display: string,
  patient: Patient | undefined,
): string {
  return patient?.files.find((f) => f.id === display)?.name ?? basenameOf(display);
}

/**
 * The D5 predicate pair, shared with the server's step-1c: an override
 * on a ready file or a CLI generated certificate is FORCED to end in
 * `.pdf`. Both exports are browser-safe since D3.
 */
function forcePdfFor(ref: SelectedFileRef): boolean {
  return parseReadyFile(ref.name) !== null || looksLikeGeneratedCertificate(ref.name);
}

/**
 * Auto-name preview for a ref — the client mirror of the use case's
 * auto branch (sendResults.ts `resolveDeliveryNames`): the dual rename
 * `renameReadyFile` → `renameGeneratedCertificate`, with per-ref
 * `nombreCompleto`/`proyecto` winning over the request-level scalars.
 *
 * Divergence note: the server first passes the name through
 * `safeDisplayName` (node:path sanitisation, server-only). For every
 * real share filename that sanitisation is the identity — and names it
 * would change are already unreachable on the Windows share — so the
 * preview uses `ref.name` directly to stay client-importable.
 */
function autoDeliveryName(
  ref: SelectedFileRef,
  fallbackNombreCompleto: string,
  fallbackDestino: string,
): string {
  const rawName = ref.name;
  const nombreCompleto = ref.nombreCompleto?.trim() || fallbackNombreCompleto;
  const readyName = renameReadyFile({
    rawName,
    nombreCompleto,
    destino: ref.proyecto?.trim() || fallbackDestino,
    tipoExamen: ref.tipoExamen,
  });
  return readyName === rawName
    ? renameGeneratedCertificate({ rawName, nombreCompleto, tipoExamen: ref.tipoExamen })
    : readyName;
}

/**
 * Effective name + flags for a matched ref (REQ-01 semantics, shared
 * validator): live override (by refKey) wins over the reenvío-stamped
 * `ref.deliveryName`; an empty/whitespace value means "no override"
 * (auto fallback); an invalid value keeps the auto preview but carries
 * the typed issue for the blocking red chip (REQ-03).
 */
function resolveEffective(
  ref: SelectedFileRef,
  liveOverride: string | undefined,
  fallbackNombreCompleto: string,
  fallbackDestino: string,
): { effectiveName: string; overridden: boolean; issue: DeliveryNameIssue | null } {
  const auto = autoDeliveryName(ref, fallbackNombreCompleto, fallbackDestino);
  const rawOverride = liveOverride !== undefined ? liveOverride : ref.deliveryName;
  if (rawOverride === undefined) {
    return { effectiveName: auto, overridden: false, issue: null };
  }
  const check = validateDeliveryName(rawOverride, { forcePdf: forcePdfFor(ref) });
  if (!check.ok) {
    return { effectiveName: auto, overridden: false, issue: check.issue };
  }
  if (check.value === '') {
    return { effectiveName: auto, overridden: false, issue: null };
  }
  return { effectiveName: check.value, overridden: true, issue: null };
}

/**
 * Match every display file row to its send-payload ref and project the
 * rename items `AttachmentList` renders (WU-4, design §Presentation).
 *
 * Matching, per patient row (keyed by dni in both flows):
 * 1. PRIMARY — exact `path::name` composite (FilesModal flow, where
 *    `PatientFile.id === ${folderPath}::${name}`).
 * 2. FALLBACK — ref basename within the same dni (wizard flow, where
 *    display rows are bare `pick.displayName` basenames and `patients`
 *    is `[]`; this helper never depends on `patients` being populated).
 * 3. Positional disambiguation — duplicate basenames for one dni are
 *    consumed in order (nth display row → nth ref), per the WU-1.4
 *    finding.
 *
 * A row with no ref match surfaces as a safe no-op item (`refKey:
 * null`, identity names) instead of being dropped. Pure — no React,
 * no I/O — so the composer can call it inside `useMemo`.
 */
export function buildAttachmentRenameItems(
  fileRefs: readonly SelectedFileRef[],
  selectedPatients: SelectedPatientsMap,
  patients: readonly Patient[],
  overrides: Readonly<Record<string, string>>,
  nombreCompleto: string,
  destino: string,
): AttachmentRenameItem[] {
  const items: AttachmentRenameItem[] = [];

  for (const [patientId, selection] of Object.entries(selectedPatients)) {
    // Candidate refs for THIS patient, kept in payload order so the
    // positional fallback is deterministic.
    const candidates = fileRefs
      .map((ref, index) => ({ ref, index }))
      .filter(({ ref }) => ref.dni === patientId);
    const consumed = new Set<number>();

    const patient = patients.find((p) => p.id === patientId);

    for (const display of selection.files) {
      const matched = candidates.find(
        ({ ref, index }) =>
          !consumed.has(index) && recomposeFileRef(ref) === display,
      ) ??
        candidates.find(
          ({ ref, index }) => !consumed.has(index) && ref.name === display,
        );

      if (!matched) {
        items.push({
          refKey: null,
          displayName: displayNameFor(display, patient),
          storedName: basenameOf(display),
          effectiveName: basenameOf(display),
          overridden: false,
          issue: null,
        });
        continue;
      }

      consumed.add(matched.index);
      items.push({
        refKey: refKeyOf(matched.ref),
        displayName: displayNameFor(display, patient),
        storedName: matched.ref.name,
        ...resolveEffective(matched.ref, overrides[refKeyOf(matched.ref)], nombreCompleto, destino),
      });
    }
  }

  return items;
}
