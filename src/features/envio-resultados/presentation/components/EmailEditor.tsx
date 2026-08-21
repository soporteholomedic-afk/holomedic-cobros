'use client';

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SpitchSelector } from './SpitchSelector';
import { AttachmentList } from './AttachmentList';
import { LocalFileDropZone } from './LocalFileDropZone';
import { useSendResults } from '../hooks/useSendResults';
import { interpolateSpitch } from '../helpers/interpolateSpitch';
import { buildSignatureDataFromUser, buildSignatureHtml, stripSignatureHtml } from '../helpers/signatureData';
import { useAuth } from '@/features/auth/presentation/hooks/useAuth';
import { showSendLoading, showSendSuccess, showSendError } from '../helpers/sendToasts';
import type { SignatureData } from '../helpers/signatureData';
import type { InitialEmail, UnavailableAttachment } from '../helpers/buildReenvioViewData';
import type { Patient, PatientFile, SelectedFileRef, Spitch } from '../../domain/entities';
import type { EmailBodyEditorHandle } from './EmailBodyEditor';

const EmailBodyEditorLazy = lazy(() =>
  import('./EmailBodyEditor').then((m) => ({ default: m.EmailBodyEditor })),
);

// Signature fields — kept out of BlockNote to avoid lossy round-trip on the
// complex table structure. Edited via simple inputs; rebuilt on "Hecho".
const signatureFields: { key: keyof SignatureData; label: string }[] = [
  { key: 'name', label: 'Nombre' },
  { key: 'role', label: 'Cargo' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'phoneAlt', label: 'Teléfono 2' },
  { key: 'address', label: 'Dirección' },
];

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
  // usuarios-nombre-firma — the signature is seeded from the session
  // user (`/api/auth/me` via useAuth) instead of a hardcoded default.
  const { user } = useAuth();

  // Internal state
  const [target, setTarget] = useState<'company' | 'patient'>('company');
  const [selectedSpitch, setSelectedSpitch] = useState<Spitch | null>(null);
  // PR4 (OQ5) — reenvío seeds the initializers directly (no effects):
  // the persisted signature is stripped so the htmlBody memo re-appends
  // it exactly once on re-send (D8).
  const [subject, setSubject] = useState(initialEmail?.subject ?? '');
  const [bodyHtml, setBodyHtml] = useState(() =>
    initialEmail ? stripSignatureHtml(initialEmail.bodyHtml) : '',
  );
  // Session-seeded signature (lazy initializer — falls back to the
  // default name while auth is still loading).
  const [signatureData, setSignatureData] = useState<SignatureData>(() =>
    buildSignatureDataFromUser(user),
  );

  // Late-auth re-seed: when the session user resolves AFTER mount
  // (AuthProvider still fetching), re-seed the signature from it — but
  // only while pristine, so a signature the operator already edited by
  // hand is never clobbered by a late response.
  const signaturePristineRef = useRef(true);
  useEffect(() => {
    if (!user) return;
    if (!signaturePristineRef.current) return;
    setSignatureData(buildSignatureDataFromUser(user));
  }, [user]);

  const htmlBody = useMemo(
    () => (bodyHtml ? bodyHtml + buildSignatureHtml(signatureData) : ''),
    [bodyHtml, signatureData],
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
    html: htmlBody,
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

    // Strip {{firma}} from the spitch body — signature is stored separately
    // as structured data and rebuilt via buildSignatureHtml.
    const bodyWithoutFirma = spitch.bodyHtml.replace(/\{\{firma\}\}/g, '');

    const interpolated = interpolateSpitch({
      html: bodyWithoutFirma,
      subject: spitch.subject,
      companyName,
      patientNames: recipientNames,
      fileNames: selectedFiles.map((f) => f.name),
      firma: '',
      patients,
      files: selectedFiles,
      destino,
    });

    setSubject(interpolated.subject);
    setBodyHtml(interpolated.html);
    // usuarios-nombre-firma — a fresh spitch re-seeds the signature
    // from the session user (previously: hardcoded default).
    setSignatureData(buildSignatureDataFromUser(user));
    editorRef.current?.loadHtml(interpolated.html);
  }, [companyName, recipientNames, selectedFiles, patients, destino, user]);

  const handleToggle = useCallback(() => {
    setTarget((prev) => (prev === 'company' ? 'patient' : 'company'));
    setSelectedSpitch(null);
    setSubject('');
    setBodyHtml('');
  }, []);

  const handleLocalAdd = useCallback((files: File[]) => {
    setLocalFiles((prev) => [...prev, ...files]);
  }, []);

  const handleSignatureChange = useCallback((field: keyof SignatureData, value: string) => {
    // Manual edit releases the late-auth re-seed latch (pristine → false).
    signaturePristineRef.current = false;
    setSignatureData((prev) => ({ ...prev, [field]: value }));
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
      {/* ===== LEFT PANEL: Preview ===== */}
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">
            Cómo va el resultado
          </h2>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">
            {subject && (
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/60 dark:to-slate-800">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Asunto
                </div>
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                  {subject}
                </div>
              </div>
            )}
            <div className="p-6 min-h-[280px]">
              {htmlBody ? (
                <div
                  data-testid="email-preview"
                  className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-200"
                  dangerouslySetInnerHTML={{ __html: htmlBody }}
                />
              ) : (
                <p className="text-slate-400 dark:text-slate-500 text-sm italic">
                  Seleccione un spitch para previsualizar
                </p>
              )}
            </div>
            {selectedSpitch && (
              <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Plantilla: <span className="font-medium text-slate-700 dark:text-slate-300">{selectedSpitch.name}</span>
              </div>
            )}
          </div>
        </div>

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

        {/* Local file drop zone */}
        <LocalFileDropZone
          files={localFiles}
          onAdd={handleLocalAdd}
          onRemove={handleLocalRemove}
        />
      </div>

      {/* ===== RIGHT PANEL: Controls ===== */}
      <div className="space-y-6">
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

        {/* Destinatario (To) */}
        <div className="space-y-1.5">
          <label htmlFor="email-to" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Destinatario
          </label>
          <input
            id="email-to"
            type="text"
            aria-label="Destinatario"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-900 outline-none transition-colors"
            placeholder="correo@empresa.com, otro@empresa.com"
          />
        </div>

        {/* CC */}
        <div className="space-y-1.5">
          <label htmlFor="email-cc" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            CC
          </label>
          <input
            id="email-cc"
            type="text"
            aria-label="CC"
            value={ccEmail}
            onChange={(e) => setCcEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-900 outline-none transition-colors"
            placeholder="copia@empresa.com"
          />
        </div>

        {/* Spitch selector */}
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

        {/* Subject input */}
        <div className="space-y-1.5">
          <label htmlFor="email-subject" className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Asunto
          </label>
          <input
            id="email-subject"
            type="text"
            aria-label="Asunto"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-900 outline-none transition-colors"
            placeholder="Asunto del correo"
          />
        </div>

        {/* Body preview / editor — toggle between read-only preview and BlockNote */}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Cuerpo del correo
          </label>

          {isEditingBody ? (
            <div className="space-y-3">
              {/* BlockNote body editor */}
              {isClient && (
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
              )}

              {/* Signature editor — structured fields, rebuilt on "Hecho" */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Firma
                </h4>
                {signatureFields.map(({ key, label }) => (
                  <div key={key} className="space-y-0.5">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {label}
                    </label>
                    <input
                      type="text"
                      value={signatureData[key]}
                      onChange={(e) => handleSignatureChange(key, e.target.value)}
                      className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-900 outline-none transition-colors"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={() => setIsEditingBody(false)}
                className="text-sm font-medium text-sky-600 hover:text-sky-700 cursor-pointer transition-colors"
              >
                Hecho
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
              {bodyHtml ? (
                <>
                  <div
                    className="p-4 text-sm text-slate-700 dark:text-slate-200 prose prose-sm dark:prose-invert max-w-none"
                    data-testid="body-preview"
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                  />
                  <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-2 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
                    <button
                      onClick={() => {
                        setIsEditingBody(true);
                      }}
                      className="text-xs font-medium text-sky-600 hover:text-sky-700 cursor-pointer flex items-center gap-1 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Editar
                    </button>
                  </div>
                </>
              ) : (
                <p className="p-4 text-sm text-slate-400 dark:text-slate-500 italic">
                  Seleccione un spitch para previsualizar
                </p>
              )}
            </div>
          )}
        </div>

        {/* Send button — PR4: disable relaxed from "selectedPatients
            empty" to "no context at all" (selectedPatients AND fileRefs
            AND localFiles all empty) so a reenvío derived from
            attachmentsJson stays sendable — a local-only row becomes
            sendable once its files are re-added via the drop zone. */}
        <button
          onClick={handleRequestSend}
          disabled={
            isSending ||
            (Object.keys(selectedPatients).length === 0 &&
              fileRefs.length === 0 &&
              localFiles.length === 0)
          }
          className="w-full py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-medium text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {isSending && (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          Enviar
        </button>
      </div>

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
