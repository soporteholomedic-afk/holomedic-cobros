'use client';

import { useEffect, useRef, useState } from 'react';
import { createFileNode, type FileNode } from '@/features/envio-resultados/domain/file-system/FileNode';
import { isReadyFile } from '@/features/envio-resultados/domain/ready-files/isReadyFile';

/**
 * Folder under the patient root that is scanned for ready-to-send
 * documents. Decided 2026-06-15 (single-folder scope; recursion
 * intentionally OUT of scope for v1).
 */
const READY_FOLDER = 'LEGAJOS';

/**
 * Orthogonal state for the "ready to send" view — flat list of files
 * that matched `isReadyFile` directly under `READY_FOLDER`.
 */
export type ReadyFilesState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; files: readonly FileNode[] };

export interface UseReadyFilesReturn {
  state: ReadyFilesState;
}

type SerializedFileNode = {
  kind: 'file';
  name: string;
  sizeBytes: number;
  modifiedAt: string;
};

type SerializedFolderNode = { kind: 'folder'; name: string };

type SerializedNode = SerializedFileNode | SerializedFolderNode;

function isSerializedFile(n: SerializedNode): n is SerializedFileNode {
  return n.kind === 'file';
}

/**
 * Custom hook that owns the "ready to send" pane state. Reuses the
 * existing `/api/files/list-folder?path=LEGAJOS` endpoint (no new
 * backend surface) and filters the resulting flat listing on the
 * client through `isReadyFile`.
 *
 * Why client-side filter? The pattern (`^\d+(CERT|EXPED)\.pdf$`) is
 * cheap, the LEGAJOS folder is shallow, and keeping the regex in the
 * domain layer lets us reuse it in future visitors / commands without
 * pinning a new HTTP shape.
 *
 * Race protection mirrors `useFileTree`:
 *
 * - `requestIdRef` stamps every fetch; stale responses are dropped.
 * - `AbortController` cancels the in-flight request on unmount or on
 *   identity change (`ruc` / `dni` / `idAten`).
 * - `AbortError` is swallowed silently.
 *
 * Empty-args short-circuit: when any of `ruc` / `dni` / `idAten` is
 * empty, the hook returns `{ kind: 'empty' }` immediately and does
 * NOT issue a fetch.
 */
export function useReadyFiles(ruc: string, dni: string, idAten: string): UseReadyFilesReturn {
  const [state, setState] = useState<ReadyFilesState>(() => {
    if (ruc === '' || dni === '' || idAten === '') return { kind: 'empty' };
    return { kind: 'loading' };
  });

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // The setState calls in this effect are intentional: they reset the
    // hook's local state when (ruc, dni, idAten) transition to a new
    // patient. That reset is the documented contract of the hook —
    // suppressing the rule with intent.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (ruc === '' || dni === '' || idAten === '') {
      setState({ kind: 'empty' });
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const myId = ++requestIdRef.current;
    setState({ kind: 'loading' });
    /* eslint-enable react-hooks/set-state-in-effect */

    const url =
      `/api/files/list-folder?ruc=${encodeURIComponent(ruc)}` +
      `&dni=${encodeURIComponent(dni)}` +
      `&idAten=${encodeURIComponent(idAten)}` +
      `&path=${encodeURIComponent(READY_FOLDER)}`;

    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { nodes: SerializedNode[] };
      })
      .then((body) => {
        if (requestIdRef.current !== myId) return;
        const rawNodes = body.nodes ?? [];
        const files: FileNode[] = rawNodes
          .filter(isSerializedFile)
          .filter((n) => isReadyFile(n.name))
          .map((n) =>
            createFileNode({ name: n.name, sizeBytes: n.sizeBytes, modifiedAt: n.modifiedAt }),
          );
        setState(files.length === 0 ? { kind: 'empty' } : { kind: 'ready', files });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (requestIdRef.current !== myId) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      abortRef.current?.abort();
    };
  }, [ruc, dni, idAten]);

  return { state };
}
