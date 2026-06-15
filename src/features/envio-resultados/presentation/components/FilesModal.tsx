'use client';

import { useEffect, useState, type ReactElement } from 'react';
import {
  X,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  File as FileGeneric,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  usePatientFiles,
  type FileEntry,
} from '@/features/envio-resultados/presentation/hooks/usePatientFiles';

export interface FilesModalProps {
  ruc: string;
  dni: string;
  idAten: string;
  nombrePaciente: string;
  empresa: string;
  onClose: () => void;
}

type FilesState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; files: FileEntry[] };

/**
 * Map a file extension to a lucide icon and an optional accent color.
 * Defaults to a generic `File` icon for unknown extensions.
 */
function iconByExtension(name: string): { Icon: typeof FileGeneric; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return { Icon: FileText, color: 'text-red-500' };
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp') {
    return { Icon: FileImage, color: 'text-sky-500' };
  }
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
    return { Icon: FileSpreadsheet, color: 'text-emerald-500' };
  }
  if (ext === 'doc' || ext === 'docx') {
    return { Icon: FileText, color: 'text-blue-500' };
  }
  if (ext === 'zip' || ext === 'rar' || ext === '7z') {
    return { Icon: FileArchive, color: 'text-amber-500' };
  }
  return { Icon: FileGeneric, color: 'text-slate-500' };
}

/** Format a byte count into KB/MB for display. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Modal that lists the files in a patient's archive folder on the LAN
 * share, with per-file download links and a one-click bulk zip.
 *
 * The modal is a child of the parent component tree (no portal) and
 * mirrors the `CompanyDetailModal` Tailwind conventions: fixed inset-0
 * backdrop, header, scrollable body, footer.
 */
export function FilesModal({
  ruc,
  dni,
  idAten,
  nombrePaciente,
  empresa,
  onClose,
}: FilesModalProps): ReactElement {
  const { files, loading, error, refetch } = usePatientFiles(ruc, dni, idAten);
  const [zipInFlight, setZipInFlight] = useState(false);

  // Escape-key close handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const state: FilesState = loading
    ? { kind: 'loading' }
    : error
    ? { kind: 'error', message: error.message }
    : files.length === 0
    ? { kind: 'empty' }
    : { kind: 'ready', files };

  const headerTitle = `Archivos — ${nombrePaciente || dni}`;

  const downloadAllHref =
    `/api/files/download-all?` +
    `ruc=${encodeURIComponent(ruc)}&` +
    `dni=${encodeURIComponent(dni)}&` +
    `idAten=${encodeURIComponent(idAten)}&` +
    `nombrePaciente=${encodeURIComponent(nombrePaciente)}&` +
    `empresa=${encodeURIComponent(empresa)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="files-modal-backdrop"
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={headerTitle}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-950/20">
          <div className="space-y-1">
            <span className="text-xs font-bold text-sky-500 uppercase tracking-widest">
              Archivos
            </span>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
              {headerTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {state.kind === 'loading' && (
            <div data-testid="files-skeleton" className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse"
                />
              ))}
            </div>
          )}

          {state.kind === 'empty' && (
            <p
              data-testid="files-empty"
              className="text-sm text-slate-500 dark:text-slate-400 text-center py-12"
            >
              No hay archivos para esta ficha
            </p>
          )}

          {state.kind === 'error' && (
            <div
              data-testid="files-error"
              className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm space-y-3"
            >
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>No se pudieron cargar los archivos</span>
              </div>
              <button
                onClick={refetch}
                className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 font-semibold transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reintentar</span>
              </button>
            </div>
          )}

          {state.kind === 'ready' && (
            <ul data-testid="files-list" className="space-y-2">
              {state.files.map((f) => {
                const { Icon, color } = iconByExtension(f.name);
                const href =
                  `/api/files/download?` +
                  `ruc=${encodeURIComponent(ruc)}&` +
                  `dni=${encodeURIComponent(dni)}&` +
                  `idAten=${encodeURIComponent(idAten)}&` +
                  `filename=${encodeURIComponent(f.name)}`;
                return (
                  <li
                    key={f.name}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-950/20"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {f.name}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <span className="text-xs font-mono text-slate-400">
                        {formatSize(f.sizeBytes)}
                      </span>
                      <a
                        href={href}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100"
                        download
                      >
                        Descargar
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors"
          >
            Cerrar
          </button>
          {state.kind === 'ready' && state.files.length > 0 ? (
            <a
              href={downloadAllHref}
              onClick={() => setZipInFlight(true)}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 ${
                zipInFlight
                  ? 'bg-slate-400 cursor-wait'
                  : 'bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 shadow-sky-500/20 hover:scale-[1.03]'
              }`}
              aria-disabled={zipInFlight ? 'true' : 'false'}
            >
              {zipInFlight ? 'Generando zip...' : 'Descargar todos'}
            </a>
          ) : (
            <a
              href={downloadAllHref}
              onClick={(e) => e.preventDefault()}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-300 dark:bg-slate-700 cursor-not-allowed"
              aria-disabled="true"
            >
              Descargar todos
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
