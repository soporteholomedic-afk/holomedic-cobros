'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createFileNode,
  type FileNode,
} from '@/features/envio-resultados/domain/file-system/FileNode';
import { createFolderNode } from '@/features/envio-resultados/domain/file-system/FolderNode';
import type { FileSystemNode } from '@/features/envio-resultados/domain/file-system/FileSystemNode';
import { viewerFor } from '@/features/envio-resultados/presentation/viewers/viewerFor';
import type { FileViewer } from '@/features/envio-resultados/presentation/viewers/FileViewer';

/**
 * The orthogonal `viewState` — drives the explorer pane (folder
 * listing).
 */
export type ViewState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; currentPath: string; nodes: readonly FileSystemNode[] };

/**
 * The orthogonal `selectionState` — drives the preview pane. It is
 * independent of `viewState`: navigating the tree does NOT clear the
 * selection, and clearing the selection does NOT affect the folder.
 *
 * `folderPath` is the folder the file was selected FROM, frozen at
 * selection time. This is what the preview / download URL targets, so
 * later folder navigation (or a tab switch) does NOT break a preview
 * that is already on screen.
 */
export type SelectionState =
  | { kind: 'none' }
  | { kind: 'previewing'; file: FileNode; viewer: FileViewer; folderPath: string };

export interface UseFileTreeReturn {
  viewState: ViewState;
  selectionState: SelectionState;
  navigate: (folderName: string) => void;
  goUp: () => void;
  /**
   * Mark a file as previewing. If `folderPath` is omitted, the LAST
   * CONFIRMED tree path is used (the path of the folder currently
   * shown in the explorer). Callers from out-of-tree views (e.g. the
   * ready-files pane) MUST pass the folder explicitly.
   */
  selectFile: (file: FileNode, folderPath?: string) => void;
  closeSelection: () => void;
}

/**
 * The shape of a node after a JSON round-trip. The HTTP boundary
 * strips the Composite methods (`accept`, `isLoaded`, etc.) — we
 * re-hydrate them with the factories so the client-side code can
 * call `node.accept(visitor)` and `node.isLoaded()`.
 */
type SerializedNode =
  | { kind: 'file'; name: string; sizeBytes: number; modifiedAt: string }
  | { kind: 'folder'; name: string };

function deserializeNode(raw: SerializedNode): FileSystemNode {
  if (raw.kind === 'file') {
    return createFileNode({
      name: raw.name,
      sizeBytes: raw.sizeBytes,
      modifiedAt: raw.modifiedAt,
    });
  }
  return createFolderNode({ name: raw.name });
}

const ROOT_PATH = '';

/**
 * Custom hook that owns the explorer pane's state machine for the
 * patient's archive tree. Two pieces of orthogonal state (per the
 * design):
 *
 * - `viewState` — the folder listing (loading / empty / error / ready).
 *   A `navigate()` call clears any prior preview? No — `selectionState`
 *   is independent by design (REQ-FE-4).
 * - `selectionState` — the preview pane (none / previewing).
 *
 * Race protection (REQ-FE-6):
 *
 * - A monotonically-increasing `requestIdRef` stamps every fetch.
 * - An `AbortController` cancels the prior in-flight request when a
 *   new `navigate()` is issued.
 * - On response, the hook discards the data if
 *   `requestIdRef.current !== myId`.
 * - `AbortError` is swallowed silently.
 *
 * Empty-args short-circuit (REQ-FE-5):
 *
 * - When any of `ruc === ''`, `dni === ''`, `idAten === ''`, the hook
 *   returns `{ kind: 'empty' }` immediately and does NOT issue a fetch.
 */
