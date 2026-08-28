/**
 * `useAttachAllProyectos` powers the per-patient quick action
 * "Adjuntar todos los proyectos" (multi-proyecto change, design D8).
 *
 * For every idAten-bearing ficha of the patient it lists that
 * atención's LEGAJOS folder through the SAME endpoint FilesModal uses
 * (`/api/files/list-folder?ruc&dni&idAten&path=LEGAJOS`), in parallel
 * via `Promise.allSettled`. A file is a CANDIDATE for slot kind T
 * when `parseReadyFile(name)?.tipo === T` (CERT→CAMO, EXPED→EMO).
 * The slot auto-selects iff EXACTLY ONE candidate exists; 0, ≥2
 * candidates or a fetch error leave the slot untouched with a
 * per-slot status keyed by `pickKey(dni, idAten)`. All applied picks
 * are dispatched as ONE `SET_PICKS_BATCH` via `onBatch`. ADICIONAL is
 * never auto-picked — `parseReadyFile` cannot yield it.
 *
 * `fetch` is stubbed at the module boundary (repo precedent:
 * `useReadyFiles.test.tsx`); the responses are keyed by the `idAten`
 * query param so each slot's listing is independent.
 *
 * Spec coverage (envio-resultados-multi-proyecto):
 *  - REQ-103 — S-103.1 (single CERT auto-pick), S-103.2 (ambiguous
 *    slot untouched while others auto-select).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  useAttachAllProyectos,
  type QuickSlotStatus,
} from '../useAttachAllProyectos';
import type { WizardBatchPick } from '../useEnvioWizard';
import type { UnifiedFicha, UnifiedPerson } from '@/types/sp-result';

// ---- Fixtures ----

function makeFicha(overrides: Partial<UnifiedFicha> = {}): UnifiedFicha {
  return {
    idAten: 'AT-001',
    nroRuc: '20123456789',
    nomCFa: 'Acme Corp',
    proyecto: 'METRO LIMA',
    tipoExamen: 'CERT',
    condic: 'APTO',
    fecAte: '17/06/2026',
    ...overrides,
  };
}

/** Reference-case patient: 3 idAten-bearing fichas (NEXA/UNACEM/MINSUR). */
function makeMultiProyectoPerson(): UnifiedPerson {
  return {
    dni: '11111111',
    nombre: 'Ana López',
    empresa: 'Acme Corp',
    tipoExamen: 'CERT',
    proyecto: 'NEXA RESOURCES CAJAMARQUILLA',
    condic: 'APTO',
    fichas: [
      makeFicha({ idAten: 'AT-1', proyecto: 'NEXA RESOURCES CAJAMARQUILLA', fecAte: '01/07/2026' }),
      makeFicha({ idAten: 'AT-2', proyecto: 'UNACEM', fecAte: '02/07/2026' }),
      makeFicha({ idAten: 'AT-3', proyecto: 'MINSUR', fecAte: '03/07/2026' }),
    ],
  };
}

function fileNode(name: string): { kind: 'file'; name: string; sizeBytes: number; modifiedAt: string } {
  return { kind: 'file', name, sizeBytes: 1024, modifiedAt: '2026-06-01T00:00:00.000Z' };
}

function folderNode(name: string): { kind: 'folder'; name: string } {
  return { kind: 'folder', name };
}

interface ListingEntry {
  ok?: boolean;
  nodes?: ReadonlyArray<unknown>;
}

/** Stub `fetch` so each LEGAJOS listing is keyed by the `idAten` query param. */
function stubListings(listings: Record<string, ListingEntry | Error>): void {
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    // The hook fetches a RELATIVE url (Next.js client fetch) — parse
    // the query string directly instead of constructing a URL object.
    const raw = String(input);
    const query = raw.slice(raw.indexOf('?') + 1);
    const idAten = new URLSearchParams(query).get('idAten') ?? '';
    const entry = listings[idAten];
    if (entry instanceof Error) return Promise.reject(entry);
    if (entry?.ok === false) {
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ nodes: entry?.nodes ?? [] }),
    });
  });
}

// ---- Harness ----

const mockFetch = vi.fn();

