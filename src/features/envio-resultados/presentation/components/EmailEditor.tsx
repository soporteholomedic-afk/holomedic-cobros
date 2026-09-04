'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { SpitchSelector } from './SpitchSelector';
import { AttachmentList, type AttachmentRenameItemView } from './AttachmentList';
import { LocalFileDropZone } from './LocalFileDropZone';
import { EmailPreviewPanel } from '@/components/email/EmailPreviewPanel';
import { EmailControlsPanel } from '@/components/email/EmailControlsPanel';
import { EmailBodyField } from '@/components/email/EmailBodyField';
import { useSendResults } from '../hooks/useSendResults';
import { interpolateSpitch } from '../helpers/interpolateSpitch';
import { stripSignatureHtml } from '../helpers/signatureData';
import { buildAttachmentRenameItems, refKeyOf, autoDeliveryName } from '../helpers/buildAttachmentRenameItems';
import { deliveryNameIssueText } from '../helpers/deliveryNameIssueText';
import { validateDeliveryName, findDeliveryNameCollisions, type DeliveryNameIssue } from '../../domain/attachments/validateDeliveryName';
import { useFirmaCorreo } from '@/features/firma-correo/presentation/hooks/useFirmaCorreo';
import { replaceFirmaFallback } from '@/features/firma-correo/presentation/helpers/replaceFirmaFallback';
import { showSendLoading, showSendSuccess, showSendError } from '../helpers/sendToasts';
import type { InitialEmail, UnavailableAttachment } from '../helpers/buildReenvioViewData';
import type { Patient, PatientFile, SelectedFileRef, Spitch } from '../../domain/entities';
import type { EmailBodyEditorHandle } from './EmailBodyEditor';

const EmailBodyEditorLazy = lazy(() =>
  import('./EmailBodyEditor').then((m) => ({ default: m.EmailBodyEditor })),
);

/**
 * WU-5 — stable empty override map for the auto-name preview memo, so
 * the byte-equal no-override projection never invalidates while the
 * operator types (REQ-01 placeholder contract).
 */
const EMPTY_NAME_OVERRIDES: Readonly<Record<string, string>> = {};

/**
 * WU-7 (D8/REQ-05) — seed-once reenvío override state: derive the
 * initial `nameOverrides` from reenvío-stamped `ref.deliveryName`
 * values at FIRST RENDER only (same lifecycle as `initialEmail` — no
 * effects, no new prop; the seed touches ONLY this LAN override map).
 *
 * A stamp DIFFERING from the recomputed auto name seeds the raw
 * persisted value → an editable pre-fill (REQ-05 scenario 1). A stamp
 * EQUAL to the auto name seeds the EMPTY string: a live '' outranks
 * the stamp in the matcher (WU-4 contract), so the row renders as
 * no-override (empty input, auto placeholder) and `effectiveFileRefs`
 * drops the redundant field — the server recomputes the same name on
 * an untouched resend (byte-identical, REQ-05 scenario 2 + D8) and
 * same-name autos keep their allowed auto-auto warning semantics (D6).
 * Refs without a stamp seed nothing — fresh flows unchanged.
 */
function seedNameOverrides(
  fileRefs: readonly SelectedFileRef[],
  nombreCompleto: string,
  destino: string,
): Record<string, string> {
  const seeds: Record<string, string> = {};
  for (const ref of fileRefs) {
    if (ref.deliveryName === undefined) continue;
    const isAuto = ref.deliveryName === autoDeliveryName(ref, nombreCompleto, destino);
    seeds[refKeyOf(ref)] = isAuto ? '' : ref.deliveryName;
  }
  return seeds;
}

