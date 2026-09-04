'use client';

import { useState, useCallback, type DragEvent } from 'react';
import { useInlineRename } from './useInlineRename';

interface LocalFileDropZoneProps {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  maxTotalBytes?: number;
  /**
   * WU-6 (REQ-02) — opt-in inline rename. When provided, every row
   * gains a pencil affordance; committing calls `onRename(index, next)`
   * with the RAW operator input (`''` = clear back to the original
   * name). Validation and the actual `File` swap belong to the caller
   * — this component stays presentational. When omitted (cobranza /
   * facturacion) no affordance renders and the DOM is byte-identical
   * to the legacy output.
   */
  onRename?: (index: number, next: string) => void;
}

interface LocalFileRowProps {
  file: File;
  index: number;
  onRemove: (index: number) => void;
  onRename?: (index: number, next: string) => void;
}

/**
 * One local-file row (module scope — never inline in the parent,
 * rerender-no-inline-components). Without `onRename` the rendered
 * markup is exactly the legacy row: icon, name, size, remove button.
 */
function LocalFileRow({ file, index, onRemove, onRename }: LocalFileRowProps) {
  // The hook runs unconditionally; without the opt-in the commit is a
  // no-op and the affordance is simply not rendered.
  const rename = useInlineRename((next) => onRename?.(index, next));
  const isEditing = onRename !== undefined && rename.editing;

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
    >
      <svg className="w-4 h-4 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      {isEditing ? (
        <input
          type="text"
          value={rename.draft}
          onChange={(e) => rename.setDraft(e.target.value)}
          placeholder={file.name}
          aria-label={`Renombrar ${file.name}`}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') rename.commit();
            else if (e.key === 'Escape') rename.cancel();
          }}
          onBlur={rename.commitIfActive}
          className="min-w-0 flex-1 rounded-full border border-sky-300 px-2 py-0.5 text-xs focus:border-sky-500 focus:outline-none"
        />
      ) : (
        <span className="flex-1 truncate text-slate-700 dark:text-slate-200 min-w-0">
          {file.name}
        </span>
      )}
      <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
        {(file.size / 1024).toFixed(0)} KB
      </span>
      {onRename !== undefined && !isEditing && (
        <button
          type="button"
          aria-label={`Renombrar ${file.name}`}
          onClick={() => rename.open(file.name)}
          className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600 transition-colors flex-shrink-0 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(index);
        }}
        className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
        aria-label={`Quitar ${file.name}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function LocalFileDropZone({
  files,
  onAdd,
  onRemove,
  maxTotalBytes = 50 * 1024 * 1024,
  onRename,
}: LocalFileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTotal = files.reduce((sum, f) => sum + f.size, 0);

  const processFiles = useCallback(
    (newFiles: FileList | File[]) => {
      setError(null);
      const incoming = Array.from(newFiles);
      const incomingTotal = incoming.reduce((sum, f) => sum + f.size, 0);

      if (currentTotal + incomingTotal > maxTotalBytes) {
        setError(
          `El total excede ${maxTotalBytes / (1024 * 1024)} MB. ` +
          `Actual: ${(currentTotal / (1024 * 1024)).toFixed(1)} MB, ` +
          `intentaste agregar: ${(incomingTotal / (1024 * 1024)).toFixed(1)} MB`,
        );
        return;
      }

      onAdd(incoming);
    },
    [currentTotal, maxTotalBytes, onAdd],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        processFiles(target.files);
      }
    };
    input.click();
  }, [processFiles]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
        Archivos locales
      </p>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        data-testid="local-file-drop-zone"
        className={`
          rounded-xl border-2 border-dashed p-6 text-center cursor-pointer
          transition-colors
          ${isDragOver
            ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
            : error
              ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-sky-400 dark:hover:border-sky-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }
        `}
      >
        <svg
          className={`w-8 h-8 mx-auto mb-2 ${isDragOver ? 'text-sky-500' : error ? 'text-red-400' : 'text-slate-400'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isDragOver
            ? 'Suelta los archivos aquí'
            : 'Arrastra archivos aquí o haz clic para seleccionar'
          }
        </p>
        {files.length > 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {files.length} archivo{files.length !== 1 ? 's' : ''} · {(currentTotal / (1024 * 1024)).toFixed(1)} MB / {maxTotalBytes / (1024 * 1024)} MB
          </p>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert" data-testid="drop-error">
          {error}
        </p>
      )}

      {files.length > 0 && (
        <div className="space-y-1.5" data-testid="local-file-list">
          {files.map((file, index) => (
            <LocalFileRow
              key={`${file.name}-${index}`}
              file={file}
              index={index}
              onRemove={onRemove}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}
