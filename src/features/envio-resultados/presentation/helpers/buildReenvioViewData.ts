import type {
  EnvioHistoryRow,
  Patient,
  PatientFile,
  SelectedFileRef,
} from '../../domain/entities';
import type { EmailViewData } from './emailViewDataFromFiles';

/**
 * historial-envios-consolidados PR4 (task 4.3, design OQ6) — pure mapper
 * that reconstructs the `EmailEditor` payload from a persisted history
 * row (`EnvioHistoryRow`, fetched by id from `/api/consolidados/envios/[id]`).
 *
 * Mapping contract (OQ6):
 *  - `unc` snapshot entries → `SelectedFileRef` (`name = storedName`;
 *    `tipoExamen`/`nombreCompleto`/`proyecto` are carried so
 *    `renameReadyFile` reproduces the auto delivery names, and the
 *    persisted `deliveryName` is stamped onto the ref verbatim — WU-7,
 *    D8: the editor's seed-once logic decides whether it pre-fills an
 *    editable override) grouped by `dni` into `selectedPatients`
 *    (`files: ['path::storedName']`) and `patients`
 *    (`PatientFile.id = 'path::storedName'`, the `splitFileRef`
 *    contract from `emailViewDataFromFiles`).
 *  - `local` snapshot entries → `unavailableAttachments` ONLY (BR11 —
 *    metadata-only, never re-attachable).
 *  - `selectedPatients` is never left absent: it is derived from the
 *    persisted attachments (an empty object for local-only rows — the
 *    editor's relaxed Send disable covers that case).
 */

/** Recipients/subject/body seed for the `EmailEditor` overlay (OQ5). */
export interface InitialEmail {
  to: string;
  cc?: string;
  subject: string;
  /** Verbatim persisted body (signature sentinels included); the editor seeds through `stripSignatureHtml` (D8). */
  bodyHtml: string;
}

/** Metadata-only local attachment from the original send (BR11). */
export interface UnavailableAttachment {
  filename: string;
  contentType?: string;
  sizeBytes?: number;
}

export interface ReenvioViewData {
  emailViewData: EmailViewData;
  initialEmail: InitialEmail;
  unavailableAttachments: UnavailableAttachment[];
}

/** UNC ready files are PDFs (metadata-only snapshot carries no mime). */
const PDF_MIME = 'application/pdf';

export function buildReenvioViewData(row: EnvioHistoryRow): ReenvioViewData {
  const selectedPatients: EmailViewData['selectedPatients'] = {};
  const patients: Patient[] = [];
  const fileRefs: SelectedFileRef[] = [];
  const unavailableAttachments: UnavailableAttachment[] = [];

  for (const attachment of row.attachments) {
    if (attachment.source === 'local') {
      unavailableAttachments.push({
        filename: attachment.storedName,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
      });
      continue;
    }

    // WU-7 (D8/REQ-05) — the persisted delivery name is stamped onto
    // the ref VERBATIM: it is the operator override that produced the
    // original send. Stamping here is unconditional; whether the value
    // materializes as an editable pre-fill is the editor's seed-once
    // decision (it compares the stamp against the recomputed auto name
    // via the shared `autoDeliveryName` oracle). Legacy rows persisted
    // before the deliveryName snapshot existed may omit the key at
    // runtime despite the write-side type — no stamp, legacy behavior
    // (REQ-07).
    const ref: SelectedFileRef = {
      ruc: attachment.ruc,
      dni: attachment.dni,
      idAten: attachment.idAten,
      path: attachment.path,
      name: attachment.storedName,
      ...(attachment.tipoExamen ? { tipoExamen: attachment.tipoExamen } : {}),
      ...(attachment.nombreCompleto ? { nombreCompleto: attachment.nombreCompleto } : {}),
      // S-107.2 — the per-ref project feeds the auto recompute too;
      // without it the editor could mistake an auto name for an
      // override when the ref's project differs from the row destino.
      ...(attachment.proyecto ? { proyecto: attachment.proyecto } : {}),
    };
    if (attachment.deliveryName !== undefined) {
      ref.deliveryName = attachment.deliveryName;
    }
    fileRefs.push(ref);

    // Mirror the emailViewDataFromFiles contract: the fileRef string
    // `${path}::${name}` doubles as the PatientFile.id.
    const refId = `${attachment.path}::${attachment.storedName}`;
    const patientName =
      attachment.nombreCompleto?.trim() || row.nombreCompleto.trim() || attachment.dni;

    let patient = patients.find((p) => p.id === attachment.dni);
    if (!patient) {
      selectedPatients[attachment.dni] = { patientName, files: [] };
      patient = {
        id: attachment.dni,
        companyId: row.companyId,
        name: patientName,
        dni: attachment.dni,
        files: [],
      };
      patients.push(patient);
    }
    selectedPatients[attachment.dni].files.push(refId);
    const displayFile: PatientFile = {
      id: refId,
      patientId: attachment.dni,
      name: attachment.storedName,
      type: PDF_MIME,
      // Byte size is not persisted for unc refs (metadata-only snapshot);
      // AttachmentList renders names only.
      size: 0,
    };
    patient.files.push(displayFile);
  }

  return {
    emailViewData: {
      companyId: row.companyId,
      companyName: row.companyName,
      selectedPatients,
      patients,
      fileRefs,
      nombreCompleto: row.nombreCompleto,
      destino: row.destino,
    },
    initialEmail: {
      to: row.toRecipients.join(', '),
      cc: row.ccRecipients.length > 0 ? row.ccRecipients.join(', ') : undefined,
      subject: row.subject,
      bodyHtml: row.bodyHtml,
    },
    unavailableAttachments,
  };
}