interface EmailEditorProps {
  companyId: string;
  companyName: string;
  selectedPatients: {
    [patientId: string]: {
      patientName: string;
      files: string[];
    };
  };
  patients: Patient[];
  /**
   * PR #3 — wired to `useSendResults`. Carries the LAN-share
   * location triple (`ruc`/`dni`/`idAten`) plus the relative `path`
   * and `name` for each selected file. WorkerDetailTable forwards
   * `emailViewData.fileRefs`.
   */
  fileRefs?: SelectedFileRef[];
  /** Full patient name for ready-file rename in delivery. */
  nombreCompleto?: string;
  /** Destino (DesDes / proyecto) for ready-file rename in delivery. */
  destino?: string;
  /**
   * PR #3 (WU-3.2) — Optional back button. Renders a back button
   * inside the editor when `onBack` is provided. `backContext`
   * picks the label:
   *   - `'table'`  → "Volver a la tabla" (legacy per-row path)
   *   - `'wizard'` → "Volver al paso 4" (wizard → email round-trip)
   * The button is conditional on `onBack` being a function so the
   * standalone `page.tsx` caller (which renders its own wrapper
   * back button) does not get a duplicate (R5 mitigation).
   */
  backContext?: 'table' | 'wizard';
  onBack?: () => void;
  /**
   * historial-envios-consolidados PR4 (OQ5) — optional reenvío seed.
   * Seeds the existing useState initializers once at mount: to/cc/
   * subject verbatim, bodyHtml through `stripSignatureHtml` so the
   * appended signature is never duplicated on re-send (D8). No effects.
   */
  initialEmail?: InitialEmail;
  /**
   * Metadata-only local attachments from the original send (BR11) —
   * rendered as a grey reference-only list near the drop zone; they
   * never re-enter the send pipeline.
   */
  unavailableAttachments?: UnavailableAttachment[];
}

