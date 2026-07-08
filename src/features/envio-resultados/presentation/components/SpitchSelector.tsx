'use client';

/**
 * SpitchSelector — picks a template (spitch) for the send flow.
 *
 * The send flow obtains the spitch list exclusively via the
 * `useSpitches(area, type)` client hook — there is no module-top
 * repository or use-case instantiation in this file. AGENTS.md and
 * spec scenario "Selector no longer instantiates a repo" pin this.
 *
 * Status switch (per design Decision k / spec ADDED "SpitchSelector
 * empty-state UX"):
 *   - loading  → "Cargando..."
 *   - empty    → message + "Crear plantilla" link → /admin/plantillas/<area>
 *   - error    → message + retry button (calls hook's retry)
 *   - populated → <select> + auto-select first / matched selectedId
 *
 * The `area` prop is required and is the source of the empty-state
 * editor link. Keep this file free of any references to specific
 * areas in code — the area flows through from the route.
 *
 * Spec scenarios pinned in `__tests__/SpitchSelector.test.tsx`:
 *   - "Empty state shows link to editor"
 *   - "Error state shows retry"
 *   - "Populated state selects first"
 *   - "Selector no longer instantiates a repo"
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { Spitch, SpitchType } from '../../domain/entities';
import { useSpitches } from '../hooks/useSpitches';

interface SpitchSelectorProps {
  /**
   * Send target (audience). `company` = bulk email to the company
   * contact; `patient` = individual patient email. Drives both the
   * hook's `type` param and the editor link's area.
   */
  target: SpitchType;
  /**
   * Called exactly once on the initial auto-select (or when the user
   * changes the selection). NOT called in `loading` / `empty` / `error`
   * states — the caller receives `null` and renders its placeholder.
   */
  onSelect: (spitch: Spitch) => void;
  /** Optional preselection. Wins over the first-item default. */
  selectedId?: string;
  /**
   * Area identifier (e.g. `'consolidados'`). The empty-state link to
   * the editor is derived from this — keeps the component decoupled
   * from any hardcoded route.
   */
  area: string;
}

export function SpitchSelector({
  target,
  onSelect,
  selectedId,
  area,
}: SpitchSelectorProps) {
  const { spitches, status, error, retry } = useSpitches(area, target);
  const hasAutoSelectedRef = useRef(false);
  // When the (area, target) pair changes, reset the auto-select latch
  // so the new list's first item is auto-selected.
  const [lastAreaTarget, setLastAreaTarget] = useState(`${area}|${target}`);
  useEffect(() => {
    const key = `${area}|${target}`;
    if (key !== lastAreaTarget) {
      hasAutoSelectedRef.current = false;
      setLastAreaTarget(key);
    }
  }, [area, target, lastAreaTarget]);

  // Initial auto-select when the populated list first arrives.
  useEffect(() => {
    if (status !== 'populated' || spitches.length === 0) return;
    if (hasAutoSelectedRef.current) return;
    const match = selectedId
      ? spitches.find((s) => s.id === selectedId)
      : spitches[0];
    if (match) {
      hasAutoSelectedRef.current = true;
      onSelect(match);
    }
  }, [status, spitches, selectedId, onSelect]);

  if (status === 'loading') {
    return <p className="text-sm text-slate-500">Cargando...</p>;
  }

  if (status === 'error') {
    return (
      <div className="space-y-2" role="alert">
        <p className="text-sm text-slate-700">No se pudieron cargar las plantillas</p>
        {error && <p className="text-xs text-slate-500">{error}</p>}
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-sky-600 text-white text-sm rounded-md hover:bg-sky-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="space-y-2" data-testid="spitch-selector-empty">
        <p className="text-sm text-slate-700">No hay plantillas para esta área</p>
        <Link
          href={`/admin/plantillas/${area}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700 underline underline-offset-2"
        >
          Crear plantilla
        </Link>
      </div>
    );
  }

  // status === 'populated' (the type guard; `spitches` is non-empty here).
  const current = selectedId ?? spitches[0]?.id ?? '';
  return (
    <select
      role="combobox"
      value={current}
      onChange={(e) => {
        const spitch = spitches.find((s) => s.id === e.target.value);
        if (spitch) onSelect(spitch);
      }}
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-colors"
    >
      {spitches.map((spitch) => (
        <option key={spitch.id} value={spitch.id}>
          {spitch.name}
        </option>
      ))}
    </select>
  );
}
