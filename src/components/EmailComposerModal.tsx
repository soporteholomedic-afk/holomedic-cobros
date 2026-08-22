"use client";
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Send, Mail, CheckCircle2, Landmark, AlertTriangle } from 'lucide-react';
import { ClienteGroup } from '../types';
import { SpitchSelector } from '@/features/envio-resultados/presentation/components/SpitchSelector';
import { interpolate } from '@/features/envio-resultados/presentation/helpers/interpolate';
import { buildTokenResolverRegistry } from '@/features/envio-resultados/presentation/helpers/tokenResolvers/buildTokenResolverRegistry';
import {
  buildSignatureDataFromUser,
  buildSignatureHtml,
} from '@/features/envio-resultados/presentation/helpers/signatureData';
import { useAuth } from '@/features/auth/presentation/hooks/useAuth';
import { useCompanyContact } from '@/features/cobranza/presentation/hooks/useCompanyContact';
import { esClaveDirectorioValida } from '@/features/cobranza/domain/entities';
import { buildCobranzaInterpolationContext } from '@/features/cobranza/presentation/helpers/buildCobranzaInterpolationContext';
import { buildCobranzaAuditMetadata } from '@/features/cobranza/presentation/helpers/buildCobranzaAuditMetadata';
import type { Spitch } from '@/features/envio-resultados/domain/entities';

