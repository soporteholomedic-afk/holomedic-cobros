import type { Patient, PatientFile, SelectedFileRef } from '../../domain/entities';
import type { FileNode } from '../../domain/file-system/FileNode';
import type { UnifiedPerson, UnifiedFicha } from '@/types/sp-result';

const PDF_MIME = 'application/pdf';

/**
 * Split a `fileRef` into its two constituents: the relative folder path
 * (empty string for root) and the file basename. A single `::` is the
 * canonical separator; everything before it is the folder and everything
 * after is the name.
 *
 * Defensive: a ref without `::` is treated as a root ref with the
 * whole string as the name (so the bridge doesn't drop the selection
 * if a future caller forgets the prefix).
 */
function splitFileRef(ref: string): { path: string; name: string } {
  const idx = ref.indexOf('::');
  if (idx < 0) return { path: '', name: ref };
  return { path: ref.slice(0, idx), name: ref.slice(idx + 2) };
}

/**
 * Shape returned to `EmailEditor`. Mirrors `EmailEditorProps` so the
 * caller can spread the result directly: `<EmailEditor {...bridged} />`.
 */
export interface EmailViewData {
  companyId: string;
  companyName: string;
  selectedPatients: {
    [patientId: string]: { patientName: string; files: string[] };
  };
  patients: Patient[];
  /**
   * PR #1 — send-payload side of the bridge. Carries the LAN-share
   * location triple (`ruc`/`dni`/`idAten`) plus the relative `path`
   * and `name` that `IFileRepository.read` needs. `PatientFile`
   * (display) is preserved unchanged; `SelectedFileRef` is the
   * wire-shape the route consumes in PR #2.
   */
  fileRefs: SelectedFileRef[];
}

/**
 * Build the `EmailEditor` payload from a `FilesModal` selection.
 *
 * `refs[i]` is the `fileRef` the modal stored in its
 * `Map<fileRef, FileNode>` — `${folderPath}::${name}` — and the same
 * string becomes `PatientFile.id`. The caller must build `refs` in the
 * same order as `selected` (typically by iterating `Map.entries()`).
 */
export function emailViewDataFromFiles(
  person: UnifiedPerson,
  ficha: UnifiedFicha | null,
  selected: FileNode[],
  refs: readonly string[],
  companyId: string,
  companyName: string,
): EmailViewData {
  if (selected.length !== refs.length) {
    throw new Error('emailViewDataFromFiles: `selected` and `refs` must be parallel arrays of equal length');
  }

  const patientId = person.dni;
  const files: PatientFile[] = selected.map((node, i) => ({
    id: refs[i] as string,
    patientId,
    name: node.name,
    type: PDF_MIME,
    size: node.sizeBytes,
  }));

  // PR #1 — derive `path` from each ref (`""` for root) and stamp the
  // location triple from `ficha` + `person`. Worker-only persons
  // (no ficha) carry empty strings for ruc/dni/idAten.
  const fileRefs: SelectedFileRef[] = refs.map((ref) => {
    const { path, name } = splitFileRef(ref);
    return {
      ruc: ficha?.nroRuc ?? '',
      dni: person.dni,
      idAten: ficha?.idAten ?? '',
      path,
      name,
    };
  });

  return {
    companyId,
    companyName,
    selectedPatients: {
      [patientId]: {
        patientName: person.nombre,
        files: refs.slice(),
      },
    },
    patients: [
      {
        id: patientId,
        companyId,
        name: person.nombre,
        dni: person.dni,
        files,
      },
    ],
    fileRefs,
  };
}
