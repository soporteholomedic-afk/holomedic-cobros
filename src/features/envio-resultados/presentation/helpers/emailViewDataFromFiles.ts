import type { Patient, PatientFile } from '../../domain/entities';
import type { FileNode } from '../../domain/file-system/FileNode';
import type { UnifiedPerson, UnifiedFicha } from '@/types/sp-result';

const PDF_MIME = 'application/pdf';

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
  _ficha: UnifiedFicha | null,
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
  };
}