function renderAttachAll(slotKind: 'camo' | 'emo', onBatch: (dni: string, picks: ReadonlyArray<WizardBatchPick>) => void) {
  return renderHook(() => useAttachAllProyectos({ slotKind, onBatch }));
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ================================================================

describe('useAttachAllProyectos — S-103.1 (single CERT per ficha)', () => {
  it('auto-picks the only CERT of every ficha as CAMO picks in ONE batch', async () => {
    stubListings({
      'AT-1': { nodes: [fileNode('111CERT.pdf')] },
      'AT-2': { nodes: [fileNode('222CERT.pdf')] },
      'AT-3': { nodes: [fileNode('333CERT.pdf')] },
    });
    const onBatch = vi.fn();
    const person = makeMultiProyectoPerson();
    const { result } = renderAttachAll('camo', onBatch);

    await act(async () => {
      await result.current.attachAll(person);
    });

    // Exactly ONE batch dispatch (one atomic SET_PICKS_BATCH).
    expect(onBatch).toHaveBeenCalledTimes(1);
    const [dni, picks] = onBatch.mock.calls[0] as [string, ReadonlyArray<WizardBatchPick>];
    expect(dni).toBe('11111111');
    expect(picks.map((p) => p.idAten)).toEqual(['AT-1', 'AT-2', 'AT-3']);
    expect(picks.every((p) => p.slotKind === 'camo')).toBe(true);
    // Pick shape: raw ficha nroRuc, LEGAJOS path, CAMO stamp, name as displayName.
    expect(picks[0]?.pick).toEqual({
      ref: {
        ruc: '20123456789',
        dni: '11111111',
        idAten: 'AT-1',
        path: 'LEGAJOS',
        name: '111CERT.pdf',
        tipoExamen: 'CAMO',
      },
      displayName: '111CERT.pdf',
    });
    // Per-slot status: applied for every slot, keyed by pickKey.
    expect(result.current.slotStatus['11111111::AT-1']).toEqual({ kind: 'applied' });
    expect(result.current.slotStatus['11111111::AT-2']).toEqual({ kind: 'applied' });
    expect(result.current.slotStatus['11111111::AT-3']).toEqual({ kind: 'applied' });
  });

  it('lists each atención through the shared /api/files/list-folder LEGAJOS endpoint', async () => {
    stubListings({
      'AT-1': { nodes: [fileNode('111CERT.pdf')] },
      'AT-2': { nodes: [fileNode('222CERT.pdf')] },
      'AT-3': { nodes: [fileNode('333CERT.pdf')] },
    });
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);

    await act(async () => {
      await result.current.attachAll(makeMultiProyectoPerson());
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/files/list-folder?ruc=20123456789&dni=11111111&idAten=AT-1&path=LEGAJOS',
      ),
    );
  });

  it('resolves the effective RUC for the listing (nroRuc "null" falls back to dni)', async () => {
    stubListings({ 'AT-1': { nodes: [fileNode('111CERT.pdf')] } });
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);
    const person = makeMultiProyectoPerson();
    person.fichas = [
      makeFicha({ idAten: 'AT-1', nroRuc: 'null', fecAte: '01/07/2026' }),
    ];

    await act(async () => {
      await result.current.attachAll(person);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/files/list-folder?ruc=11111111&dni=11111111&idAten=AT-1&path=LEGAJOS'),
    );
  });

  it('fans out one fetch per slot in parallel before any resolution', async () => {
    // The fetches never resolve: the fan-out must still have issued
    // one request per slot synchronously (Promise.allSettled shape).
    mockFetch.mockImplementation(() => new Promise(() => {}));
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);

    await act(async () => {
      void result.current.attachAll(makeMultiProyectoPerson());
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(onBatch).not.toHaveBeenCalled();
  });
});

describe('useAttachAllProyectos — S-103.2 (ambiguous slots untouched)', () => {
  it('leaves the 2-EXPED ficha untouched in the EMO step while others auto-select', async () => {
    stubListings({
      'AT-1': { nodes: [fileNode('111EXPED.pdf')] },
      'AT-2': { nodes: [fileNode('222EXPED.pdf'), fileNode('222CERT.pdf'), fileNode('999EXPED.pdf')] },
      'AT-3': { nodes: [fileNode('333EXPED.pdf')] },
    });
    const onBatch = vi.fn();
    const { result } = renderAttachAll('emo', onBatch);

    await act(async () => {
      await result.current.attachAll(makeMultiProyectoPerson());
    });

    expect(onBatch).toHaveBeenCalledTimes(1);
    const [dni, picks] = onBatch.mock.calls[0] as [string, ReadonlyArray<WizardBatchPick>];
    expect(dni).toBe('11111111');
    // Only the unambiguous fichas enter the batch; AT-2 stays untouched.
    expect(picks.map((p) => p.idAten)).toEqual(['AT-1', 'AT-3']);
    expect(picks.every((p) => p.slotKind === 'emo')).toBe(true);
    expect(result.current.slotStatus['11111111::AT-2']).toEqual({ kind: 'ambiguous' });
    expect(result.current.slotStatus['11111111::AT-1']).toEqual({ kind: 'applied' });
    expect(result.current.slotStatus['11111111::AT-3']).toEqual({ kind: 'applied' });
  });

  it('marks a slot ambiguous in the CAMO step when 2 CERT candidates exist', async () => {
    stubListings({
      'AT-1': { nodes: [fileNode('111CERT.pdf'), fileNode('888CERT.pdf')] },
      'AT-2': { nodes: [fileNode('222CERT.pdf')] },
    });
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);
    const person = makeMultiProyectoPerson();
    person.fichas = person.fichas.slice(0, 2);

    await act(async () => {
      await result.current.attachAll(person);
    });

    const [, picks] = onBatch.mock.calls[0] as [string, ReadonlyArray<WizardBatchPick>];
    expect(picks.map((p) => p.idAten)).toEqual(['AT-2']);
    expect(result.current.slotStatus['11111111::AT-1']).toEqual({ kind: 'ambiguous' });
  });

  it('treats a listing with only non-ready files (incl. ADICIONAL) as ambiguous', async () => {
    // `parseReadyFile` cannot yield ADICIONAL (`^\d+(CERT|EXPED)\.pdf$`),
    // so an ADICIONAL-named file is never a candidate.
    stubListings({
      'AT-1': { nodes: [fileNode('789ADICIONAL.pdf'), fileNode('notas.pdf'), folderNode('123CERT')] },
      'AT-2': { nodes: [fileNode('222CERT.pdf')] },
    });
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);
    const person = makeMultiProyectoPerson();
    person.fichas = person.fichas.slice(0, 2);

    await act(async () => {
      await result.current.attachAll(person);
    });

    const [, picks] = onBatch.mock.calls[0] as [string, ReadonlyArray<WizardBatchPick>];
    expect(picks.map((p) => p.idAten)).toEqual(['AT-2']);
    expect(result.current.slotStatus['11111111::AT-1']).toEqual({ kind: 'ambiguous' });
  });

  it('does not dispatch a batch when no slot could be auto-selected', async () => {
    stubListings({
      'AT-1': { nodes: [] },
      'AT-2': { nodes: [fileNode('a.pdf'), fileNode('b.pdf'), fileNode('c.pdf'), fileNode('d.pdf'), fileNode('e.pdf'), fileNode('f.pdf')] },
      'AT-3': { nodes: [folderNode('LEGAJOS')] },
    });
    const onBatch = vi.fn();
    const { result } = renderAttachAll('emo', onBatch);

    await act(async () => {
      await result.current.attachAll(makeMultiProyectoPerson());
    });

    expect(onBatch).not.toHaveBeenCalled();
    expect(result.current.slotStatus['11111111::AT-1']).toEqual({ kind: 'ambiguous' });
    expect(result.current.slotStatus['11111111::AT-2']).toEqual({ kind: 'ambiguous' });
    expect(result.current.slotStatus['11111111::AT-3']).toEqual({ kind: 'ambiguous' });
  });
});

