'use client';

import { Fragment, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight, Forward, Search } from 'lucide-react';
import type {
  EnvioAttachmentSnapshot,
  EnvioSendStatus,
} from '@/features/envio-resultados/domain/entities';
import { parseDateParam } from '@/lib/dates';
import { useEnviosHistory } from '../hooks/useEnviosHistory';

const EM_DASH = '\u2014';
const TABLE_COLUMNS = 8;

/**
 * Presentation timezone decision (PR3): `sentAt` is stored UTC and
 * rendered in the browser's local timezone (`es-PE`, the repo's only
 * locale precedent — `interpolateSpitch.ts`; Peru is UTC-5, no DST).
 * Invalid values fall back to the raw ISO.
 */
export function formatSentAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

function StatusBadge({ status }: { status: EnvioSendStatus }) {
  if (status === 'enviado') {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
        Enviado
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700">
        Error
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
      Pendiente
    </span>
  );
}

function summarizeRecipients(to: string[], cc: string[]): string {
  if (to.length === 0 && cc.length === 0) return EM_DASH;
  const parts: string[] = [];
  if (to.length > 0) {
    const rest = to.length - Math.min(to.length, 2);
    parts.push(to.slice(0, 2).join(', ') + (rest > 0 ? ` +${rest}` : ''));
  }
  if (cc.length > 0) parts.push(`CC: ${cc.length}`);
  return parts.join(' · ');
}

