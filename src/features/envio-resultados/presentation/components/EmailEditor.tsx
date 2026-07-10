'use client';

import { useState, useCallback, useMemo } from 'react';
import { SpitchSelector } from './SpitchSelector';
import { AttachmentList } from './AttachmentList';
import { SendConfirmation } from './SendConfirmation';
import { useSendResults } from '../hooks/useSendResults';
import { interpolateSpitch } from '../helpers/interpolateSpitch';
import type { Patient, PatientFile, SelectedFileRef, Spitch } from '../../domain/entities';

const DEFAULT_SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; color: rgb(51, 51, 51); line-height: 1.5; margin-top: 15px;">
  <tr>
    <td valign="middle" style="padding-right: 20px; text-align: center; width: 160px;">
      <img src="https://holomedic.com.pe/w2/wp-content/uploads/2023/06/logo.png" alt="Holomedic" style="display: block; width: 140px; height: auto; margin: 0 auto 8px auto;" />
      <a href="https://www.holomedic.com.pe" target="_blank" style="color: rgb(0, 86, 179); text-decoration: underline; font-weight: bold; font-size: 11px; font-family: Arial, sans-serif; display: inline-block;">www.holomedic.com.pe</a>
    </td>
    <td valign="top" style="border-left: 2px solid rgb(0, 86, 179); padding-left: 20px; padding-top: 2px; padding-bottom: 2px;">
      <div style="font-size: 14px; font-weight: bold; color: rgb(0, 0, 0); margin-bottom: 4px; font-family: Arial, sans-serif;">
        Blanca Chirinos <span style="color: rgb(0, 86, 179); font-weight: bold; margin: 0 4px;">|</span> Área Consolidados
      </div>
      <div style="margin-bottom: 4px; font-family: Arial, sans-serif;">
        <a href="mailto:consolidados@holomedic.com.pe" style="color: rgb(0, 86, 179); text-decoration: underline;">consolidados@holomedic.com.pe</a>
      </div>
      <div style="color: rgb(51, 51, 51); margin-bottom: 2px; font-family: Arial, sans-serif;">
        Móvil: (051) 989211757
      </div>
      <div style="color: rgb(51, 51, 51); margin-bottom: 2px; font-family: Arial, sans-serif;">
        Telef. 480-0217 Anexo: 303
      </div>
      <div style="color: rgb(51, 51, 51); margin-bottom: 8px; font-family: Arial, sans-serif;">
        Pasaje La India 169, Urb. Los Sauces – Surquillo (Altura de 9 y 10 de la Av. Villarán)
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <a href="https://www.facebook.com" target="_blank" style="display: inline-block; text-decoration: none;">
          <img src="https://img.icons8.com/color/30/facebook-new.png" alt="Facebook" style="display: block; width: 24px; height: 24px; border: 0;" />
        </a>
        <a href="https://www.instagram.com" target="_blank" style="display: inline-block; text-decoration: none;">
          <img src="https://img.icons8.com/color/30/instagram-new.png" alt="Instagram" style="display: block; width: 24px; height: 24px; border: 0;" />
        </a>
        <a href="https://wa.me/51989211757" target="_blank" style="display: inline-block; text-decoration: none;">
          <img src="https://img.icons8.com/color/30/whatsapp.png" alt="WhatsApp" style="display: block; width: 24px; height: 24px; border: 0;" />
        </a>
      </div>
    </td>
  </tr>
</table>`;

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
  const [htmlBody, setHtmlBody] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showNoFilesWarning, setShowNoFilesWarning] = useState(false);

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
    nombreCompleto,
    destino,
  });

  const handleSpitchSelect = useCallback((spitch: Spitch) => {
    setSelectedSpitch(spitch);

    const interpolated = interpolateSpitch({
      html: spitch.bodyHtml,
      subject: spitch.subject,
      companyName,
      patientNames: recipientNames,
      fileNames: selectedFiles.map((f) => f.name),
      // Bug-fix wiring: forward the full patient + file data so the
      // registry can resolve {{dni}} and {{nombrePaciente}} (read
      // from `ctx.patients[0]`). Pass the default signature HTML
      // as `firma` to resolve the placeholder for all areas.
      firma: DEFAULT_SIGNATURE_HTML,
      patients,
      files: selectedFiles,
    });

    setSubject(interpolated.subject);
    setHtmlBody(interpolated.html);
  }, [companyName, recipientNames, selectedFiles, patients]);

  const handleToggle = useCallback(() => {
    setTarget((prev) => (prev === 'company' ? 'patient' : 'company'));
    // Reset spitch selection when target changes — SpitchSelector handles reload
  }, []);

  const handleRequestSend = useCallback(() => {
    // Check if any files are selected
    const hasFiles = Object.values(selectedFiles).length > 0;
    if (!hasFiles) {
      setShowNoFilesWarning(true);
      return;
    }
    setShowConfirmation(true);
  }, [selectedFiles]);

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

        {/* Body editor — collapsed by default, expanded on click */}
        <details className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 group">
          <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200 px-3 py-2 flex items-center justify-between list-none select-none">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Editar HTML del cuerpo
            </span>
            <svg className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </summary>
          <div className="px-3 pb-3 space-y-1.5">
            <label htmlFor="email-body" className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
              Contenido del correo (HTML)
            </label>
            <textarea
              id="email-body"
              aria-label="Contenido del correo"
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:focus:ring-sky-900 outline-none transition-colors min-h-[160px] font-mono leading-relaxed"
              placeholder="<p>Contenido del correo...</p>"
            />
          </div>
        </details>

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