interface EmailComposerModalProps {
  client: ClienteGroup;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

/** Split comma-separated email string into trimmed non-empty array */
function parseEmailList(value: string): string[] {
  return value
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

export function EmailComposerModal({ client, onClose, onSuccess }: EmailComposerModalProps) {
  // Session-seeded signature ({{firma}} source) — DEFAULT_SIGNATURE_DATA
  // fallback while auth is loading (EmailEditor precedent).
  const { user } = useAuth();
  const firmaHtml = useMemo(() => buildSignatureHtml(buildSignatureDataFromUser(user)), [user]);

  // Contact directory (REQ-01-DIR-01/03): prefills to/cc from the stored
  // pair; junk keys never hit the API ('skipped' — sending never blocked).
  const { contacto, status, saveContact } = useCompanyContact(
    client.clienteId,
    client.razonSocial,
  );

  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Async seed of the operator-editable to/cc fields from the directory
  // (REQ-01-DIR-03). Legitimate effect: the fields are editable state
  // (not derivable at render) seeded by a network response — the
  // EmailEditor initialEmail seeding precedent. Junk/empty/error states
  // leave them empty with the descriptive placeholder.
  useEffect(() => {
    if (status !== 'populated' || !contacto) return;
    /* eslint-disable react-hooks/set-state-in-effect -- async seed of editable fields from the directory GET; cannot be derived at render */
    setTo(contacto.emailPrincipal);
    setCc(contacto.emailCopia ?? '');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [status, contacto]);

  // Template selection → real-time interpolation via the interpolate()
  // CORE with the cobranza registry (design D3 — the patient-shaped
  // interpolateSpitch wrapper stays untouched, zero consolidados
  // regression). Event-driven: bodyHtml/subject are edit-transient
  // state, re-interpolated only when a template is selected.
  const handleSpitchSelect = useCallback(
    (spitch: Spitch) => {
      const interpolated = interpolate(
        spitch.bodyHtml,
        spitch.subject,
        buildCobranzaInterpolationContext(client, firmaHtml),
        buildTokenResolverRegistry('cobranza'),
      );
      setBodyHtml(interpolated.html);
      setSubject(interpolated.subject);
    },
    [client, firmaHtml],
  );

  const doSend = async () => {
    setIsSending(true);
    setSendError(null);
    try {
      const toArray = parseEmailList(to);
      const ccArray = parseEmailList(cc);

      // REQ-01-DIR-07 (persist-before-dispatch) + DIR-01/D10: memorize
      // the confirmed pair BEFORE the send, and only for memorizable
      // keys — junk keys skip the PUT but never block the send.
      if (esClaveDirectorioValida(client.clienteId, client.razonSocial)) {
        try {
          await saveContact({
            ruc: client.clienteId,
            razonSocial: client.razonSocial,
            emailPrincipal: toArray[0] ?? '',
            emailCopia: ccArray.length > 0 ? ccArray.join(', ') : null,
          });
        } catch (persistError) {
          // Persist failed → surface the error and DO NOT send. The
          // operator can retry once the directory is available.
          const message = persistError instanceof Error ? persistError.message : 'error desconocido';
          setSendError(`No se pudo guardar el contacto: ${message}`);
          return;
        }
      }

      // REQ-02 R6/D3: audit metadata travels on every cobranza send —
      // trimmed ruc/razonSocial (junk keys audited as-is, writes are
      // unfiltered), main-currency raw amount and the >0.01 pending
      // count. The route only audits purpose='cobranza', which is the
      // only purpose this composer emits.
      const auditMeta = buildCobranzaAuditMetadata(client);

      const payload: Record<string, unknown> = {
        to: toArray,
        subject,
        html: bodyHtml,
        purpose: 'cobranza', // REQ-01-DIR-08
        ...auditMeta,
      };
      if (ccArray.length > 0) {
        payload.cc = ccArray;
      }
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // HTTP error — extract API error message
        const data: unknown = await res.json().catch(() => ({}));
        const apiError =
          typeof data === 'object' &&
          data !== null &&
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Error al enviar el correo';
        setSendError(apiError);
        return;
      }
      setSentSuccess(true);
      setTimeout(() => {
        onSuccess(`Correo de cobro enviado con éxito a ${client.razonSocial}`);
        onClose();
      }, 1800);
    } catch {
      // Network error (fetch rejected, server unreachable)
      setSendError('Error de conexión');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    // A template is REQUIRED to send (design D8) — the submit button is
    // disabled while bodyHtml is empty; this guard is belt-and-braces.
    if (!bodyHtml) return;
    setShowConfirm(true);
  };

  const handleConfirmSend = () => {
    setShowConfirm(false);
    doSend();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-scale-in flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center space-x-2">
            <Mail className="w-5 h-5 text-sky-500" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Redactar Correo de Cobro
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        {sentSuccess ? (
          <div className="p-12 flex flex-col items-center justify-center text-center space-y-4 flex-1">
            <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-500 border border-emerald-200 dark:border-emerald-800/30 flex items-center justify-center animate-bounce-slow">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">¡Correo Enviado!</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                El correo de cobranza se ha enviado correctamente a {client.razonSocial}.
              </p>
            </div>
          </div>
        ) : showConfirm ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-6 flex-1">
            <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-500 border border-amber-200 dark:border-amber-800/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">¿Confirmar envío?</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                El correo se enviará al siguiente destinatario:
              </p>
            </div>
            <div className="w-full max-w-md text-left space-y-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <p className="text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Para:</span>{' '}
                <span className="text-slate-900 dark:text-white font-mono text-sm">{parseEmailList(to).join(', ')}</span>
              </p>
              {parseEmailList(cc).length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Cc:</span>{' '}
                  <span className="text-slate-900 dark:text-white font-mono text-sm">{parseEmailList(cc).join(', ')}</span>
                </p>
              )}
              <p className="text-sm">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Asunto:</span>{' '}
                <span className="text-slate-900 dark:text-white">{subject}</span>
              </p>
              <p className="text-xs text-slate-400">
                Razón social: {client.razonSocial} — Documentos pendientes: {client.documentos.filter(d => d.saldo > 0.01).length}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-sm font-bold text-white shadow-md shadow-sky-500/10 hover:shadow-sky-500/20 hover:scale-[1.02] transition-all"
              >
                <Send className="w-4 h-4" />
                <span>Confirmar envío</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendEmail} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6 space-y-4 overflow-y-auto flex-1">

              {/* Recipient Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Para (Destinatarios)
                </label>
                <textarea
                  required
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100 font-mono"
                  placeholder="correo1@dominio.com, correo2@dominio.com"
                />
              </div>

              {/* CC Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  CC (Con Copia)
                </label>
                <textarea
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100 font-mono"
                  placeholder="cc@dominio.com, cc2@dominio.com (opcional)"
                />
              </div>

              {/* Template selector (REQ-01-DIR-06) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Plantilla de Cobranza
                </label>
                <SpitchSelector area="cobranza" target="company" onSelect={handleSpitchSelect} />
              </div>

              {/* Email Subject */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Asunto del Correo
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              {/* Email Body — HTML Preview */}
              <div className="space-y-1.5 flex-1 flex flex-col min-h-[220px]">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Cuerpo del Mensaje (Vista Previa HTML)
                </label>
                {/* Sandboxed iframe: scripts/forms/popups are blocked; avoids dangerouslySetInnerHTML entirely */}
                <iframe
                  srcDoc={bodyHtml}
                  title="Vista previa del correo HTML"
                  className="w-full flex-1 rounded-xl border border-slate-200 dark:border-slate-800 min-h-[180px]"
                  sandbox=""
                />
              </div>

              {/* Error message */}
              {sendError && (
                <div className="p-4 rounded-xl bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 flex items-start space-x-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                      Error al enviar
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
                      {sendError}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={doSend}
                    disabled={isSending}
                    className="shrink-0 px-4 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/60 text-xs font-bold text-red-700 dark:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {/* Payment Details Warning info */}
              <div className="p-4 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 flex items-start space-x-2 text-sky-800 dark:text-sky-400">
                <Landmark className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="text-[11px] leading-normal">
                  <span className="font-bold block">Cuentas Bancarias Incluidas</span>
                  La plantilla seleccionada puede incluir los datos de transferencia para el BCP (Soles/Dólares) correspondientes a <strong>HOLOMEDIC S.A.C.</strong> mediante el token <code>{'{{cuentasBancarias}}'}</code>.
                </div>
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                className="w-full sm:w-auto order-3 sm:order-1 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>

              <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2 order-1 sm:order-2">
                <button
                  type="submit"
                  disabled={isSending || !bodyHtml}
                  className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-sm font-bold text-white shadow-md shadow-sky-500/10 hover:shadow-sky-500/20 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Enviar correo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
