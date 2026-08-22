'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Clock, Copy } from 'lucide-react';

import type { EstadoEnvioCobranza } from '../../domain/entities';
import { formatNumber } from '@/utils/excelParser';
import { buildInfocorteExtract } from '../helpers/buildInfocorteExtract';
import { useCobranzaHistorial } from '../hooks/useCobranzaHistorial';

const EM_DASH = '\u2014';
const TABLE_COLUMNS = 7;
const TABLE_HEADERS = [
  'Fecha',
  'Estado',
  'Destinatarios',
  'Monto',
  'Comprobantes',
  'Enviado por',
];
const COPIED_FEEDBACK_MS = 2000;

/**
 * Stored UTC `fechaEnvio` rendered in the browser's local timezone
 * with `es-PE`, the repo's only locale precedent (Peru is UTC-5, no
 * DST — HistoryList.formatSentAt copy; invalid values fall back to
 * the raw ISO). The Infocorte EXTRACT is the one that forces
 * America/Lima — this table follows the HistoryList convention.
 */
function formatFechaEnvio(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

/** Status badge styles: SUCCESS green · FAILED red (BADGE_STYLES pattern). */
const BADGE_STYLES: Record<EstadoEnvioCobranza, { label: string; className: string }> = {
  SUCCESS: { label: 'Enviado', className: 'bg-emerald-50 text-emerald-700' },
  FAILED: { label: 'Error', className: 'bg-rose-50 text-rose-700' },
};

function StatusBadge({ estado }: { estado: EstadoEnvioCobranza }) {
  const badge = BADGE_STYLES[estado];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function summarizeRecipients(to: string[], cc: string[] | null): string {
  if (to.length === 0 && (cc === null || cc.length === 0)) return EM_DASH;
  const parts: string[] = [];
  if (to.length > 0) {
    const rest = to.length - Math.min(to.length, 2);
    parts.push(to.slice(0, 2).join(', ') + (rest > 0 ? ` +${rest}` : ''));
  }
  if (cc !== null && cc.length > 0) parts.push(`CC: ${cc.length}`);
  return parts.join(' · ');
}

/**
 * Legacy clipboard path for environments without
 * `navigator.clipboard` (http/insecure contexts, older WebViews —
 * design §4.3 R5.2): a hidden-but-selectable textarea plus
 * `document.execCommand('copy')`. Returns whether the copy landed.
 */
function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('data-copy-fallback', 'historial-infocorte');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.setAttribute('aria-hidden', 'true');
  textarea.setAttribute('tabindex', '-1');
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

export interface HistorialNotificacionesProps {
  ruc: string;
  razonSocial: string;
}

/**
 * Per-client cobranza communication audit history (REQ-02 R4/R5).
 * Self-contained: resolves its own data through `useCobranzaHistorial`
 * and renders the states per HistoryList conventions — loading
 * spinner · error + Reintentar · informational skip for junk keys ·
 * empty state (history accrues from deployment forward) · table with
 * expandable rows (full to/cc lists and the FAILED error detail).
 * "Copiar extracto" places the plain-text Infocorte chronology on the
 * clipboard (API first, textarea fallback, inline failure text).
 */
export function HistorialNotificaciones({ ruc, razonSocial }: HistorialNotificacionesProps) {
  const { envios, status, error, retry } = useCobranzaHistorial(ruc);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Copied-feedback timer cleanup on unmount.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const markCopied = () => {
    setCopied(true);
    setCopyFailed(false);
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  };

  const handleCopy = async () => {
    const text = buildInfocorteExtract(envios, ruc, razonSocial);
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch {
      // Rejection or missing API — legacy path (R5.2). A failure here
      // surfaces inline; the operator can still select the table.
      if (copyWithTextarea(text)) {
        markCopied();
      } else {
        setCopyFailed(true);
      }
    }
  };

  const renderCopyButton = () => (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={envios.length === 0}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? '¡Extracto copiado!' : 'Copiar extracto'}
    </button>
  );

  const renderBody = () => {
    if (status === 'loading') {
      return (
        <div className="flex items-center justify-center py-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Cargando historial de notificaciones...</p>
          </div>
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="text-center py-10">
          <p className="text-slate-500 text-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      );
    }

    if (status === 'skipped') {
      return (
        <div className="text-center py-10 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-2xl">
          <p className="text-slate-500 text-sm px-6">
            El identificador del cliente (RUC/DNI) no es válido para consultar el historial de
            envíos.
          </p>
        </div>
      );
    }

    if (envios.length === 0) {
      return (
        <div className="text-center py-10 bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 rounded-2xl">
          <p className="text-slate-500 text-sm">
            Aún no hay envíos de cobranza registrados para este cliente
          </p>
          <p className="text-slate-400 text-xs mt-1 px-6">
            El historial de comunicaciones se registra a partir del despliegue del módulo de
            auditoría.
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950/30 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
              <th className="px-3 py-3 w-8" aria-label="Detalle" />
              {TABLE_HEADERS.map((header) => (
                <th key={header} className="px-4 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
            {envios.map((envio) => {
              const expanded = expandedId === envio.id;
              return (
                <Fragment key={envio.id}>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors align-top">
                    <td className="px-3 py-3.5">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label="Ver detalle del envío"
                        onClick={() => setExpandedId(expanded ? null : envio.id)}
                        className="inline-flex items-center text-slate-400 hover:text-sky-600 transition-colors"
                      >
                        {expanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                      {formatFechaEnvio(envio.fechaEnvio)}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge estado={envio.estadoEnvio} />
                    </td>
                    <td
                      className="px-4 py-3.5 text-slate-600 max-w-56 truncate"
                      title={envio.destinatarios.join(', ')}
                    >
                      {summarizeRecipients(envio.destinatarios, envio.copias)}
                    </td>
                    <td className="px-4 py-3.5 font-mono whitespace-nowrap">
                      {envio.montoReclamado === null
                        ? EM_DASH
                        : `${envio.moneda ?? ''} ${formatNumber(envio.montoReclamado)}`.trim()}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">{envio.comprobantesCount ?? EM_DASH}</td>
                    <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                      {envio.enviadoPor}
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={TABLE_COLUMNS} className="px-4 py-3 bg-slate-50/70 dark:bg-slate-950/30">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
                          <div>
                            <dt className="font-semibold text-slate-700 dark:text-slate-300">
                              Destinatarios
                            </dt>
                            <dd className="font-mono break-all">{envio.destinatarios.join(', ')}</dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-slate-700 dark:text-slate-300">
                              Copias
                            </dt>
                            <dd className="font-mono break-all">
                              {envio.copias !== null && envio.copias.length > 0
                                ? envio.copias.join(', ')
                                : '—'}
                            </dd>
                          </div>
                          {envio.estadoEnvio === 'FAILED' && envio.errorDetalle !== null && (
                            <div className="sm:col-span-2">
                              <dt className="font-semibold text-rose-600 dark:text-rose-400">Error</dt>
                              <dd className="break-words">{envio.errorDetalle}</dd>
                            </div>
                          )}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section aria-label="Historial de notificaciones de cobranza">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-2">
          <Clock className="w-4 h-4 text-sky-500" />
          <span>Historial de Notificaciones</span>
        </h3>
        {status === 'ready' && renderCopyButton()}
      </div>
      {status === 'ready' && copyFailed && (
        <p role="alert" className="text-xs font-medium text-rose-600 mb-2">
          No se pudo copiar el extracto. Seleccione la tabla manualmente.
        </p>
      )}
      {renderBody()}
    </section>
  );
}
