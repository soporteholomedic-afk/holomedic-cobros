'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  File as FileGeneric,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  RefreshCw,
} from 'lucide-react';
import type { ReactElement } from 'react';
import {
  type FileSystemNode,
  type FolderNode,
} from '@/features/envio-resultados/domain/ports';
import { viewerFor } from '@/features/envio-resultados/presentation/viewers/viewerFor';
import { NoPreviewViewer } from '@/features/envio-resultados/presentation/viewers/NoPreviewViewer';
import type { ViewState } from '@/features/envio-resultados/presentation/hooks/useFileTree';

export interface FilesExplorerPaneProps {
  viewState: ViewState;
  isAtRoot: boolean;
  onNavigate: (folderName: string) => void;
  onGoUp: () => void;
  onSelect: (file: import('@/features/envio-resultados/domain/ports').FileNode) => void;
  ruc: string;
  dni: string;
  idAten: string;
}

function iconByExtension(name: string): { Icon: typeof FileGeneric; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return { Icon: FileText, color: 'text-red-500' };
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp') {
    return { Icon: FileImage, color: 'text-sky-500' };
  }
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
    return { Icon: FileSpreadsheet, color: 'text-emerald-500' };
  }
  if (ext === 'doc' || ext === 'docx') return { Icon: FileText, color: 'text-blue-500' };
  if (ext === 'zip' || ext === 'rar' || ext === '7z') return { Icon: FileArchive, color: 'text-amber-500' };
  return { Icon: FileGeneric, color: 'text-slate-500' };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function currentFolderLabel(props: FilesExplorerPaneProps): string {
  if (props.viewState.kind !== 'ready') return '';
  const path = props.viewState.currentPath;
  return path === '' ? `${props.dni} — ${props.idAten}` : `${props.dni} — ${props.idAten} / ${path}`;
}

function downloadHref(props: FilesExplorerPaneProps, name: string): string {
  const path = props.viewState.kind === 'ready' ? props.viewState.currentPath : '';
  return (
    `/api/files/download?ruc=${encodeURIComponent(props.ruc)}` +
    `&dni=${encodeURIComponent(props.dni)}` +
    `&idAten=${encodeURIComponent(props.idAten)}` +
    (path === '' ? '' : `&path=${encodeURIComponent(path)}`) +
    `&filename=${encodeURIComponent(name)}`
  );
}

function isPreviewable(name: string): boolean {
  return !(viewerFor(name) instanceof NoPreviewViewer);
}

/**
 * Left pane of the master-detail `FilesModal`. Renders the back arrow
 * (hidden at root), the current-folder label, and the listing:
 * folders (clickable buttons) first, then files (rows with Visualizar
 * + Descargar on previewable types, or just Descargar on the rest).
 */
export function FilesExplorerPane(props: FilesExplorerPaneProps): ReactElement {
  const { viewState } = props;

  return (
    <div className="flex flex-col h-full">
      {/* Header: back arrow + current-folder label */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center space-x-3">
        {!props.isAtRoot && (
          <button
            onClick={props.onGoUp}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Atr"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
          {currentFolderLabel(props)}
        </span>
      </div>

      {/* Body: state-driven */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {viewState.kind === 'loading' && (
          <div data-testid="files-skeleton" className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse"
              />
            ))}
          </div>
        )}

        {viewState.kind === 'empty' && (
          <p
            data-testid="files-empty"
            className="text-sm text-slate-500 dark:text-slate-400 text-center py-12"
          >
            No hay archivos para esta ficha
          </p>
        )}

        {viewState.kind === 'error' && (
          <div
            data-testid="files-error"
            className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm space-y-2"
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>No se pudieron cargar los archivos</span>
            </div>
            <button
              onClick={() => {
                // Re-trigger the hook's fetchFolder by re-navigating to
                // the current path. The simplest signal: re-mount
                // through a key change in the parent. For now, this
                // button is informational — the actual retry lives in
                // the modal-level state.
              }}
              className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 font-semibold transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reintentar</span>
            </button>
          </div>
        )}

        {viewState.kind === 'ready' && (
          <ul data-testid="files-list" className="space-y-1.5">
            {viewState.nodes.map((node) => renderNode(node, props))}
          </ul>
        )}
      </div>
    </div>
  );
}

function renderNode(node: FileSystemNode, props: FilesExplorerPaneProps): ReactElement {
  // Use a switch with an explicit `as` cast to the narrowed type —
  // TS's exhaustiveness narrowing on a union inside a map callback
  // does not propagate to JSX props reliably across all versions.
  switch (node.kind) {
    case 'folder': {
      const folder = node as FolderNode;
      return (
        <FolderRow
          key={`folder:${folder.name}`}
          node={folder}
          onNavigate={props.onNavigate}
        />
      );
    }
    case 'file': {
      const file = node as import('@/features/envio-resultados/domain/ports').FileNode;
      return (
        <FileRow
          key={`file:${file.name}`}
          name={file.name}
          sizeBytes={file.sizeBytes}
          onSelect={() => props.onSelect(file)}
          downloadHref={downloadHref(props, file.name)}
        />
      );
    }
  }
}

function FolderRow({
  node,
  onNavigate,
}: {
  node: FolderNode;
  onNavigate: (name: string) => void;
}): ReactElement {
  return (
    <li>
      <button
        onClick={() => onNavigate(node.name)}
        className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <Folder className="w-4 h-4 text-sky-500 flex-shrink-0" />
        <span className="truncate">{node.name}</span>
        <ChevronLeft className="w-3 h-3 ml-auto text-slate-400 rotate-180" />
      </button>
    </li>
  );
}

function FileRow({
  name,
  sizeBytes,
  onSelect,
  downloadHref,
}: {
  name: string;
  sizeBytes: number;
  onSelect: () => void;
  downloadHref: string;
}): ReactElement {
  const { Icon, color } = iconByExtension(name);
  const previewable = isPreviewable(name);
  return (
    <li className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-950/20">
      <div className="flex items-center space-x-2 min-w-0 flex-1">
        <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
          {name}
        </span>
        <span className="text-xs font-mono text-slate-400 flex-shrink-0">
          {formatSize(sizeBytes)}
        </span>
      </div>
      <div className="flex items-center space-x-1.5 flex-shrink-0">
        {previewable && (
          <button
            onClick={onSelect}
            className="px-2 py-1 rounded-md text-xs font-semibold bg-sky-500 text-white hover:bg-sky-600"
            aria-label="Visualizar"
          >
            Visualizar
          </button>
        )}
        <a
          href={downloadHref}
          className="px-2 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100"
          download
        >
          Descargar
        </a>
      </div>
    </li>
  );
}
