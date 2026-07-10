'use client';

import { lazy, Suspense, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SpitchSelector } from './SpitchSelector';
import { AttachmentList } from './AttachmentList';
import { LocalFileDropZone } from './LocalFileDropZone';
import { SendConfirmation } from './SendConfirmation';
import { useSendResults } from '../hooks/useSendResults';
import { interpolateSpitch } from '../helpers/interpolateSpitch';
import { buildSignatureHtml, DEFAULT_SIGNATURE_DATA } from '../helpers/signatureData';
import type { SignatureData } from '../helpers/signatureData';
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
}

export function EmailEditor({
  // `companyId` is part of the prop contract (the parent passes the
  // selected company) — the selector does not currently consume it
  // directly (it lives in the page state), but keeping it on the
  // signature avoids breaking the call site in `WorkerDetailTable`.
  // The unused-vars warning is pre-existing; the prop is preserved
  // for future per-company filtering of templates.
  companyId: _companyId,
  companyName,
  selectedPatients,
  patients,
  // PR #3 — forwarded to the hook. `PatientFile` (display) is still
  // derived locally for `AttachmentList` via `selectedFiles`; the
  // two stay in parallel.
  fileRefs = [],
  nombreCompleto = '',
  destino = '',
}: EmailEditorProps) {
  // Reference the intentionally-unused prop to satisfy the linter.
  // Documented contract: the parent passes `companyId` for future
  // per-company template filtering (Decision #2 from the proposal).
  void _companyId;
  // Internal state
  const [target, setTarget] = useState<'company' | 'patient'>('company');
  const [selectedSpitch, setSelectedSpitch] = useState<Spitch | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [signatureData, setSignatureData] = useState<SignatureData>(DEFAULT_SIGNATURE_DATA);

  const htmlBody = useMemo(
    () => (bodyHtml ? bodyHtml + buildSignatureHtml(signatureData) : ''),
    [bodyHtml, signatureData],
  );

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showNoFilesWarning, setShowNoFilesWarning] = useState(false);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [isEditingBody, setIsEditingBody] = useState(false);
  const editorRef = useRef<EmailBodyEditorHandle>(null);

  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Determine recipients based on selected patients
  const recipientNames = Object.values(selectedPatients).map((s) => s.patientName);

  // Editable email fields — pre-filled with patient names as a starting hint
  const [toEmail, setToEmail] = useState(() => recipientNames.join(', '));
  const [ccEmail, setCcEmail] = useState('');

  const toList = toEmail.split(',').map((s) => s.trim()).filter(Boolean);
  const ccList = ccEmail.split(',').map((s) => s.trim()).filter(Boolean);
  const recipients = toList.length > 0 ? toList : recipientNames;

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
  });

  const handleSpitchSelect = useCallback((spitch: Spitch) => {
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
    });

    setSubject(interpolated.subject);
    setBodyHtml(interpolated.html);
    setSignatureData(DEFAULT_SIGNATURE_DATA);
    editorRef.current?.loadHtml(interpolated.html);
  }, [companyName, recipientNames, selectedFiles, patients]);

  const handleToggle = useCallback(() => {
    setTarget((prev) => (prev === 'company' ? 'patient' : 'company'));
    // Reset spitch selection when target changes — SpitchSelector handles reload
  }, []);

  const handleLocalAdd = useCallback((files: File[]) => {
    setLocalFiles((prev) => [...prev, ...files]);
  }, []);

  const handleSignatureChange = useCallback((field: keyof SignatureData, value: string) => {
    setSignatureData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleLocalRemove = useCallback((index: number) => {
    setLocalFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleRequestSend = useCallback(() => {
    // Check if any files are selected (LAN or local)
    const hasLanFiles = Object.values(selectedFiles).length > 0;
    const hasLocalFiles = localFiles.length > 0;
    if (!hasLanFiles && !hasLocalFiles) {
      setShowNoFilesWarning(true);
      return;
    }
    setShowConfirmation(true);
  }, [selectedFiles, localFiles]);

  const handleConfirmNoFiles = useCallback(() => {
    setShowNoFilesWarning(false);
    setShowConfirmation(true);
  }, []);

  const handleConfirmSend = useCallback(async () => {
    await send();
    // Don't close modal — the SendConfirmation will show success/error state
  }, [send]);

  const hideConfirmation = useCallback(() => {
    setShowConfirmation(false);
  }, []);

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

        {/* Local file drop zone */}
        <LocalFileDropZone
          files={localFiles}
          onAdd={handleLocalAdd}
          onRemove={handleLocalRemove}
        />
      </div>

      {/* ===== RIGHT PANEL: Controls ===== */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">Controles</h2>

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

        {/* Send button */}
        <button
          onClick={handleRequestSend}
          disabled={isSending || Object.keys(selectedPatients).length === 0}
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

      {/* ===== Send Confirmation Modal ===== */}
      <SendConfirmation
        isOpen={showConfirmation}
        onClose={hideConfirmation}
        onConfirm={handleConfirmSend}
        recipients={recipients}
        isSending={isSending}
        result={result}
        error={error}
      />
    </div>
  );
}
