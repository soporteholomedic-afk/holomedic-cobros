'use client';

import { AlertTriangle, FileText, RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';
import type { FileNode } from '@/features/envio-resultados/domain/ports';
import type { ReadyFilesState } from '@/features/envio-resultados/presentation/hooks/useReadyFiles';

/**
 * The fixed folder that `useReadyFiles` scans. Hard-coded here for
 * the download URL because the ready pane is, by contract, the
 * "LEGAJOS-only" view (see `useReadyFiles.ts`). If the scope ever
 * widens, lift this back to a prop driven by the hook.
 */
const READY_FOLDER = 'LEGAJOS';

export interface FilesReadyPaneProps {
  state: ReadyFilesState;
  ruc: string;
  dni: string;
  idAten: string;
  onSelect: (file: FileNode) => void;
  /**
   * Set of fileRefs currently selected. Each ref is `"::" + file.name`
   * (the ready pane has no folder prefix). When `undefined` the pane
   * defaults every row to `checked` — preserves backward compatibility
   * for callers that haven't been wired up to the selection map yet
   * (this PR is the primitive; PR #3 will own the actual `Map`).
   */
  selectedRefs?: ReadonlySet<string>;
  /** Fired when the user toggles a row's checkbox. */
  onToggle?: (ref: string, file: FileNode) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadHref(props: FilesReadyPaneProps, name: string): string {
  return (
    `/api/files/download?ruc=${encodeURIComponent(props.ruc)}` +
    `&dni=${encodeURIComponent(props.dni)}` +
    `&idAten=${encodeURIComponent(props.idAten)}` +
    `&path=${encodeURIComponent(READY_FOLDER)}` +
    `&filename=${encodeURIComponent(name)}`
  );
}

/**
 * Left pane of `FilesModal` when the active tab is "Listo para enviar".
 *
 * Flat list of the files under LEGAJOS whose name matches the
 * `^\d+(CERT|EXPED)\.pdf$` pattern. Every match is a PDF, so the row
 * icon is fixed (`FileText`). The pane is purposely NOT navigable —
 * the explorer tab covers free navigation; this tab is a focused
 * checklist of the documents the operator actually needs to send.
 */
export function FilesReadyPane(props: FilesReadyPaneProps): ReactElement {
  const { state } = props;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
          {props.dni} — {props.idAten} / {READY_FOLDER}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {state.kind === 'loading' && (
          <div data-testid="files-ready-skeleton" className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse"
              />
            ))}
          </div>
        )}

        {state.kind === 'empty' && (
          <p
            data-testid="files-ready-empty"
            className="text-sm text-slate-500 dark:text-slate-400 text-center py-12"
          >
            Sin archivos listos para enviar
          </p>
        )}

        {state.kind === 'error' && (
          <div
            data-testid="files-ready-error"
            className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm space-y-2"
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>No se pudieron cargar los archivos</span>
            </div>
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold">
              <RefreshCw className="w-4 h-4" />
              <span>Reintentar</span>
            </div>
          </div>
        )}

        {state.kind === 'ready' && (
          <ul data-testid="files-ready-list" className="space-y-1.5">
            {state.files.map((file) => {
              const fileRef = `::${file.name}`;
              const isChecked = props.selectedRefs?.has(fileRef) ?? true;
              return (
                <li
                  key={file.name}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-950/20"
                >
                  <label className="flex items-center space-x-2 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        e.stopPropagation();
                        props.onToggle?.(fileRef, file);
                      }}
                      aria-label={`Seleccionar ${file.name}`}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <FileText className="w-4 h-4 flex-shrink-0 text-red-500" />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {file.name}
                    </span>
                    <span className="text-xs font-mono text-slate-400 flex-shrink-0">
                      {formatSize(file.sizeBytes)}
                    </span>
                  </label>
                  <div className="flex items-center space-x-1.5 flex-shrink-0">
                    <button
                      onClick={() => props.onSelect(file)}
                      className="px-2 py-1 rounded-md text-xs font-semibold bg-sky-500 text-white hover:bg-sky-600"
                      aria-label="Visualizar"
                    >
                      Visualizar
                    </button>
                    <a
                      href={downloadHref(props, file.name)}
                      className="px-2 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100"
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
    </div>
  );
}
