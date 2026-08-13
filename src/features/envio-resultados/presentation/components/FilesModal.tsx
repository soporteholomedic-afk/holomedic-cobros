'use client';

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Maximize2, Minimize2, RefreshCw, X } from 'lucide-react';
import { FilesExplorerPane } from '@/features/envio-resultados/presentation/components/FilesExplorerPane';
import { FilesGeneratePane } from '@/features/envio-resultados/presentation/components/FilesGeneratePane';
import { FilesPreviewPane } from '@/features/envio-resultados/presentation/components/FilesPreviewPane';
import { FilesReadyPane } from '@/features/envio-resultados/presentation/components/FilesReadyPane';
import { FilesTabs, type FilesTab } from '@/features/envio-resultados/presentation/components/FilesTabs';
import { useFileTree } from '@/features/envio-resultados/presentation/hooks/useFileTree';
import { useReadyFiles, type ReadyFilesState } from '@/features/envio-resultados/presentation/hooks/useReadyFiles';
import { normalizeTipoExamen } from '@/features/envio-resultados/domain/ready-files/normalizeTipoExamen';
import type { FileNode } from '@/features/envio-resultados/domain/ports';
import type { SelectedFileRef } from '@/features/envio-resultados/domain/entities';

/** Folder the "Listo para enviar" tab scans. Mirrors useReadyFiles. */
const READY_FOLDER = 'LEGAJOS';

export interface FilesModalProps {
  ruc: string;
  dni: string;
  idAten: string;
  nombrePaciente: string;
  empresa: string;
  destino: string;
  fecAte?: string;
  /**
   * When provided, the modal runs in single-select mode:
   * - Default tab is `'all'`
   * - Clicking a file replaces the previous selection
   * - The footer action button is labeled "Seleccionar"
   * - Clicking "Seleccionar" calls onPickSingle(file, folderPath) then onClose
   * - The parent handles "skip" via the card-level "Saltar" button
   * All 3 tabs remain visible.
   */
  onPickSingle?: (file: FileNode, folderPath: string) => void;
  /**
   * PR-2 (nomenclatura-adicionales) — the DesTCh exam-type signal
   * (`row.DesTCh`, e.g. `'ADICIONALES'`) forwarded from the /consolidados
   * row. When non-empty it is appended to the ready/explorer pane
   * download hrefs (`&tipoExamen=`), included in the download-selected
   * POST FormData (request-level), and stamped onto each `SelectedFileRef`
   * (per-ref, normalized to the domain union so the route accepts it).
   * Defaults to `''` → no param, no stamping (REQ-6, S-11).
   */
  tipoExamen?: string;
  onClose: () => void;
  /**
   * Fired when the user clicks the "Enviar" footer button. Receives
   * the selection as a `ReadonlyMap` keyed by `fileRef`
   * (`"${folderPath}::${name}"`) so the parent can preserve the
   * explorer-pane folder path. Optional: when not provided, the
   * click is a no-op (defensive — the modal can be mounted in
   * read-only contexts). The parent decides when to close the
   * modal after consuming the selection.
   */
  onSend?: (selected: ReadonlyMap<string, FileNode>) => void;
}

/**
 * Modal that lists the files in a patient's archive folder on the LAN
 * share, with per-file download links and a one-click bulk zip.
 *
 * Behaves in one of two modes determined by the presence of
 * `onPickSingle`:
 *
 * **Multi-select mode** (no `onPickSingle`): the legacy file-explorer
 * overlay used by the per-row "Ver Archivos" flow. Default tab is
 * `'ready'`. Footer has "Enviar" + "Descargar" buttons.
 *
 * **Single-select mode** (`onPickSingle` provided): used by the
 * CAMO/EMO wizard Steps 2/3. Default tab is `'all'`. Clicking a file
 * replaces the previous selection. Footer has "Seleccionar". Parent
 * handles skip via the card-level "Saltar" button.
 *
 * Three tabs split the left pane:
 *
 * - `ready` — a flat list of LEGAJOS files that match the
 *   `^\d+(CERT|EXPED)\.pdf$` pattern. Owned by `useReadyFiles`.
 * - `all` (default in pick mode) — the full navigable tree. Owned by
 *   `useFileTree`.
 * - `generate` — file-generation workflows.
 *
 * Each pane reuses the same right-side preview pane. Selection
 * carries its own `folderPath` (frozen at click time) so switching
 * tabs or navigating folders does NOT break a preview that is already
 * on screen.
 */
