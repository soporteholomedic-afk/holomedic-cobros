'use client';

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { FileViewer, PreviewArgs } from './FileViewer';

/**
 * Strategy: text files (`.txt` only — `.csv` is treated as a separate
 * non-previewable type in v1). The async text fetch lives inside the
 * inner `TxtPreview` component (the Strategy itself stays a thin
 * factory of props). The component is responsible for the three
 * states: loading (`Cargando…`), resolved (`<pre>...</pre>`), and
 * error (`Reintentar` button).
 *
 * The fetch is intentionally NOT memoized across re-renders — every
 * retry triggers a fresh `fetch()` call.
 */
export class TxtViewer implements FileViewer {
  readonly supportedExtensions: readonly string[] = ['txt'];

  canPreview(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    return this.supportedExtensions.includes(ext);
  }

  buildPreviewUrl(args: PreviewArgs): string {
    return (
      `/api/files/preview?ruc=${encodeURIComponent(args.ruc)}` +
      `&dni=${encodeURIComponent(args.dni)}` +
      `&idAten=${encodeURIComponent(args.idAten)}` +
      (args.folderPath === '' ? '' : `&path=${encodeURIComponent(args.folderPath)}`) +
      `&filename=${encodeURIComponent(args.name)}`
    );
  }

  renderPreview(args: PreviewArgs): ReactElement {
    // The `key` is the URL so a URL change (folder navigation) remounts
    // the inner component, returning it to its initial 'loading' state
    // without us having to call `setState` synchronously inside an
    // effect (a React 19 anti-pattern flagged by the linter).
    return <TxtPreview key={this.buildPreviewUrl(args)} url={this.buildPreviewUrl(args)} />;
  }
}

type TxtPreviewState =
  | { kind: 'loading' }
  | { kind: 'ready'; text: string }
  | { kind: 'error'; message: string };

function TxtPreview({ url }: { url: string }): ReactElement {
  const [state, setState] = useState<TxtPreviewState>({ kind: 'loading' });
  // Bumping the counter on every retry forces the useEffect to re-run
  // WITHOUT a synchronous setState (React 19 anti-pattern). The user
  // briefly sees the previous error message until the new fetch
  // resolves — acceptable for v1.
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        setState({ kind: 'ready', text });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [url, retryNonce]);

  const onRetry = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          No se pudo cargar el archivo
        </p>
        <p className="text-xs text-slate-400">{state.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <pre className="whitespace-pre-wrap max-h-96 overflow-y-auto p-4 text-sm text-slate-700 dark:text-slate-200 font-mono">
      {state.kind === 'loading' ? 'Cargando…' : state.text}
    </pre>
  );
}
