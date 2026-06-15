'use client';

import { Eye, Maximize2, Minimize2, X } from 'lucide-react';
import type { ReactElement } from 'react';
import type { SelectionState } from '@/features/envio-resultados/presentation/hooks/useFileTree';

export interface FilesPreviewPaneProps {
  selectionState: SelectionState;
  isMaximized: boolean;
  onClose: () => void;
  onToggleMaximize: () => void;
  ruc: string;
  dni: string;
  idAten: string;
  /**
   * The current folder path inside the patient's tree. `''` for root.
   * Forwarded to the viewer's `renderPreview` as `args.folderPath` so
   * the URL it builds (or the NoPreviewViewer's download href) targets
   * the right subfolder.
   */
  currentPath: string;
}

/**
 * Right pane of the master-detail `FilesModal`. Renders the selected
 * file's preview by delegating to `selectionState.viewer.renderPreview`,
 * or the placeholder when nothing is selected. The top-right corner
 * carries the close (X) and maximize/minimize toggle buttons.
 */
export function FilesPreviewPane({
  selectionState,
  isMaximized,
  onClose,
  onToggleMaximize,
  ruc,
  dni,
  idAten,
  currentPath,
}: FilesPreviewPaneProps): ReactElement {
  const isPreviewing = selectionState.kind === 'previewing';

  return (
    <div className="flex flex-col h-full">
      {/* Top bar — close + maximize toggle, only meaningful when a file is selected */}
      <div className="flex items-center justify-end gap-1 p-2 border-b border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onToggleMaximize}
          disabled={!isPreviewing}
          aria-label={isMaximized ? 'Minimizar' : 'Maximizar'}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
        >
          {isMaximized ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
        {isPreviewing && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista previa"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {isPreviewing ? (
          selectionState.viewer.renderPreview({
            ruc,
            dni,
            idAten,
            folderPath: currentPath,
            name: selectionState.file.name,
          })
        ) : (
          <div
            data-testid="files-preview-placeholder"
            className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3"
          >
            <Eye className="w-10 h-10 text-slate-300" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Selecciona un archivo para previsualizarlo
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