export function FilesModal({
  ruc,
  dni,
  idAten,
  nombrePaciente,
  empresa,
  destino,
  fecAte = '',
  tipoExamen = '',
  onPickSingle,
  onClose,
  onSend,
}: FilesModalProps): ReactElement {
  const isPickMode = onPickSingle !== undefined;
  const {
    viewState,
    selectionState,
    navigate,
    goUp,
    selectFile,
    closeSelection,
    refetch: treeRefetch,
  } = useFileTree(ruc, dni, idAten);
  const { state: readyState, refetch: readyRefetch } = useReadyFiles(ruc, dni, idAten);
  const [activeTab, setActiveTab] = useState<FilesTab>(isPickMode ? 'all' : 'ready');
  const [zipInFlight, setZipInFlight] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [selectedFilesMap, setSelectedFilesMap] = useState<Map<string, FileNode>>(
    () => new Map(),
  );

  // Render-time state adjustment (official React pattern for
  // prop-driven resets — replaces the previous setState-in-effect):
  // clear the selection when the patient identity changes. The
  // identity is derived from the props each render, so the previous
  // value is held in state and compared during render.
  const [prevIdentity, setPrevIdentity] = useState<string>(`${ruc}|${dni}|${idAten}`);
  const currentIdentity = `${ruc}|${dni}|${idAten}`;
  if (currentIdentity !== prevIdentity) {
    setPrevIdentity(currentIdentity);
    setSelectedFilesMap((prev) => (prev.size === 0 ? prev : new Map()));
  }

  // Render-time state adjustment for the ready-pane pre-check: when
  // `readyState` transitions (including the initial mount when the
  // hook is stubbed as already-ready), auto-add the ready files in
  // multi-select mode. `null` means "no previous state yet" so the
  // first ready state is applied exactly once, matching the previous
  // effect's mount behavior. The merge is idempotent, so a repeated
  // identical `readyState` reference never re-fires (identity guard).
  const [prevReadyState, setPrevReadyState] = useState<ReadyFilesState | null>(null);
  if (prevReadyState !== readyState) {
    setPrevReadyState(readyState);
    if (!isPickMode && readyState.kind === 'ready') {
      setSelectedFilesMap((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const file of readyState.files) {
          const ref = `${READY_FOLDER}::${file.name}`;
          if (!next.has(ref)) {
            next.set(ref, file);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }

  const handleGenerationSuccess = useCallback((): void => {
    readyRefetch();
    setActiveTab('ready');
  }, [readyRefetch]);

  const handleRefresh = useCallback((): void => {
    treeRefetch();
    readyRefetch();
  }, [treeRefetch, readyRefetch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleToggleFile = useCallback((ref: string, file: FileNode): void => {
    if (onPickSingle) {
      setSelectedFilesMap(new Map([[ref, file]]));
    } else {
      setSelectedFilesMap((prev) => {
        const next = new Map(prev);
        if (next.has(ref)) next.delete(ref);
        else next.set(ref, file);
        return next;
      });
    }
  }, [onPickSingle]);

  const handlePickSelect = useCallback((): void => {
    if (selectedFilesMap.size === 0) return;
    const entry = Array.from(selectedFilesMap.entries())[0];
    if (!entry) return;
    const [key, file] = entry;
    const idx = key.indexOf('::');
    const folderPath = idx < 0 ? '' : key.slice(0, idx);
    onPickSingle?.(file, folderPath);
    onClose();
  }, [onPickSingle, onClose, selectedFilesMap]);

  const handleSendClick = useCallback((): void => {
    onSend?.(selectedFilesMap);
  }, [onSend, selectedFilesMap]);

  const selectedRefs = useMemo<ReadonlySet<string>>(
    () => new Set(selectedFilesMap.keys()),
    [selectedFilesMap],
  );

  const isAtRoot = !(viewState.kind === 'ready' && viewState.currentPath !== '');
  const previewFolderPath = selectionState.kind === 'previewing' ? selectionState.folderPath : '';

  const headerTitle = `Archivos — ${nombrePaciente || dni}`;

  const toggleMaximize = (): void => setIsMaximized((m) => !m);

  const handleDownloadSelected = useCallback(async (): Promise<void> => {
    if (selectedFilesMap.size === 0) return;
    setZipInFlight(true);
    try {
      const formData = new FormData();
      formData.append('ruc', ruc);
      formData.append('dni', dni);
      formData.append('idAten', idAten);
      formData.append('nombrePaciente', nombrePaciente);
      formData.append('empresa', empresa);
      formData.append('destino', destino);
      // PR-2 — request-level DesTCh signal (raw, the route normalizes it).
      // Omitted entirely when the modal has no signal (S-11).
      if (tipoExamen !== '') {
        formData.append('tipoExamen', tipoExamen);
      }
      // PR-2 — per-ref stamping. `SelectedFileRef.tipoExamen` is the
      // domain union, so the raw `'ADICIONALES'` is normalized to
      // `'ADICIONAL'` here (the route validates per-ref values and
      // rejects anything outside the union). Garbage/absent → no stamp.
      const normalizedTipoExamen = normalizeTipoExamen(tipoExamen);
      const fileRefs: SelectedFileRef[] = Array.from(selectedFilesMap.entries()).map(([key]) => {
        const idx = key.indexOf('::');
        const path = idx < 0 ? '' : key.slice(0, idx);
        const name = idx < 0 ? key : key.slice(idx + 2);
        return normalizedTipoExamen === undefined
          ? { ruc, dni, idAten, path, name }
          : { ruc, dni, idAten, path, name, tipoExamen: normalizedTipoExamen };
      });
      formData.append('fileRefs', JSON.stringify(fileRefs));

      const response = await fetch('/api/files/download-all', { method: 'POST', body: formData });
      if (!response.ok) {
        console.error('[FilesModal] download-selected error', { status: response.status });
        return;
      }
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filename = disposition.match(/filename="(.+?)"/)?.[1] ?? 'descarga.zip';
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[FilesModal] download-selected error', err);
    } finally {
      setZipInFlight(false);
    }
  }, [selectedFilesMap, ruc, dni, idAten, nombrePaciente, empresa, destino, tipoExamen]);

  const handleSelectFromReady = (file: FileNode): void => {
    selectFile(file, READY_FOLDER);
  };

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
              onClick={handleRefresh}
              disabled={viewState.kind === 'loading' || readyState.kind === 'loading'}
              aria-label="Recargar archivos"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
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

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          <div
            className={
              isMaximized
                ? 'hidden'
                : 'w-full md:w-2/5 border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden'
            }
            data-testid="files-explorer-container"
          >
            <FilesTabs activeTab={activeTab} onTabChange={setActiveTab} />
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'ready' ? (
                <FilesReadyPane
                  state={readyState}
                  ruc={ruc}
                  dni={dni}
                  idAten={idAten}
                  nombrePaciente={nombrePaciente}
                  tipoExamen={tipoExamen}
                  onSelect={handleSelectFromReady}
                  selectedRefs={selectedRefs}
                  onToggle={handleToggleFile}
                />
              ) : activeTab === 'all' ? (
                <FilesExplorerPane
                  viewState={viewState}
                  isAtRoot={isAtRoot}
                  onNavigate={navigate}
                  onGoUp={goUp}
                  onSelect={selectFile}
                  ruc={ruc}
                  dni={dni}
                  idAten={idAten}
                  nombrePaciente={nombrePaciente}
                  tipoExamen={tipoExamen}
                  selectedRefs={selectedRefs}
                  onToggle={handleToggleFile}
                />
              ) : (
                <FilesGeneratePane
                  ruc={ruc}
                  dni={dni}
                  idAten={idAten}
                  fecAte={fecAte}
                  onSuccess={handleGenerationSuccess}
                />
              )}
            </div>
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
              currentPath={previewFolderPath}
            />
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors"
          >
            Cerrar
          </button>
          {isPickMode ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePickSelect}
                disabled={selectedFilesMap.size === 0}
                data-testid="files-modal-pick-select"
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:shadow-none"
              >
                Seleccionar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSendClick}
                disabled={selectedFilesMap.size === 0}
                aria-label="Enviar archivos seleccionados"
                data-testid="files-modal-send"
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed disabled:shadow-none"
              >
                Enviar ({selectedFilesMap.size})
              </button>
              <button
                type="button"
                onClick={handleDownloadSelected}
                disabled={selectedFilesMap.size === 0 || zipInFlight}
                aria-disabled={selectedFilesMap.size === 0 || zipInFlight ? 'true' : 'false'}
                data-testid="files-modal-download-selected"
                className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 ${
                  zipInFlight
                    ? 'bg-slate-400 cursor-wait'
                    : 'bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 shadow-sky-500/20 hover:scale-[1.03]'
                } disabled:bg-slate-300 disabled:cursor-not-allowed disabled:shadow-none`}
              >
                {zipInFlight ? `Generando zip...` : `Descargar seleccionados (${selectedFilesMap.size})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
