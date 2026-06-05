'use client';

import { useState, useCallback, useMemo } from 'react';
import { SpitchSelector } from './SpitchSelector';
import { AttachmentList } from './AttachmentList';
import { SendConfirmation } from './SendConfirmation';
import { useSendResults } from '../hooks/useSendResults';
import type { Patient, PatientFile, Spitch } from '../../domain/entities';

interface EmailEditorProps {
  companyId: string;
  selectedPatients: {
    [patientId: string]: {
      patientName: string;
      files: string[];
    };
  };
  patients: Patient[];
}

export function EmailEditor({ companyId, selectedPatients, patients }: EmailEditorProps) {
  // Internal state
  const [target, setTarget] = useState<'company' | 'patient'>('company');
  const [selectedSpitch, setSelectedSpitch] = useState<Spitch | null>(null);
  const [subject, setSubject] = useState('');
  const [htmlBody, setHtmlBody] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showNoFilesWarning, setShowNoFilesWarning] = useState(false);

  // Determine recipients based on selected patients
  const recipientNames = Object.values(selectedPatients).map((s) => s.patientName);
  const recipients = recipientNames.length > 0
    ? recipientNames
    : [];

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
    to: recipientNames,
    subject,
    html: htmlBody,
    files: selectedFiles,
  });

  const handleSpitchSelect = useCallback((spitch: Spitch) => {
    setSelectedSpitch(spitch);
    setSubject(spitch.subject);
    setHtmlBody(spitch.bodyHtml);
  }, []);

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
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Cómo va el resultado</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-6 min-h-[300px]">
            {htmlBody ? (
              <div
                data-testid="email-preview"
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: htmlBody }}
              />
            ) : (
              <p className="text-slate-400 text-sm">Seleccione un spitch para previsualizar</p>
            )}
          </div>
        </div>

        {/* Attachments preview */}
        <AttachmentList selectedPatients={selectedPatients} patients={patients} />
      </div>

      {/* ===== RIGHT PANEL: Controls ===== */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Controles</h2>

        {/* Toggle: company / patient */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">
            {target === 'company' ? 'Enviar a empresa' : 'Enviar a paciente'}
          </span>
          <button
            role="switch"
            aria-checked={target === 'patient'}
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
              target === 'patient' ? 'bg-sky-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                target === 'patient' ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Spitch selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Spitch</label>
          <SpitchSelector
            target={target}
            onSelect={handleSpitchSelect}
            selectedId={selectedSpitch?.id}
          />
        </div>

        {/* Subject input */}
        <div className="space-y-1.5">
          <label htmlFor="email-subject" className="text-sm font-medium text-slate-700">
            Asunto
          </label>
          <input
            id="email-subject"
            type="text"
            aria-label="Asunto"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors"
            placeholder="Asunto del correo"
          />
        </div>

        {/* Body editor */}
        <div className="space-y-1.5">
          <label htmlFor="email-body" className="text-sm font-medium text-slate-700">
            Contenido del correo
          </label>
          <textarea
            id="email-body"
            aria-label="Contenido del correo"
            value={htmlBody}
            onChange={(e) => setHtmlBody(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors min-h-[200px] font-mono"
            placeholder="<p>Contenido del correo...</p>"
          />
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
