'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SpitchSelector } from './SpitchSelector';
import { AttachmentList } from './AttachmentList';
import { LocalFileDropZone } from './LocalFileDropZone';
import { EmailPreviewPanel } from '@/components/email/EmailPreviewPanel';
import { EmailControlsPanel } from '@/components/email/EmailControlsPanel';
import { EmailBodyField } from '@/components/email/EmailBodyField';
import { useSendResults } from '../hooks/useSendResults';
import { interpolateSpitch } from '../helpers/interpolateSpitch';
import { stripSignatureHtml } from '../helpers/signatureData';
import { useFirmaCorreo } from '@/features/firma-correo/presentation/hooks/useFirmaCorreo';
import { replaceFirmaFallback } from '@/features/firma-correo/presentation/helpers/replaceFirmaFallback';
import { showSendLoading, showSendSuccess, showSendError } from '../helpers/sendToasts';
import type { InitialEmail, UnavailableAttachment } from '../helpers/buildReenvioViewData';
import type { Patient, PatientFile, SelectedFileRef, Spitch } from '../../domain/entities';
import type { EmailBodyEditorHandle } from './EmailBodyEditor';

const EmailBodyEditorLazy = lazy(() =>
  import('./EmailBodyEditor').then((m) => ({ default: m.EmailBodyEditor })),
);

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

  const { send, isSending, result, error } = useSendResults({
    to: recipients,
    cc: ccList.length > 0 ? ccList : undefined,
    subject,
    html: bodyHtml,
    fileRefs,
    localFiles,
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
  }, []);

  const handleRequestSend = useCallback(() => {
    const hasLanFiles = Object.values(selectedFiles).length > 0;
    const hasLocalFiles = localFiles.length > 0;
    if (!hasLanFiles && !hasLocalFiles) {
      setShowNoFilesWarning(true);
      return;
    }
    hasSent.current = true;
    send();
  }, [selectedFiles, localFiles, send]);

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
                {/* Attachments preview */}
                <AttachmentList selectedPatients={selectedPatients} patients={patients} />

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
                files={localFiles}
                onAdd={handleLocalAdd}
                onRemove={handleLocalRemove}
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
