'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { X, Send, Mail, CheckCircle2, Landmark, AlertTriangle } from 'lucide-react';

import { EmailComposerShell } from '@/components/email/EmailComposerShell';
import { EmailPreviewPanel } from '@/components/email/EmailPreviewPanel';
import { EmailControlsPanel } from '@/components/email/EmailControlsPanel';
import { EmailBodyField } from '@/components/email/EmailBodyField';
import { LocalFileDropZone } from '@/components/email/LocalFileDropZone';
import type { EmailBodyEditorHandle } from '@/components/email/EmailBodyEditor';
import { SpitchSelector } from '@/features/envio-resultados/presentation/components/SpitchSelector';
import { interpolate } from '@/features/envio-resultados/presentation/helpers/interpolate';
import { buildTokenResolverRegistry } from '@/features/envio-resultados/presentation/helpers/tokenResolvers/buildTokenResolverRegistry';
import type { Spitch } from '@/features/envio-resultados/domain/entities';
import { useCompanyContact } from '@/features/cobranza/presentation/hooks/useCompanyContact';
import { esClaveDirectorioValida } from '@/features/cobranza/domain/entities';
import { buildCobranzaInterpolationContext } from '@/features/cobranza/presentation/helpers/buildCobranzaInterpolationContext';
import { buildCobranzaAuditMetadata } from '@/features/cobranza/presentation/helpers/buildCobranzaAuditMetadata';
import { useFirmaCorreo } from '@/features/firma-correo/presentation/hooks/useFirmaCorreo';
import { replaceFirmaFallback } from '@/features/firma-correo/presentation/helpers/replaceFirmaFallback';
import type { ClienteGroup } from '@/types';

import { useSendCobranzaEmail } from '../hooks/useSendCobranzaEmail';

const EmailBodyEditorLazy = lazy(() =>
  import('@/components/email/EmailBodyEditor').then((m) => ({ default: m.EmailBodyEditor })),
);

/** Guard + route/config caps (requirements; the route re-validates). */
const MAX_RECIPIENTS = 10;
const MAX_ATTACHMENT_COUNT = 10;
const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;
const SUCCESS_TIMEOUT_MS = 1800;