describe('useAttachAllProyectos — fetch failure per slot', () => {
  it('marks the errored slot with an error status and keeps the others applied', async () => {
    stubListings({
      'AT-1': { nodes: [fileNode('111CERT.pdf')] },
      'AT-2': new Error('HTTP 500'),
      'AT-3': { nodes: [fileNode('333CERT.pdf')] },
    });
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);

    await act(async () => {
      await result.current.attachAll(makeMultiProyectoPerson());
    });

    expect(onBatch).toHaveBeenCalledTimes(1);
    const [, picks] = onBatch.mock.calls[0] as [string, ReadonlyArray<WizardBatchPick>];
    expect(picks.map((p) => p.idAten)).toEqual(['AT-1', 'AT-3']);
    const at2 = result.current.slotStatus['11111111::AT-2'] as QuickSlotStatus;
    expect(at2.kind).toBe('error');
    if (at2.kind === 'error') expect(at2.message).toBe('HTTP 500');
  });

  it('maps a non-ok listing response to an error status', async () => {
    stubListings({
      'AT-1': { ok: false },
      'AT-2': { nodes: [fileNode('222CERT.pdf')] },
    });
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);
    const person = makeMultiProyectoPerson();
    person.fichas = person.fichas.slice(0, 2);

    await act(async () => {
      await result.current.attachAll(person);
    });

    const at1 = result.current.slotStatus['11111111::AT-1'] as QuickSlotStatus;
    expect(at1.kind).toBe('error');
    if (at1.kind === 'error') expect(at1.message).toBe('HTTP 500');
  });
});