export function EmailEditor({
  // Threaded into `useSendResults` so the send-results route can
  // persist the company attribution on the history row
  // (historial-envios-consolidados PR1).
  companyId,
  companyName,
  selectedPatients,
  patients,
  // PR #3 — forwarded to the hook. `PatientFile` (display) is still
  // derived locally for `AttachmentList` via `selectedFiles`; the
  // two stay in parallel.
  fileRefs = [],
  nombreCompleto = '',
  destino = '',
  // PR #3 (WU-3.2) — back button. Defaults to the table label.
  // The button is rendered only when `onBack` is provided (the
  // `page.tsx` standalone caller omits it and renders its own
  // wrapper button).
  backContext = 'table',
  onBack,
  initialEmail,
  unavailableAttachments = [],
}: EmailEditorProps) {
  // editor-firmas PR4 — the signature is composed SERVER-SIDE from the
  // sender's stored fields (GET /api/plantillas/firma) and inlined at
  // {{firma}} by the token resolver. Empty firmaHtml → the resolver's
  // `[Falta configurar firma]` fallback (contract unchanged).
  const { firmaHtml } = useFirmaCorreo();

  // Internal state
  const [target, setTarget] = useState<'company' | 'patient'>('company');
  const [selectedSpitch, setSelectedSpitch] = useState<Spitch | null>(null);
  // PR4 (OQ5) — reenvío seeds the initializers directly (no effects):
  // the legacy appended signature is stripped so historical rows never
  // resurface it (stripSignatureHtml keeps working on old persisted
  // bodies only).
  const [subject, setSubject] = useState(initialEmail?.subject ?? '');
  const [bodyHtml, setBodyHtml] = useState(() =>
    initialEmail ? stripSignatureHtml(initialEmail.bodyHtml) : '',
  );

  const [showNoFilesWarning, setShowNoFilesWarning] = useState(false);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  /**
   * WU-6 (REQ-02) — raw local rename input per row index. Mirrors the
   * LAN `nameOverrides` flow: the operator's input is never trusted —
   * it is validated at render through the shared validator and only
   * the validated value reaches the send payload (`effectiveLocalFiles`).
   * Index-keyed; `handleLocalRemove` re-keys the map in lockstep.
   */
  const [localNameOverrides, setLocalNameOverrides] = useState<Record<number, string>>({});
  const [isEditingBody, setIsEditingBody] = useState(false);
  const editorRef = useRef<EmailBodyEditorHandle>(null);
  const hasSent = useRef(false);
  // PR4 — true only when mounted with an `initialEmail` seed; released
  // after the first (auto-)select is swallowed. See handleSpitchSelect.
  const swallowAutoSelectRef = useRef(Boolean(initialEmail));

  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Determine recipients based on selected patients
  const recipientNames = Object.values(selectedPatients).map((s) => s.patientName);

  // Editable email fields — pre-filled with patient names as a starting hint.
  // PR4 (OQ5) — reenvío seeds recipients from the persisted row.
  const [toEmail, setToEmail] = useState(initialEmail?.to ?? '');
  const [ccEmail, setCcEmail] = useState(initialEmail?.cc ?? '');

  const toList = toEmail.split(',').map((s) => s.trim()).filter(Boolean);
  const ccList = ccEmail.split(',').map((s) => s.trim()).filter(Boolean);
  const recipients = toList;

  // Build selected PatientFile[] objects from selection state
  const selectedFiles: PatientFile[] = useMemo(() => {
    const files: PatientFile[] = [];
    for (const [patientId, selection] of Object.entries(selectedPatients)) {
      const patient = patients.find((p) => p.id === patientId);
      if (!patient) continue;
      for (const fileId of selection.files) {
        const file = patient.files.find((f) => f.id === fileId);
        if (file) files.push(file);
      }
    }
    return files;
  }, [selectedPatients, patients]);

  // ================================================================
  // WU-5 (REQ-01/REQ-03) — inline attachment rename state.
  //
  // `nameOverrides` holds the RAW operator input per composite refKey
  // (`ruc::dni::idAten::path::name`). Everything else derives at render
  // time: the matcher (WU-4) validates each override through the shared
  // validator and resolves the effective names, and the send payload
  // merges them into `fileRefs` (D1) right where the hook picks them up.
  //
  // WU-7 (D8) — on a reenvío the map starts pre-seeded ONCE from the
  // stamped refs (`seedNameOverrides`), so a prior override re-applies
  // as an editable value. Later prop changes do not re-seed (same
  // seed-once semantics as `initialEmail`).
  // ================================================================
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>(() =>
    seedNameOverrides(fileRefs, nombreCompleto, destino),
  );

  // Effective rename rows for the chips (validated overrides win, else
  // the auto preview; reenvío-stamped `ref.deliveryName` fills in until
  // the operator edits the row).
  const renameItems = useMemo(
    () =>
      buildAttachmentRenameItems(
        fileRefs,
        selectedPatients,
        patients,
        nameOverrides,
        nombreCompleto,
        destino,
      ),
    [fileRefs, selectedPatients, patients, nameOverrides, nombreCompleto, destino],
  );

  // Same projection with NO overrides — the source of the autoName view
  // field (input placeholder / secondary chip text, REQ-01).
  const autoItems = useMemo(
    () =>
      buildAttachmentRenameItems(
        fileRefs,
        selectedPatients,
        patients,
        EMPTY_NAME_OVERRIDES,
        nombreCompleto,
        destino,
      ),
    [fileRefs, selectedPatients, patients, nombreCompleto, destino],
  );

  const renameViewItems: AttachmentRenameItemView[] = useMemo(
    () =>
      renameItems.map((item, i) => ({
        ...item,
        autoName: autoItems[i]?.effectiveName ?? item.effectiveName,
      })),
    [renameItems, autoItems],
  );

  // Send payload (D1): validated overrides merged into `fileRefs` by
  // refKey right before the hook serializes the FormData JSON. A row
  // that is NOT overridden but HAS a live entry means the operator
  // CLEARED the name — any reenvío-stamped `ref.deliveryName` is
  // dropped so the send falls back to the auto rename (REQ-01). Refs
  // with no matching display row pass through untouched (legacy).
  const effectiveFileRefs = useMemo(() => {
    if (Object.keys(nameOverrides).length === 0) return fileRefs;
    const overriddenByKey = new Map(
      renameItems
        .filter((item): item is typeof item & { refKey: string } => item.refKey !== null)
        .map((item) => [item.refKey, item]),
    );
    return fileRefs.map((ref) => {
      const refKey = refKeyOf(ref);
      const item = overriddenByKey.get(refKey);
      if (item?.overridden) return { ...ref, deliveryName: item.effectiveName };
      if (!item && !(refKey in nameOverrides)) return ref;
      const { deliveryName: _dropped, ...rest } = ref;
      void _dropped;
      return rest;
    });
  }, [fileRefs, nameOverrides, renameItems]);

  // ================================================================
  // WU-6 (REQ-02) — local file rename. Validated overrides materialize
  // as a NEW File via `new File([f], name, f)` (design Presentation):
  // content, type and lastModified are preserved — the bytes are never
  // touched. Locals are sanitize-only (D5: `forcePdf: false`, extension
  // rules don't apply). An invalid override keeps the original File and
  // surfaces through the SAME blocking error as the LAN rows; an empty
  // one falls back to the file's original name (REQ-01 semantics).
  // Feeds both the drop-zone display and the send payload, so the
  // operator always sees the name that will actually travel.
  // ================================================================
  const effectiveLocalFiles = useMemo(() => {
    if (Object.keys(localNameOverrides).length === 0) return localFiles;
    return localFiles.map((f, i) => {
      const raw = localNameOverrides[i];
      if (raw === undefined) return f;
      const check = validateDeliveryName(raw, { forcePdf: false });
      if (!check.ok || check.value === '' || check.value === f.name) return f;
      return new File([f], check.value, f);
    });
  }, [localFiles, localNameOverrides]);

  // Blocking pre-send error (REQ-03): an invalid override (names the
  // STORED disk file) or a duplicate involving an override — D6, the
  // server would 400 anyway (D7). Derived at render, never stored.
  const deliveryNameError = useMemo(() => {
    const invalid = renameItems.find(
      (item): item is typeof item & { issue: NonNullable<typeof item.issue> } =>
        item.issue !== null,
    );
    if (invalid) {
      return `El nombre para "${invalid.storedName}" no es válido: ${deliveryNameIssueText(invalid.issue)}. Corrija o limpie el nombre antes de enviar.`;
    }
    // WU-6 (REQ-02/REQ-03) — local overrides join the same net with
    // sanitize-only validation (D5) and the same operator copy.
    for (const [indexKey, raw] of Object.entries(localNameOverrides)) {
      const check = validateDeliveryName(raw, { forcePdf: false });
      if (!check.ok) {
        const storedName = localFiles[Number(indexKey)]?.name ?? `archivo ${indexKey}`;
        return `El nombre para "${storedName}" no es válido: ${deliveryNameIssueText(check.issue)}. Corrija o limpie el nombre antes de enviar.`;
      }
    }
    const collisions = findDeliveryNameCollisions([
      ...renameItems.map((item) => ({ value: item.effectiveName, overridden: item.overridden })),
      // Local rows: the original name when untouched or cleared (never
      // an override), the validated effective name when overridden.
      ...localFiles.map((f, i) => {
        const raw = localNameOverrides[i];
        if (raw === undefined) return { value: f.name, overridden: false };
        const check = validateDeliveryName(raw, { forcePdf: false });
        return check.ok && check.value !== ''
          ? { value: check.value, overridden: true }
          : { value: f.name, overridden: false };
      }),
    ]);
    // `findDeliveryNameCollisions` only ever yields DUPLICATE issues;
    // the union narrowing keeps the compiler honest about that contract.
    const duplicateName = collisions.find(
      (issue): issue is Extract<DeliveryNameIssue, { code: 'DUPLICATE' }> =>
        issue.code === 'DUPLICATE',
    )?.name;
    if (duplicateName !== undefined) {
      return `Nombres de adjunto duplicados: "${duplicateName}" está asignado a más de un archivo. Los nombres personalizados deben ser únicos.`;
    }
    return null;
  }, [renameItems, localFiles, localNameOverrides]);

  // Auto-auto duplicates (D6): allowed, but the operator deserves an
  // amber heads-up before two attachments leave with the same name.
  const autoAutoDuplicateNames = useMemo(() => {
    const groups = new Map<string, { name: string; count: number }>();
    for (const item of renameItems) {
      if (item.effectiveName === '') continue;
      const key = item.effectiveName.toLowerCase();
      const group = groups.get(key);
      if (group) group.count += 1;
      else groups.set(key, { name: item.effectiveName, count: 1 });
    }
    return [...groups.values()].filter((g) => g.count > 1).map((g) => g.name);
  }, [renameItems]);

  const handleRename = useCallback((refKey: string, next: string) => {
    setNameOverrides((prev) => ({ ...prev, [refKey]: next }));
  }, []);

  const { send, isSending, result, error } = useSendResults({
    to: recipients,
    cc: ccList.length > 0 ? ccList : undefined,
    subject,
    html: bodyHtml,
    // WU-5 — refs with the validated overrides merged in by refKey (D1);
    // identical to the `fileRefs` prop until the operator renames.
    fileRefs: effectiveFileRefs,
    // WU-6 — local files with validated renames applied (`new File`
    // semantics); identical to the `localFiles` state until the
    // operator renames a row.
    localFiles: effectiveLocalFiles,
    nombreCompleto,
    destino,
    companyId,
    companyName,
  });

  const handleSpitchSelect = useCallback((spitch: Spitch) => {
    // PR4 (reenvío seeding guard): SpitchSelector auto-selects the first
    // spitch once its list arrives, which would clobber the seeded
    // subject/body moments after mount. In seeded mode, swallow exactly
    // that first auto-select; explicit user changes and post-toggle
    // remounts still apply (the latch releases after one swallow).
    if (swallowAutoSelectRef.current) {
      swallowAutoSelectRef.current = false;
      return;
    }
    setSelectedSpitch(spitch);

    // editor-firmas PR4 — {{firma}} now interpolates the server-composed
    // signature (fetched on mount); NO stripping, NO client-side rebuild.
    // If the template selection wins the fetch race the fallback marker
    // is baked here; the recovery effect below swaps it for the real
    // firma once the fetch lands (no reselect needed).
    const interpolated = interpolateSpitch({
      html: spitch.bodyHtml,
      subject: spitch.subject,
      companyName,
      patientNames: recipientNames,
      fileNames: selectedFiles.map((f) => f.name),
      firma: firmaHtml,
      patients,
      files: selectedFiles,
      destino,
    });

    setSubject(interpolated.subject);
    setBodyHtml(interpolated.html);
    editorRef.current?.loadHtml(interpolated.html);
  }, [companyName, recipientNames, selectedFiles, patients, destino, firmaHtml]);

  // Deferred-firma recovery (marker replacement): SpitchSelector
  // auto-selects the first template on mount while useFirmaCorreo's GET
  // is still in flight — that interpolation bakes the resolver's
  // [Falta configurar firma] fallback into the body. When the firma
  // lands, swap every baked marker for the real html in place (NO
  // re-interpolation — operator edits around the marker survive) and
  // sync the visual editor exactly like handleSpitchSelect does.
  // Guards: only the ''→non-empty firma transition triggers recovery
  // (ref latch — a firma reverting to '' does nothing); a body without
  // the marker is untouched; an empty resolved firma keeps the spec
  // fallback visible.
  const prevFirmaHtmlRef = useRef('');
  useEffect(() => {
    const previous = prevFirmaHtmlRef.current;
    prevFirmaHtmlRef.current = firmaHtml;
    if (previous !== '' || firmaHtml === '') return;
    const recovered = replaceFirmaFallback(bodyHtml, firmaHtml);
    if (recovered === bodyHtml) return;
    /* eslint-disable react-hooks/set-state-in-effect -- async recovery of edit-transient body state baked by the mount-time firma GET race; cannot be derived at render */
    setBodyHtml(recovered);
    /* eslint-enable react-hooks/set-state-in-effect */
    editorRef.current?.loadHtml(recovered);
  }, [firmaHtml, bodyHtml]);

  const handleToggle = useCallback(() => {
    setTarget((prev) => (prev === 'company' ? 'patient' : 'company'));
    setSelectedSpitch(null);
    setSubject('');
    setBodyHtml('');
  }, []);

  const handleLocalAdd = useCallback((files: File[]) => {
    setLocalFiles((prev) => [...prev, ...files]);
  }, []);

  const handleLocalRemove = useCallback((index: number) => {
    setLocalFiles((prev) => prev.filter((_, i) => i !== index));
    // WU-6 — overrides are index-keyed: removing a file shifts every
    // later row one slot left, so the map is re-keyed in lockstep (no
    // off-by-one bleed of a rename onto the wrong file).
    setLocalNameOverrides((prev) => {
      const next: Record<number, string> = {};
      for (const [key, value] of Object.entries(prev)) {
        const i = Number(key);
        if (i === index) continue;
        next[i > index ? i - 1 : i] = value;
      }
      return next;
    });
  }, []);

  /**
   * WU-6 (REQ-02) — commit the RAW operator input for a local row.
   * Validation happens at render (invalid values block the send through
   * the shared error box; `''` clears back to the original name), so
   * this handler stays a dumb state write — same shape as `handleRename`.
   */
  const handleLocalRename = useCallback((index: number, next: string) => {
    setLocalNameOverrides((prev) => ({ ...prev, [index]: next }));
  }, []);

  const handleRequestSend = useCallback(() => {
    const hasLanFiles = Object.values(selectedFiles).length > 0;
    const hasLocalFiles = localFiles.length > 0;
    if (!hasLanFiles && !hasLocalFiles) {
      setShowNoFilesWarning(true);
      return;
    }
    // WU-5 (REQ-03/D6) — blocking collision policy: an invalid override
    // or an override-involved duplicate stops the send here (the red
    // error box is already visible; the server would reject with 400
    // anyway, D7). Dismissal happens by fixing or clearing the name.
    if (deliveryNameError) return;
    // Auto-auto duplicates stay ALLOWED (D6) — dismissible amber warning.
    if (autoAutoDuplicateNames.length > 0) {
      toast.warning(
        `Hay adjuntos con el mismo nombre: "${autoAutoDuplicateNames[0]}" se generó automáticamente para más de un archivo. El envío continuará con nombres repetidos.`,
        { duration: 10000 },
      );
    }
    hasSent.current = true;
    send();
  }, [selectedFiles, localFiles, send, deliveryNameError, autoAutoDuplicateNames]);

  const handleConfirmNoFiles = useCallback(() => {
    setShowNoFilesWarning(false);
    hasSent.current = true;
    send();
  }, [send]);

  useEffect(() => {
    if (!hasSent.current) return;
    if (isSending) {
      showSendLoading();
    } else if (result?.success === true) {
      showSendSuccess(recipients.length);
    } else if (error || result?.success === false) {
      showSendError(error || 'Error al enviar el correo');
    }
  }, [isSending, result, error, recipients.length]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ===== LEFT PANEL: Preview (shared email module) ===== */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
            Cómo va el resultado
          </h2>
          <EmailPreviewPanel
            subject={subject}
            html={bodyHtml}
            emptyHint="Seleccione un spitch para previsualizar"
            templateName={selectedSpitch?.name}
            attachmentsSlot={
              <>
                {/* WU-5 (REQ-03) — blocking rename errors: invalid
                    override or override-involved duplicate. The send
                    button refuses to fire while this is visible. */}
                {deliveryNameError && (
                  <p
                    role="alert"
                    data-testid="delivery-name-error"
                    className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-400"
                  >
                    {deliveryNameError}
                  </p>
                )}
                {/* Attachments preview */}
                <AttachmentList
                  selectedPatients={selectedPatients}
                  patients={patients}
                  renameItems={renameViewItems}
                  onRename={handleRename}
                />

                {/* PR4 (reenvío) — metadata-only local attachments from the
                    original send: greyed, reference-only, never re-attachable
                    (BR11). Displayed near the drop zone so the operator sees
                    what must be re-attached manually. */}
                {unavailableAttachments.length > 0 && (
                  <div
                    data-testid="unavailable-attachments"
                    className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                      Adjuntos ya no disponibles
                    </p>
                    <ul className="space-y-1.5">
                      {unavailableAttachments.map((attachment) => (
                        <li
                          key={attachment.filename}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="text-slate-400 dark:text-slate-500 truncate">
                            {attachment.filename}
                          </span>
                          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
                            ya no disponible
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      Se adjuntaron localmente en el envío original; vuelva a adjuntarlos si aún los necesita.
                    </p>
                  </div>
                )}
              </>
            }
            dropZoneSlot={
              <LocalFileDropZone
                files={effectiveLocalFiles}
                onAdd={handleLocalAdd}
                onRemove={handleLocalRemove}
                onRename={handleLocalRename}
              />
            }
          />
        </div>
      </div>

      {/* ===== RIGHT PANEL: Controls (shared email module) ===== */}
      <EmailControlsPanel
        to={toEmail}
        onToChange={setToEmail}
        cc={ccEmail}
        onCcChange={setCcEmail}
        subject={subject}
        onSubjectChange={setSubject}
        headerSlot={
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Controles</h2>
              {/* PR #3 (WU-3.2) — back button moved from the WorkerDetailTable
                  overlay wrapper into EmailEditor. Rendered conditionally on
                  `onBack` so the standalone `page.tsx` caller (which has its
                  own wrapper button) does not get a duplicate (R5). */}
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  data-testid="email-editor-back"
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold"
                >
                  {backContext === 'wizard' ? 'Volver al paso 4' : 'Volver a la tabla'}
                </button>
              )}
            </div>

            {/* Toggle: company / patient */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {target === 'company' ? 'Enviar a empresa' : 'Enviar a paciente'}
              </span>
              <button
                role="switch"
                aria-checked={target === 'patient'}
                onClick={handleToggle}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${target === 'patient' ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-slate-100 transition-transform ${target === 'patient' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>
          </>
        }
        templateSlot={
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Spitch</label>
            <SpitchSelector
              key={target}
              target={target}
              onSelect={handleSpitchSelect}
              selectedId={selectedSpitch?.id}
              area="consolidados"
            />
          </div>
        }
        bodySlot={
          <EmailBodyField
            html={bodyHtml}
            isEditing={isEditingBody}
            onEditingChange={setIsEditingBody}
            emptyHint="Seleccione un spitch para previsualizar"
            editorSlot={isClient ? (
              <Suspense fallback={
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-sm text-slate-400">
                  Cargando editor...
                </div>
              }>
                <EmailBodyEditorLazy
                  key="editing-body"
                  initialHtml={bodyHtml}
                  ref={editorRef}
                  onChange={(html) => setBodyHtml(html)}
                />
              </Suspense>
            ) : null}
          />
        }
        onSend={handleRequestSend}
        /* PR4: disable relaxed from "selectedPatients empty" to "no
           context at all" (selectedPatients AND fileRefs AND localFiles
           all empty) so a reenvío derived from attachmentsJson stays
           sendable — a local-only row becomes sendable once its files
           are re-added via the drop zone. */
        sendDisabled={
          Object.keys(selectedPatients).length === 0 &&
          fileRefs.length === 0 &&
          localFiles.length === 0
        }
        sending={isSending}
      />

      {/* ===== No Files Warning ===== */}
      {showNoFilesWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">No hay archivos adjuntos</h3>
            <p className="text-sm text-slate-500 mb-6">
              No hay archivos adjuntos seleccionados. ¿Enviar de todas formas?
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={handleConfirmNoFiles}
                className="px-6 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-medium text-sm cursor-pointer"
              >
                Enviar de todas formas
              </button>
              <button
                onClick={() => setShowNoFilesWarning(false)}
                className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