interface CobranzaEmailComposerProps {
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

/**
 * Cobranza email composer (envio-correos-facturacion) — replaces the
 * single-column EmailComposerModal with the shared two-panel module
 * (preview LEFT / controls RIGHT) inside the full-screen shell.
 *
 * All send logic lives in `useSendCobranzaEmail` (spec: no raw fetch in
 * the component). Preserved behaviors: template-required guard, ≤10
 * recipients, explicit confirm dialog before dispatch, RUC directory
 * prefill with persist-before-dispatch, and the ~1.8s in-composer
 * success animation.
 */
export function CobranzaEmailComposer({ client, onClose, onSuccess }: CobranzaEmailComposerProps) {
  // editor-firmas PR4 — the signature is composed SERVER-SIDE from the
  // sender's stored fields (GET /api/plantillas/firma) and inlined at
  // {{firma}} by the token resolver. Empty firmaHtml → the resolver's
  // `[Falta configurar firma]` fallback (contract unchanged).
  const { firmaHtml } = useFirmaCorreo();

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
  const [selectedSpitch, setSelectedSpitch] = useState<Spitch | null>(null);
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [isEditingBody, setIsEditingBody] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const editorRef = useRef<EmailBodyEditorHandle>(null);

  const { send, isSending, error: sendError } = useSendCobranzaEmail();

  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Async seed of the operator-editable to/cc fields from the directory
  // (REQ-01-DIR-03). Editable state seeded by a network response — the
  // EmailEditor initialEmail seeding precedent.
  useEffect(() => {
    if (status !== 'populated' || !contacto) return;
    /* eslint-disable react-hooks/set-state-in-effect -- async seed of editable fields from the directory GET; cannot be derived at render */
    setTo(contacto.emailPrincipal);
    setCc(contacto.emailCopia ?? '');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [status, contacto]);

  const toList = useMemo(() => parseEmailList(to), [to]);
  const ccList = useMemo(() => parseEmailList(cc), [cc]);
  const tooManyRecipients = toList.length > MAX_RECIPIENTS;
  // Template required (design D8) + recipient guards: 1..10 addresses.
  const canSend = bodyHtml !== '' && toList.length > 0 && !tooManyRecipients;

  // Template selection → real-time interpolation via the interpolate()
  // CORE with the cobranza registry (design D3). Event-driven:
  // bodyHtml/subject are edit-transient state, re-interpolated only when
  // a template is selected.
  const handleSpitchSelect = useCallback(
    (spitch: Spitch) => {
      setSelectedSpitch(spitch);
      // editor-firmas PR4 — {{firma}} interpolates the server-composed
      // signature (fetched on mount); NO stripping, NO client-side
      // rebuild. If the template selection wins the fetch race the
      // fallback marker is baked here; the recovery effect below swaps
      // it for the real firma once the fetch lands (no reselect).
      const interpolated = interpolate(
        spitch.bodyHtml,
        spitch.subject,
        buildCobranzaInterpolationContext(client, firmaHtml),
        buildTokenResolverRegistry('cobranza'),
      );
      setSubject(interpolated.subject);
      setBodyHtml(interpolated.html);
      editorRef.current?.loadHtml(interpolated.html);
    },
    [client, firmaHtml],
  );

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

  const handleLocalAdd = useCallback(
    (incoming: File[]) => {
      // UI-level half of the 10-file cap (route re-validates in Unit 3).
      const remaining = MAX_ATTACHMENT_COUNT - localFiles.length;
      if (incoming.length > remaining) {
        setAttachmentNotice(
          `Máximo ${MAX_ATTACHMENT_COUNT} archivos adjuntos: se agregaron solo ${Math.max(remaining, 0)}.`,
        );
      } else {
        setAttachmentNotice(null);
      }
      setLocalFiles((prev) => [...prev, ...incoming.slice(0, Math.max(remaining, 0))]);
    },
    [localFiles.length],
  );

  const handleLocalRemove = useCallback((index: number) => {
    setLocalFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleRequestSend = useCallback(() => {
    if (!canSend) return;
    setShowConfirm(true);
  }, [canSend]);

  const performSend = useCallback(async () => {
    // REQ-01-DIR-07 (persist-before-dispatch) + DIR-01/D10: memorize the
    // confirmed pair BEFORE the send via the hook's directory port, and
    // only for memorizable keys — junk keys skip the PUT but never
    // block the send.
    const directory = esClaveDirectorioValida(client.clienteId, client.razonSocial)
      ? {
          save: async () => {
            await saveContact({
              ruc: client.clienteId,
              razonSocial: client.razonSocial,
              emailPrincipal: toList[0] ?? '',
              emailCopia: ccList.length > 0 ? ccList.join(', ') : null,
            });
          },
        }
      : undefined;

    const ok = await send({
      to: toList,
      cc: ccList.length > 0 ? ccList : undefined,
      subject,
      html: bodyHtml,
      attachments: localFiles,
      // REQ-02 R6/D3: audit metadata travels on every cobranza send.
      auditMeta: buildCobranzaAuditMetadata(client),
      directory,
    });

    if (ok) {
      setSentSuccess(true);
      setTimeout(() => {
        onSuccess(`Correo de cobro enviado con éxito a ${client.razonSocial}`);
        onClose();
      }, SUCCESS_TIMEOUT_MS);
    }
  }, [ccList, client, bodyHtml, localFiles, onClose, onSuccess, saveContact, send, subject, toList]);

  const handleConfirmSend = useCallback(() => {
    setShowConfirm(false);
    void performSend();
  }, [performSend]);

  return (
    <EmailComposerShell>
      {sentSuccess ? (
        <div className="flex min-h-[80vh] flex-col items-center justify-center text-center space-y-4">
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
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ===== LEFT PANEL: Preview + attachments (shared module) ===== */}
            <EmailPreviewPanel
              subject={subject}
              html={bodyHtml}
              emptyHint="Seleccione una plantilla de cobranza para previsualizar"
              templateName={selectedSpitch?.name}
              dropZoneSlot={
                <div className="space-y-3">
                  <LocalFileDropZone
                    files={localFiles}
                    onAdd={handleLocalAdd}
                    onRemove={handleLocalRemove}
                    maxTotalBytes={MAX_ATTACHMENT_TOTAL_BYTES}
                  />
                  {attachmentNotice && (
                    <p
                      role="alert"
                      data-testid="attachment-notice"
                      className="text-xs text-red-600 dark:text-red-400"
                    >
                      {attachmentNotice}
                    </p>
                  )}
                  {/* Payment details info (preserved from the modal) */}
                  <div className="p-4 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 flex items-start space-x-2 text-sky-800 dark:text-sky-400">
                    <Landmark className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="text-[11px] leading-normal">
                      <span className="font-bold block">Cuentas Bancarias Incluidas</span>
                      La plantilla seleccionada puede incluir los datos de transferencia para el BCP (Soles/Dólares) correspondientes a <strong>HOLOMEDIC S.A.C.</strong> mediante el token <code>{'{{cuentasBancarias}}'}</code>.
                    </div>
                  </div>
                </div>
              }
            />

            {/* ===== RIGHT PANEL: Controls (shared module) ===== */}
            <EmailControlsPanel
              to={to}
              onToChange={setTo}
              cc={cc}
              onCcChange={setCc}
              subject={subject}
              onSubjectChange={setSubject}
              headerSlot={
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Mail className="w-5 h-5 text-sky-500" />
                    <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                      Redactar Correo de Cobro
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSending}
                    aria-label="Cerrar"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              }
              templateSlot={
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Plantilla de Cobranza
                  </label>
                  <SpitchSelector area="cobranza" target="company" onSelect={handleSpitchSelect} />
                </div>
              }
              bodySlot={
                <EmailBodyField
                  html={bodyHtml}
                  isEditing={isEditingBody}
                  onEditingChange={setIsEditingBody}
                  emptyHint="Seleccione una plantilla de cobranza para previsualizar"
                  editorSlot={isClient ? (
                    <Suspense
                      fallback={
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-sm text-slate-400">
                          Cargando editor...
                        </div>
                      }
                    >
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
              sendDisabled={!canSend}
              sending={isSending}
            />
          </div>

          {/* Sending indicator (spinner feedback while the POST is in flight) */}
          {isSending && (
            <p
              data-testid="sending-indicator"
              className="mt-4 text-sm font-medium text-sky-700 dark:text-sky-400 flex items-center gap-2"
            >
              <span className="w-4 h-4 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
              Enviando...
            </p>
          )}

          {/* Recipient guard warning */}
          {tooManyRecipients && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              Máximo {MAX_RECIPIENTS} destinatarios en el campo Para.
            </p>
          )}

          {/* Send error + retry (retry skips the confirm dialog) */}
          {sendError && (
            <div className="mt-4 p-4 rounded-xl bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 flex items-start space-x-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Error al enviar
                </p>
                <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">{sendError}</p>
              </div>
              <button
                type="button"
                onClick={() => void performSend()}
                disabled={isSending}
                className="shrink-0 px-4 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/60 text-xs font-bold text-red-700 dark:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Explicit confirm dialog before dispatch */}
          {showConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-full shadow-xl text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-500 border border-amber-200 dark:border-amber-800/30 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                  ¿Confirmar envío?
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  El correo se enviará al siguiente destinatario:
                </p>
                <div className="mt-4 text-left space-y-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <p className="text-sm">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Para:</span>{' '}
                    <span className="text-slate-900 dark:text-white font-mono text-sm">{toList.join(', ')}</span>
                  </p>
                  {ccList.length > 0 && (
                    <p className="text-sm">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Cc:</span>{' '}
                      <span className="text-slate-900 dark:text-white font-mono text-sm">{ccList.join(', ')}</span>
                    </p>
                  )}
                  <p className="text-sm">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Asunto:</span>{' '}
                    <span className="text-slate-900 dark:text-white">{subject}</span>
                  </p>
                  {localFiles.length > 0 && (
                    <p className="text-sm">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Adjuntos:</span>{' '}
                      <span className="text-slate-900 dark:text-white">
                        {localFiles.length} {localFiles.length === 1 ? 'archivo adjunto' : 'archivos adjuntos'}
                      </span>
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    Razón social: {client.razonSocial} — Documentos pendientes: {client.documentos.filter((d) => d.saldo > 0.01).length}
                  </p>
                </div>
                <div className="mt-6 flex justify-center gap-3">
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
            </div>
          )}
        </>
      )}
    </EmailComposerShell>
  );
}
