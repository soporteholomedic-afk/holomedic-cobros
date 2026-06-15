'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { FilesExplorerPane } from '@/features/envio-resultados/presentation/components/FilesExplorerPane';
import { FilesPreviewPane } from '@/features/envio-resultados/presentation/components/FilesPreviewPane';
import { useFileTree } from '@/features/envio-resultados/presentation/hooks/useFileTree';

export interface FilesModalProps {
  ruc: string;
  dni: string;
  idAten: string;
  nombrePaciente: string;
  empresa: string;
  onClose: () => void;
}

/**
 * Modal that lists the files in a patient's archive folder on the LAN
 * share, with per-file download links and a one-click bulk zip.
 *
 * PR-B2 — Master-detail layout: the body is a flex row with the
 * explorer pane on the left (`w-2/5` on ≥ md) and the preview pane on
 * the right (`w-3/5`). On smaller viewports the panes stack
 * (`flex-col md:flex-row`, full-width per pane). The `isMaximized`
 * state lives here (a single `useState`); the explorer collapses to
 * `hidden` and the preview becomes full-width when the user toggles
 * `Maximize2`. `closeSelection` from the hook clears the preview
 * without closing the modal; `onClose` closes the modal entirely.
 */
export function FilesModal({
  ruc,
  dni,
  idAten,
  nombrePaciente,
  empresa,
  onClose,
}: FilesModalProps): ReactElement {
  const { viewState, selectionState, navigate, goUp, selectFile, closeSelection } = useFileTree(ruc, dni, idAten);
  const [zipInFlight, setZipInFlight] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Escape-key close handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isAtRoot = !(viewState.kind === 'ready' && viewState.currentPath !== '');
  const currentPath = viewState.kind === 'ready' ? viewState.currentPath : '';

  const headerTitle = `Archivos — ${nombrePaciente || dni}`;

  const downloadAllHref =
    `/api/files/download-all?` +
    `ruc=${encodeURIComponent(ruc)}&` +
    `dni=${encodeURIComponent(dni)}&` +
    `idAten=${encodeURIComponent(idAten)}&` +
    `nombrePaciente=${encodeURIComponent(nombrePaciente)}&` +
    `empresa=${encodeURIComponent(empresa)}`;

  const hasFiles = viewState.kind === 'ready' && viewState.nodes.some((n) => n.kind === 'file');

  const toggleMaximize = (): void => setIsMaximized((m) => !m);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid="files-modal-backdrop"
    >
      <div
        className="w-full max-w-5xl h-[80vh] min-h-[600px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
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
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMaximize}
              aria-label={isMaximized ? 'Minimizar' : 'Maximizar'}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isMaximized ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body — master-detail: explorer (40%) + preview (60%); stacks on < md */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          <div
            className={
              isMaximized
                ? 'hidden'
                : 'w-full md:w-2/5 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 overflow-y-auto'
            }
            data-testid="files-explorer-container"
          >
            <FilesExplorerPane
              viewState={viewState}
              isAtRoot={isAtRoot}
              onNavigate={navigate}
              onGoUp={goUp}
              onSelect={selectFile}
              ruc={ruc}
              dni={dni}
              idAten={idAten}
            />
          </div>
          <div
            className={isMaximized ? 'w-full overflow-auto' : 'w-full md:w-3/5 overflow-auto'}
            data-testid="files-preview-container"
          >
            <FilesPreviewPane
              selectionState={selectionState}
              isMaximized={isMaximized}
              onClose={closeSelection}
              onToggleMaximize={toggleMaximize}
              ruc={ruc}
              dni={dni}
              idAten={idAten}
              currentPath={currentPath}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors"
          >
            Cerrar
          </button>
          {hasFiles ? (
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
