'use client';

import { useRef, useState } from 'react';

import { parseReadyFile } from '@/features/envio-resultados/domain/ready-files/parseReadyFile';
import { derivePickSlots } from '@/features/envio-resultados/presentation/helpers/derivePickSlots';
import { resolveRucEfectivo } from '@/features/envio-resultados/presentation/utils/resolveRucEfectivo';
import type { WizardBatchPick, WizardFilePick } from '@/features/envio-resultados/presentation/hooks/useEnvioWizard';
import type { UnifiedPerson } from '@/types/sp-result';

/**
 * Per-patient quick action "Adjuntar todos los proyectos"
 * (multi-proyecto change, design D8 / spec REQ-103).
 *
 * For every idAten-bearing ficha of the patient, the hook lists that
 * atención's LEGAJOS folder through the SAME endpoint `FilesModal`
 * uses (`/api/files/list-folder?ruc&dni&idAten&path=LEGAJOS`) — no
 * new backend surface. Listings fan out in parallel via
 * `Promise.allSettled`; one failing enumeration never kills the
 * others.
 *
 * A file is a CANDIDATE for slot kind T when
 * `parseReadyFile(name)?.tipo === T` (CERT→CAMO, EXPED→EMO). The
 * slot auto-selects iff EXACTLY ONE candidate of that type exists;
 * 0, ≥2 candidates or a fetch error leave the slot untouched for
 * manual pick, with a per-slot status keyed by `pickKey(dni, idAten)`.
 * ADICIONAL is never auto-picked — `parseReadyFile` cannot yield it.
 *
 * All applied picks are dispatched as ONE `SET_PICKS_BATCH` through
 * `onBatch` (one atomic reducer transition per run). A stale-run
 * guard (ref counter) drops results of a run superseded by a newer
 * `attachAll` invocation; the reducer's `selectedDnIs` guard makes a
 * late dispatch after deselect a safe no-op.
 */

/** Which attachment kind the quick action auto-selects. */
export type QuickSlotKind = 'camo' | 'emo';

/** Per-slot outcome of a quick-action run, keyed by `pickKey`. */
export type QuickSlotStatus =
  | { kind: 'pending' }
  | { kind: 'error'; message: string }
  | { kind: 'ambiguous' }
  | { kind: 'applied' };

export interface UseAttachAllProyectosOptions {
  /** Attachment kind this hook instance auto-selects. */
  slotKind: QuickSlotKind;
  /**
   * Receives the applied picks for ONE patient as a single batch
   * (the wizard shell forwards `setPicksBatch`, i.e. a
   * `SET_PICKS_BATCH` dispatch).
   */
  onBatch: (dni: string, picks: ReadonlyArray<WizardBatchPick>) => void;
}

export interface UseAttachAllProyectosResult {
  /** Runs the quick action for one patient. */
  attachAll: (person: UnifiedPerson) => Promise<void>;
  /** Per-slot statuses keyed by `pickKey(dni, idAten)`. */
  slotStatus: Record<string, QuickSlotStatus>;
  /** True while a quick-action run is in flight. */
  isRunning: boolean;
}

/** Folder scanned under each atención root — mirrors `useReadyFiles`. */
const READY_FOLDER = 'LEGAJOS';

const TIPO_BY_SLOT_KIND: Record<QuickSlotKind, 'CAMO' | 'EMO'> = {
  camo: 'CAMO',
  emo: 'EMO',
};

/**
 * Narrow an unvalidated listing body to the basenames of its file
 * nodes. Anything that is not `{ nodes: [{ kind: 'file', name }] }`
 * contributes nothing — the candidate filter downstream is the real
 * gate.
 */
function extractFileNames(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const nodes: unknown = (body as Record<string, unknown>)['nodes'];
  if (!Array.isArray(nodes)) return [];
  const names: string[] = [];
  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) continue;
    const record = node as Record<string, unknown>;
    if (record['kind'] === 'file' && typeof record['name'] === 'string') {
      names.push(record['name']);
    }
  }
  return names;
}

export function useAttachAllProyectos({
  slotKind,
  onBatch,
}: UseAttachAllProyectosOptions): UseAttachAllProyectosResult {
  const [slotStatus, setSlotStatus] = useState<Record<string, QuickSlotStatus>>({});
  const [isRunning, setIsRunning] = useState(false);
  // Stale-run guard: each `attachAll` invocation bumps the counter;
  // a continuation whose id no longer matches is dropped entirely.
  const runIdRef = useRef(0);

  const attachAll = async (person: UnifiedPerson): Promise<void> => {
    const slots = derivePickSlots(person);
    if (slots.length === 0) return;
    const myRun = ++runIdRef.current;

    setIsRunning(true);
    setSlotStatus((prev) => {
      const next = { ...prev };
      for (const slot of slots) next[slot.key] = { kind: 'pending' };
      return next;
    });

    const expectedTipo = TIPO_BY_SLOT_KIND[slotKind];
    const listings = await Promise.allSettled(
      slots.map((slot) => {
        // The LISTING resolves the effective RUC (view-level concern,
        // mirrors FilesModal); the pick keeps the RAW ficha nroRuc.
        const ruc = resolveRucEfectivo(slot.ficha.nroRuc, person.dni);
        const url =
          `/api/files/list-folder?ruc=${encodeURIComponent(ruc)}` +
          `&dni=${encodeURIComponent(person.dni)}` +
          `&idAten=${encodeURIComponent(slot.ficha.idAten)}` +
          `&path=${encodeURIComponent(READY_FOLDER)}`;
        return fetch(url).then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as unknown;
        });
      }),
    );

    if (runIdRef.current !== myRun) return;

    const picks: WizardBatchPick[] = [];
    const statusPatch: Record<string, QuickSlotStatus> = {};
    slots.forEach((slot, i) => {
      const listing = listings[i];
      if (listing === undefined) return;
      if (listing.status === 'rejected') {
        const reason: unknown = listing.reason;
        statusPatch[slot.key] = {
          kind: 'error',
          message: reason instanceof Error ? reason.message : String(reason),
        };
        return;
      }
      const candidates = extractFileNames(listing.value).filter(
        (name) => parseReadyFile(name)?.tipo === expectedTipo,
      );
      const candidateName = candidates.length === 1 ? candidates[0] : undefined;
      if (candidateName === undefined) {
        // 0 or ≥2 candidates → slot untouched for manual pick.
        statusPatch[slot.key] = { kind: 'ambiguous' };
        return;
      }
      const pick: WizardFilePick = {
        ref: {
          ruc: slot.ficha.nroRuc ?? '',
          dni: person.dni,
          idAten: slot.ficha.idAten,
          path: READY_FOLDER,
          name: candidateName,
          tipoExamen: expectedTipo,
        },
        displayName: candidateName,
      };
      picks.push({ slotKind, idAten: slot.ficha.idAten, pick });
      statusPatch[slot.key] = { kind: 'applied' };
    });

    setSlotStatus((prev) => ({ ...prev, ...statusPatch }));
    if (picks.length > 0) onBatch(person.dni, picks);
    setIsRunning(false);
  };

  return { attachAll, slotStatus, isRunning };
}