/** Expandable detail — reference data only; `bodyHtml` is never rendered (D10). */
function AttachmentDetail({ attachments }: { attachments: EnvioAttachmentSnapshot[] }) {
  if (attachments.length === 0) {
    return <p className="text-xs text-slate-500">Sin adjuntos registrados.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100 text-xs text-slate-600">
      {attachments.map((att, idx) => (
        <li key={idx} className="py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {att.source === 'unc' ? (
            <>
              <span className="font-medium text-slate-700">
                {att.path ? `${att.path}/` : ''}
                {att.storedName}
              </span>
              {att.deliveryName !== att.storedName && (
                <span>
                  entregado como: <span className="font-medium text-slate-700">{att.deliveryName}</span>
                </span>
              )}
              <span>RUC {att.ruc || EM_DASH}</span>
              <span>DNI {att.dni || EM_DASH}</span>
              <span>IdAten {att.idAten || EM_DASH}</span>
            </>
          ) : (
            <>
              <span className="font-medium text-slate-700">{att.storedName}</span>
              <span>{att.contentType || EM_DASH}</span>
              <span>{formatBytes(att.sizeBytes)}</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
                ya no disponible
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function DateInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="w-full lg:w-40">
      <label
        htmlFor={id}
        className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
      >
        {label}
      </label>
      <input
        type="date"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
      />
    </div>
  );
}

/**
 * Buscador + results table for `/consolidados/historial-envios` (PR3).
 * URL-param driven search (submit pushes `q`/dates; data via
 * `useEnviosHistory` — PR2 server-side paging). Badges: enviado green ·
 * error red + visible errorDetail · pendiente grey. Expandable detail:
 * UNC durable address (+ deliveryName when renamed); local metadata +
 * amber "ya no disponible" (BR11). Reenviar pushes
 * `/consolidados?reenvio=<id>` (inert; PR4 hydrates). `bodyHtml` is
 * NEVER rendered (D10). Loading/error+Reintentar/empty states per
 * PatientsList conventions.
 */
export function HistoryList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQ = searchParams.get('q') ?? '';
  const [qInput, setQInput] = useState(urlQ);
  const [fechaInicio, setFechaInicio] = useState(() =>
    parseDateParam(searchParams.get('fechaInicio'), ''),
  );
  const [fechaFin, setFechaFin] = useState(() =>
    parseDateParam(searchParams.get('fechaFin'), ''),
  );
  const urlPage = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const [retryNonce, setRetryNonce] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { rows, total, page, pageSize, loading, error } = useEnviosHistory(
    urlQ,
    fechaInicio,
    fechaFin,
    urlPage,
    retryNonce,
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isInvalidRange = fechaInicio.length > 0 && fechaFin.length > 0 && fechaInicio > fechaFin;

  const buildUrl = (nextPage: number): string => {
    const params = new URLSearchParams();
    if (urlQ) params.set('q', urlQ);
    if (fechaInicio) params.set('fechaInicio', fechaInicio);
    if (fechaFin) params.set('fechaFin', fechaFin);
    if (nextPage > 1) params.set('page', String(nextPage));
    const query = params.toString();
    return query ? `/consolidados/historial-envios?${query}` : '/consolidados/historial-envios';
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvalidRange) return;
    const params = new URLSearchParams();
    const trimmed = qInput.trim();
    if (trimmed) params.set('q', trimmed);
    if (fechaInicio) params.set('fechaInicio', fechaInicio);
    if (fechaFin) params.set('fechaFin', fechaFin);
    const query = params.toString();
    router.push(query ? `/consolidados/historial-envios?${query}` : '/consolidados/historial-envios');
  };

  // The buscador renders in EVERY state: unlike PatientsList (client-side
  // filter), search is server-side — hiding it on empty/error would trap
  // the user with no way to refine the filters.
  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSearch}
        className="flex flex-col lg:flex-row gap-4 items-end p-4 bg-white rounded-xl border border-slate-200 shadow-sm"
      >
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            aria-label="Buscar envíos"
            placeholder="Buscar por destinatario, empresa, asunto, DNI, paciente..."
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm text-slate-700"
          />
        </div>
        <DateInput id="fechaInicio" label="Fecha Inicio" value={fechaInicio} onChange={setFechaInicio} />
        <DateInput id="fechaFin" label="Fecha Fin" value={fechaFin} onChange={setFechaFin} />
        <button
          type="submit"
          disabled={isInvalidRange}
          className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-colors cursor-pointer shadow-sm h-[38px] lg:w-auto w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Filtrar
        </button>
      </form>

      {isInvalidRange && (
        <p role="alert" className="text-xs font-medium text-rose-600 -mt-4">
          La fecha de inicio no puede ser mayor a la fecha final.
        </p>
      )}

      {/* ---- Loading state ---- */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Cargando historial de envíos...</p>
          </div>
        </div>
      )}

      {/* ---- Error state ---- */}
      {!loading && error && (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg mb-4">{error}</p>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* ---- Empty state ---- */}
      {!loading && !error && rows.length === 0 && (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <p className="text-slate-500 text-base">
            No se encontraron envíos que coincidan con los filtros seleccionados
          </p>
        </div>
      )}

      {/* ---- Results table ---- */}
      {!loading && !error && rows.length > 0 && (
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-600">Fecha</th>
                <th className="px-4 py-3 font-medium text-slate-600">Estado</th>
                <th className="px-4 py-3 font-medium text-slate-600">Empresa</th>
                <th className="px-4 py-3 font-medium text-slate-600">Destinatarios</th>
                <th className="px-4 py-3 font-medium text-slate-600">Asunto</th>
                <th className="px-4 py-3 font-medium text-slate-600">Enviado por</th>
                <th className="px-4 py-3 font-medium text-slate-600">Adjuntos</th>
                <th className="px-4 py-3 font-medium text-slate-600">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr className="hover:bg-slate-50 align-top">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {formatSentAt(row.sentAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                        {row.status === 'error' && row.errorDetail && (
                          <p
                            className="mt-1 max-w-48 truncate text-xs text-rose-600"
                            title={row.errorDetail}
                          >
                            {row.errorDetail}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{row.companyName || EM_DASH}</td>
                      <td
                        className="px-4 py-3 text-slate-600 max-w-56 truncate"
                        title={row.toRecipients.join(', ')}
                      >
                        {summarizeRecipients(row.toRecipients, row.ccRecipients)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-56 truncate" title={row.subject}>
                        {row.subject || EM_DASH}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {row.sentBy || EM_DASH}
                      </td>
                      <td className="px-4 py-3">
                        {row.attachments.length === 0 ? (
                          <span className="text-xs text-slate-500">0</span>
                        ) : (
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
                          >
                            {expanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            {row.attachments.length} adjunto{row.attachments.length === 1 ? '' : 's'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => router.push(`/consolidados?reenvio=${row.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100"
                        >
                          <Forward className="w-3.5 h-3.5" />
                          Reenviar
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={TABLE_COLUMNS} className="px-4 py-3 bg-slate-50/70">
                          <AttachmentDetail attachments={row.attachments} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => router.push(buildUrl(page - 1))}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <p className="text-xs text-slate-500">
            Página {page} de {totalPages}
          </p>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => router.push(buildUrl(page + 1))}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