describe('useAttachAllProyectos — run lifecycle', () => {
  it('exposes isRunning while the fan-out is in flight and clears it after', async () => {
    let release!: () => void;
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              json: () => Promise.resolve({ nodes: [fileNode('111CERT.pdf')] }),
            });
        }),
    );
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);
    const person = makeMultiProyectoPerson();
    person.fichas = [makeFicha({ idAten: 'AT-1' })];

    let run!: Promise<void>;
    await act(async () => {
      run = result.current.attachAll(person);
    });
    expect(result.current.isRunning).toBe(true);

    await act(async () => {
      release();
      await run;
    });
    expect(result.current.isRunning).toBe(false);
  });

  it('marks every slot pending while the fan-out is in flight', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);

    await act(async () => {
      void result.current.attachAll(makeMultiProyectoPerson());
    });

    expect(result.current.slotStatus['11111111::AT-1']).toEqual({ kind: 'pending' });
    expect(result.current.slotStatus['11111111::AT-2']).toEqual({ kind: 'pending' });
    expect(result.current.slotStatus['11111111::AT-3']).toEqual({ kind: 'pending' });
  });

  it('drops a stale run whose fetch resolves after a newer run started', async () => {
    let releaseRun1!: () => void;
    const listing = { nodes: [fileNode('111CERT.pdf')] };
    mockFetch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseRun1 = () => resolve({ ok: true, json: () => Promise.resolve(listing) });
          }),
      )
      .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve(listing) }));
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);
    const person = makeMultiProyectoPerson();
    person.fichas = [makeFicha({ idAten: 'AT-1' })];

    let run1!: Promise<void>;
    await act(async () => {
      run1 = result.current.attachAll(person);
    });
    await act(async () => {
      await result.current.attachAll(person); // newer run — completes
    });
    await act(async () => {
      releaseRun1(); // run 1 resolves LATE — must be dropped
      await run1;
    });

    // Only the newer run dispatches; the stale run is a no-op.
    expect(onBatch).toHaveBeenCalledTimes(1);
  });

  it('ignores fichas without idAten (no fetch, no slot status)', async () => {
    stubListings({ 'AT-1': { nodes: [fileNode('111CERT.pdf')] } });
    const onBatch = vi.fn();
    const { result } = renderAttachAll('camo', onBatch);
    const person = makeMultiProyectoPerson();
    person.fichas = [
      makeFicha({ idAten: '', proyecto: 'SIN IDATEN' }),
      makeFicha({ idAten: 'AT-1' }),
    ];

    await act(async () => {
      await result.current.attachAll(person);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.slotStatus['11111111::']).toBeUndefined();
    expect(result.current.slotStatus['11111111::AT-1']).toEqual({ kind: 'applied' });
  });
});