export function useFileTree(ruc: string, dni: string, idAten: string): UseFileTreeReturn {
  const [viewState, setViewState] = useState<ViewState>({ kind: 'loading' });
  const [selectionState, setSelectionState] = useState<SelectionState>({ kind: 'none' });

  // Race protection: monotonically-increasing request id. Stored in a
  // ref so incrementing does not cause a re-render.
  const requestIdRef = useRef(0);
  // Cancel the in-flight request when a new one supersedes it.
  const abortRef = useRef<AbortController | null>(null);
  // The current path lives in a REF (not state) so `navigate` and
  // `goUp` can compose the next path synchronously even when called in
  // rapid succession — a useCallback-closed `path` state can be stale
  // across two back-to-back calls in the same tick. The `viewState`
  // (driven by the server response) is the user-visible source of
  // truth; this ref is the navigation-side bookkeeping.
  const pathRef = useRef<string>(ROOT_PATH);

  const fetchFolder = useCallback(
    (targetPath: string): void => {
      // 1. Empty-args short-circuit.
      if (ruc === '' || dni === '' || idAten === '') {
        setViewState({ kind: 'empty' });
        return;
      }
      // 2. Cancel any in-flight request.
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      // 3. Stamp the new request id.
      const myId = ++requestIdRef.current;
      // 4. Optimistic: show loading immediately.
      setViewState({ kind: 'loading' });

      const url =
        `/api/files/list-folder?ruc=${encodeURIComponent(ruc)}` +
        `&dni=${encodeURIComponent(dni)}` +
        `&idAten=${encodeURIComponent(idAten)}` +
        (targetPath === '' ? '' : `&path=${encodeURIComponent(targetPath)}`);

      fetch(url, { signal: ctrl.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as { nodes: SerializedNode[] };
        })
        .then((body) => {
          // 5. Discard stale response.
          if (requestIdRef.current !== myId) return;
          const rawNodes = body.nodes ?? [];
          const nodes: FileSystemNode[] = rawNodes.map(deserializeNode);
          setViewState(
            nodes.length === 0
              ? { kind: 'empty' }
              : { kind: 'ready', currentPath: targetPath, nodes },
          );
          // Commit the path only on a successful response — the next
          // navigate() reads the LAST CONFIRMED path, not the in-flight
          // path, so back-to-back navigations compose correctly.
          pathRef.current = targetPath;
        })
        .catch((err: unknown) => {
          // 6. Swallow AbortError silently.
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (requestIdRef.current !== myId) return;
          setViewState({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        });
    },
    [ruc, dni, idAten],
  );

  // Initial fetch + refetch on identity change.
  useEffect(() => {
    // setState calls here are intentional — they reset the hook's
    // local state when the args transition between patients (a new
    // ruc/dni/idAten). The reset is the documented behavior of the
    // hook, not a cascading render.
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectionState({ kind: 'none' });
    /* eslint-enable react-hooks/set-state-in-effect */
    pathRef.current = ROOT_PATH;
    fetchFolder(ROOT_PATH);
    return () => {
      abortRef.current?.abort();
    };
    // fetchFolder is stable per (ruc, dni, idAten) identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruc, dni, idAten]);

  const navigate = useCallback(
    (folderName: string): void => {
      const current = pathRef.current;
      const next = current === '' ? folderName : `${current}/${folderName}`;
      // DO NOT commit `next` to pathRef here — the path is only
      // committed on a successful server response (see fetchFolder's
      // .then). Committing eagerly would make back-to-back navigations
      // compose from the in-flight path.
      fetchFolder(next);
    },
    [fetchFolder],
  );

  const goUp = useCallback((): void => {
    const current = pathRef.current;
    if (current === '') return; // already at root, no-op
    const next = current.includes('/') ? current.slice(0, current.lastIndexOf('/')) : ROOT_PATH;
    // DO NOT commit `next` to pathRef here — see navigate() above.
    fetchFolder(next);
  }, [fetchFolder]);

  const selectFile = useCallback((file: FileNode, folderPath?: string): void => {
    const resolvedFolder = folderPath ?? pathRef.current;
    setSelectionState({
      kind: 'previewing',
      file,
      viewer: viewerFor(file.name),
      folderPath: resolvedFolder,
    });
  }, []);

  const closeSelection = useCallback((): void => {
    setSelectionState({ kind: 'none' });
  }, []);

  return { viewState, selectionState, navigate, goUp, selectFile, closeSelection };
}
