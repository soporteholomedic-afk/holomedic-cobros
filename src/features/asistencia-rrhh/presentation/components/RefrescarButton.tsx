'use client';

import { useRouter } from 'next/navigation';

/**
 * Client refresh trigger for the server-rendered dashboard: re-runs the
 * server component tree on click (ADR-5 read-side evaluation picks up
 * fresh ultimaSincronizacion and punches without a full page reload).
 */
export function RefrescarButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
    >
      Refrescar
    </button>
  );
}
