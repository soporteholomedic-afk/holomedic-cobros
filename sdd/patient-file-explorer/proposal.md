# Proposal: patient-file-explorer

## Status
**PROPOSED** — awaiting user approval.

## Intent

The previous change (`worker-table-aptitud-archivos`, observation 108–115) shipped a `FilesModal` that lists the contents of a single, flat patient folder and forces a full download for every row. The operator's real workflow — the consolidated-results review — needs more: when a patient folder contains subfolders (e.g. one per exam type, per year, or per modality), the user must click into them, and when they click a PDF or TXT they want to **read it in place**, not save it to disk first. This change turns the modal from a flat download launcher into a directory explorer with a built-in right-side viewer.

The user value is real and concrete: an operator reviewing a batch of consolidated results can drill into a patient's archive tree, read each medical report inline, and only download what they need to keep. The flow goes from "click every row, save 30 PDFs, open them in Acrobat one by one" to "click into the right folder, read the relevant report, close the modal". Two new state surfaces — tree navigation and inline preview — drive the UX, and the user explicitly requested that we apply formal GoF design patterns so the new code is structured, testable, and open for extension (a new file type in v2 should be a new class, not a new conditional in the modal).

## Scope

### In scope
- Formal GoF **Composite** for the file tree (`FileSystemNode` / `FileNode` / `FolderNode`).
- GoF **Strategy + Factory** for the file viewers (`PdfViewer`, `TxtViewer`, `ImageViewer`, `NoPreviewViewer` + `viewerFor(name)`).
- GoF **State** pattern for the modal (`viewState` + orthogonal `selectionState`).
- New API routes: `GET /api/files/list-folder` (subfolder-aware listing) and `GET /api/files/preview` (inline disposition).
- Extend `GET /api/files/download` to accept `?path=` for subfolder downloads.
- Delete `GET /api/files/list` (replaced by `list-folder`; no compat wrapper, per user decision).
- Extend `IFileRepository` with `listFolder(ruc, dni, idAten, relativePath)` and a path-aware read method.
- New `useFileTree` hook with race-condition protection (`requestId` + `AbortController`).
- `FilesModal` refactored from single-column to **master-detail layout** (`max-w-5xl`, explorer 40% + preview 60%) with a maximize/minimize preview toggle.
- New `FilesExplorerPane` + `FilesPreviewPane` extracted components.
- `sanitizeFolderPath` helper in `src/lib/sanitize-filename.ts`.
- Comprehensive test suite per AGENTS.md (strict TDD, mock `node:fs`, inject `IFileRepository` via the test seam).

### Out of scope
- No auth/RBAC on the file endpoints (inherited from prior change).
- No file upload, rename, delete, or drag-and-drop.
- No syntax highlighting or line numbers for TXT.
- No `react-pdf` / `pdfjs-dist` — use the browser-native PDF viewer.
- No preview of Office documents (`.doc`, `.docx`, `.xls`, `.xlsx`) or video/audio.
- No compat wrapper for `/api/files/list` — breaking change accepted.
- No server-side size limit (warning log only for > 50 MB, inherited).
- No modal portal abstraction (inherits `FilesModal` parent-in-tree convention).

## Approach

We extend the existing hexagonal port (`IFileRepository`) with a subfolder-aware listing that returns Composite nodes (`FileNode` leaf / `FolderNode` composite) and a path-aware read primitive, then expose them through a new `GET /api/files/list-folder` and `GET /api/files/preview` route. The existing `download` route gains a `?path=` param (with the same two-layer path-traversal defense) and the original `list` route is deleted in the same change. The new `useFileTree` hook drives a `FilesModal` that becomes a master-detail layout: an explorer pane on the left (40%) shows a back arrow + folder list and calls `viewerFor(name)` on click; a preview pane on the right (60%) renders the selected file's viewer. The four GoF patterns are applied formally — the file tree is a real Composite (with `loadChildren` populating lazy children on demand), the viewers are real Strategies (one per file type, dispatched by a Factory), and the modal state machine is split into two orthogonal State values so that navigating the tree and selecting a file are independent. PDF preview uses an `<iframe src="/api/files/preview?…">` (browser-native viewer, zero deps); TXT uses a `<pre>` fetched inline; images use `<img src="/api/files/preview?…">`. A `Maximize2` / `Minimize2` toggle collapses the explorer pane so the user can read PDFs full-width.

The change is delivered as two force-chained PRs (~400 lines each) on top of `master`, both branched from a `feature/patient-file-explorer` tracker:

- **PR-A — Tree navigation + Composite** (port extension, `UncFileRepository` extension, new `list-folder` route, `useFileTree` hook, `sanitizeFolderPath`, `FilesModal` refactor with explorer pane + back arrow, delete old `list` route). Self-degrades gracefully if no subfolders exist (just shows a flat list).
- **PR-B — Preview pane + viewers** (new `preview` route, extend `download` with `?path=`, the four `FileViewer` strategies + `viewerFor` factory, `FilesPreviewPane` extracted component, master-detail layout wiring, "Visualizar" + "Descargar" buttons on previewable rows, maximize/minimize toggle).
- **Integration PR** — tracker → master.

## Design Patterns — Formal Application

### Composite (GoF)

Formal `Component` + `Leaf` + `Composite`, with a **Visitor** seam (`accept`) so the explorer and the preview pane can walk the tree uniformly if a future requirement makes that pay off.

```typescript
// src/features/envio-resultados/domain/file-system/FileSystemNode.ts
export interface FileSystemNode {
  readonly name: string;
  readonly kind: 'file' | 'folder';
  accept(visitor: FileSystemNodeVisitor): void;
}
export interface FileSystemNodeVisitor {
  visitFile(node: FileNode): void;
  visitFolder(node: FolderNode): void;
}
```

```typescript
// src/features/envio-resultados/domain/file-system/FileNode.ts
export interface FileNode extends FileSystemNode {
  readonly kind: 'file';
  readonly sizeBytes: number;
  readonly modifiedAt: string;
  accept(visitor: FileSystemNodeVisitor): void {
    visitor.visitFile(this);
  }
}

// src/features/envio-resultados/domain/file-system/FolderNode.ts
export interface FolderNode extends FileSystemNode {
  readonly kind: 'folder';
  private readonly children: FileSystemNode[] = [];
  isLoaded(): boolean { /* ... */ }
  loadChildren(repo: IFileRepository): Promise<void> { /* lazy */ }
  getChildren(): readonly FileSystemNode[] { /* ... */ }
  accept(visitor: FileSystemNodeVisitor): void { visitor.visitFolder(this); }
}
```

**Why formal Composite, not just a discriminated union** (overrides the exploration recommendation per user decision 119): a single `accept(visitor)` method lets the explorer pane and the preview pane walk the tree uniformly; the data shape becomes self-describing (`node.isFolder()` is a method, not a flag check); and any future bulk operation ("download all descendants of this folder", "validate this subtree") can be a new visitor without touching the nodes. The cost — a `Visitor` interface and `accept` methods — is small relative to the clarity gain.

### Strategy (GoF)

One strategy per previewable file type. Each strategy is a small, focused class that knows how to build its preview URL and render its DOM.

```typescript
// src/features/envio-resultados/presentation/viewers/FileViewer.ts
export interface FileViewer {
  readonly supportedExtensions: readonly string[];
  canPreview(name: string): boolean;
  buildPreviewUrl(args: PreviewArgs): string;
  renderPreview(args: PreviewArgs): ReactElement;
}
export interface PreviewArgs {
  ruc: string; dni: string; idAten: string;
  folderPath: string; name: string; textContent?: string;
}
```

**Concrete strategies**:

- `PdfViewer` → `<iframe src={buildPreviewUrl(...)} />` (browser-native PDF viewer).
- `TxtViewer` → fetches text via `fetch(buildPreviewUrl(...)).then(r => r.text())`, renders `<pre className="whitespace-pre-wrap max-h-96 overflow-y-auto">`.
- `ImageViewer` → `<img src={buildPreviewUrl(...)} className="object-contain max-h-full" />` (jpg, jpeg, png, gif, webp).
- `NoPreviewViewer` → `<p>No hay vista previa — usa Descargar</p>` + a download button.

**Why Strategy**: open-closed principle — adding a new previewable file type in v2 (CSV as a table, audio as a player) means adding a new class, not editing the modal. The strategies are independently testable (`canPreview` truth table per type) and the modal stays dumb.

### Factory (GoF)

A simple Factory that returns the first strategy that matches the file's name. One seam to add new viewers; the modal never imports concrete viewer classes.

```typescript
// src/features/envio-resultados/presentation/viewers/viewerFor.ts
const VIEWERS: readonly FileViewer[] = [
  new PdfViewer(), new TxtViewer(), new ImageViewer(), new NoPreviewViewer(),
];
export function viewerFor(name: string): FileViewer {
  return VIEWERS.find((v) => v.canPreview(name)) ?? new NoPreviewViewer();
}
```

**Why Factory**: the modal only ever calls `viewerFor(name)`; it has no `if (ext === 'pdf')` ladders. Adding a viewer = one line in the `VIEWERS` array.

### State (GoF)

Two orthogonal state values, not one fat discriminated union. They are independent by design.

```typescript
// viewState drives the explorer pane (folder listing)
export type ViewState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; currentPath: string; nodes: readonly FileSystemNode[] };

// selectionState drives the preview pane (orthogonal to viewState)
export type SelectionState =
  | { kind: 'none' }
  | { kind: 'previewing'; file: FileNode; viewer: FileViewer };
```

**Why orthogonal State, not a single fat union**: a single discriminated union would force spurious combined states like `ready-and-previewing-while-navigating` or `empty-and-clearing-preview`. Orthogonal states let the user navigate folders while keeping the same preview (e.g. open `informe-2024.pdf`, then click into `2025` and still see the old preview), or clear the preview while still browsing (`X` on the preview pane). This is the State pattern's "context holds multiple state objects" idiom and matches React's `useState` model one-to-one.

## Affected Files

| Path | Role |
|---|---|
| `src/features/envio-resultados/domain/file-system/FileSystemNode.ts` (NEW) | Composite Component interface + Visitor |
| `src/features/envio-resultados/domain/file-system/FileNode.ts` (NEW) | Composite Leaf |
| `src/features/envio-resultados/domain/file-system/FolderNode.ts` (NEW) | Composite with lazy children |
| `src/features/envio-resultados/domain/ports.ts` (MOD) | Add `listFolder`, path-aware `read` to `IFileRepository` |
| `src/features/envio-resultados/infrastructure/files/UncFileRepository.ts` (MOD) | Implement `listFolder` (returns Composite nodes), `read` |
| `src/features/envio-resultados/infrastructure/files/getFileRepository.ts` (MOD) | Unchanged (factory already works) |
| `src/features/envio-resultados/presentation/hooks/useFileTree.ts` (NEW) | Lazy-load hook with race protection |
| `src/features/envio-resultados/presentation/viewers/FileViewer.ts` (NEW) | Strategy interface |
| `src/features/envio-resultados/presentation/viewers/PdfViewer.ts` (NEW) | PDF strategy |
| `src/features/envio-resultados/presentation/viewers/TxtViewer.ts` (NEW) | TXT strategy |
| `src/features/envio-resultados/presentation/viewers/ImageViewer.ts` (NEW) | Image strategy |
| `src/features/envio-resultados/presentation/viewers/NoPreviewViewer.ts` (NEW) | Fallback strategy |
| `src/features/envio-resultados/presentation/viewers/viewerFor.ts` (NEW) | Factory |
| `src/features/envio-resultados/presentation/components/FilesModal.tsx` (MOD) | Master-detail refactor |
| `src/features/envio-resultados/presentation/components/FilesExplorerPane.tsx` (NEW) | Left pane (extracted) |
| `src/features/envio-resultados/presentation/components/FilesPreviewPane.tsx` (NEW) | Right pane (extracted) |
| `src/app/api/files/list-folder/route.ts` (NEW) | `GET /api/files/list-folder` |
| `src/app/api/files/preview/route.ts` (NEW) | `GET /api/files/preview` (inline) |
| `src/app/api/files/download/route.ts` (MOD) | Add `?path=` param |
| `src/app/api/files/list/route.ts` (DELETE) | Replaced by `list-folder` |
| `src/lib/sanitize-filename.ts` (MOD) | Add `sanitizeFolderPath` helper |
| `src/features/envio-resultados/presentation/hooks/usePatientFiles.ts` (DELETE) | Replaced by `useFileTree` |
| `src/features/envio-resultados/presentation/components/WorkerDetailTable.tsx` (MOD) | Unchanged call site (props are stable) |
| `src/features/envio-resultados/presentation/components/__tests__/FilesModal.test.tsx` (MOD) | Master-detail + viewer tests |
| `src/features/envio-resultados/presentation/hooks/__tests__/useFileTree.test.tsx` (NEW) | Hook tests with race conditions |
| `src/features/envio-resultados/presentation/viewers/__tests__/PdfViewer.test.tsx` (NEW) | Strategy unit tests |
| `src/features/envio-resultados/presentation/viewers/__tests__/TxtViewer.test.tsx` (NEW) | |
| `src/features/envio-resultados/presentation/viewers/__tests__/ImageViewer.test.tsx` (NEW) | |
| `src/features/envio-resultados/presentation/viewers/__tests__/NoPreviewViewer.test.tsx` (NEW) | |
| `src/features/envio-resultados/presentation/viewers/__tests__/viewerFor.test.ts` (NEW) | Factory tests |
| `src/features/envio-resultados/domain/file-system/__tests__/FileNode.test.ts` (NEW) | Composite Leaf tests |
| `src/features/envio-resultados/domain/file-system/__tests__/FolderNode.test.ts` (NEW) | Composite lazy-children tests |
| `src/app/api/files/list-folder/__tests__/route.test.ts` (NEW) | API tests |
| `src/app/api/files/preview/__tests__/route.test.ts` (NEW) | API tests (assert `inline`) |
| `src/lib/__tests__/sanitize-filename.test.ts` (MOD) | Add `sanitizeFolderPath` cases |

## Dependencies

- **New npm packages**: **NONE** for v1. The `<iframe>` (browser-native PDF), `<pre>`, and `<img>` rendering cover all three previewable types.
- **Deferred** (only if the user later wants richer PDF features — zoom, cross-page text selection): `react-pdf@^10` + `pdfjs-dist@^5` (worker file in `public/`). v1 explicitly does NOT add these.
- **New env vars**: **NONE**. `FILE_SERVER_BASE_PATH` is inherited from the prior change.

## Risks

| # | Risk | Why it matters | Mitigation |
|---|------|----------------|------------|
| 1 | UNC share has no subfolders in production (false premise) | Tree navigation is dead code | Confirmed by user (Q1 = A) — subfolders exist. PR-A degrades to flat listing if any folder returns 0 children. |
| 2 | `Content-Disposition: attachment` on `download` blocks inline preview | Iframe never renders the PDF | New `/api/files/preview` route uses `inline`; tests assert the absence of `attachment`. |
| 3 | Path traversal in `?path=` (e.g. `?path=../../etc/passwd`) | Server reads arbitrary files | Two-layer defense: new `sanitizeFolderPath` rejects `..` / absolute / backslash, then `path.win32.resolve` + containment check inside the patient folder. |
| 4 | Race conditions in `useFileTree` (stale responses overwrite current folder) | Confusing UX | `requestId` counter + `AbortController` in the hook; on response, discard if `requestId !== currentRequestId`. |
| 5 | Modal width `max-w-2xl` → `max-w-5xl` is a visual jump | Other modals in the project are narrower | Maximize/minimize toggle (`Maximize2` / `Minimize2`) collapses the explorer pane to recover the old width. |
| 6 | Removing `/api/files/list` is a breaking change | Other consumers? | Confirmed by grep — only `FilesModal` uses it (single consumer). User accepted the replacement. |
| 7 | **2 prior CRITICALs still open** (`SMTP_PASS` leak in `.env.local.example` + uncommitted `console.log` at `UncFileRepository.ts:44`) | Will escalate to master with new code on top | **FLAG LOUDLY in the handoff** — operator must address before this change's PRs can merge. |
| 8 | PR-A + PR-B over the 400-line review budget | Project rule is force-chained | Chained PRs (PR-A ≈ 400 lines, PR-B ≈ 400 lines) on a `feature/patient-file-explorer` tracker. |
| 9 | Browser-native PDF viewer shows "Download" on iOS Safari | UX gap on mobile | Out of scope for v1 (LAN desktop app); desktop browsers (the actual users) handle it natively. |
| 10 | `useFileTree` test file is itself a TDD challenge (mocking `fetch` + `AbortController`) | Hook tests can be flaky if rushed | Reuse the prior change's pattern (`vi.fn` for fetch, return a minimal `AbortController` from `vi.fn()`). |

## Open Decisions Resolved

| # | Topic | Decision (LOCKED 2026-06-15) |
|---|-------|------------------------------|
| 1 | Subfolders in production | **YES** — full Composite impl |
| 2 | Visualizar + Descargar buttons | **COEXIST** for PDF/TXT/images; only Descargar for non-previewable types |
| 3 | Image preview | **YES** (jpg, jpeg, png, gif, webp) |
| 4 | Maximize toggle | **YES** (`Maximize2` / `Minimize2`) |
| 5 | Navigation | **Back arrow only** + current-folder label (no clickable breadcrumb) |
| 6 | `/api/files/list` | **REPLACED** by `/api/files/list-folder` (no compat wrapper) |
| 7 | Base branch | `master`; tracker `feature/patient-file-explorer` |
| 8 | PDF viewer | **Browser-native** via `<iframe>` (no `react-pdf`) |
| 9 | Design patterns | **ALL FOUR**: Strategy + Factory + **Composite** + State |
| 10 | Composite | **Formal GoF** (overrides exploration's discriminated-union recommendation) |

## Open Items for Spec Phase

- Exact back-arrow icon: `ArrowLeft` vs `ChevronLeft` (both available in `lucide-react@1.16.0`).
- Preview pane loading-state behavior: spinner centered, skeleton, or just a blank pane while the file is being fetched.
- What the preview pane shows when the URL 404s or the share is unreachable: red banner + "Cerrar preview" button vs collapse to empty.
- Exact Tailwind class split for the master-detail layout (40/60 vs 1/2 vs CSS grid).
- The preview URL's `Content-Disposition: inline; filename="…"` — does the browser show the filename in the tab title? (Cosmetic, not blocking.)
- `loadChildren` error handling: if a single folder's `listFolder` fails mid-navigation, do we show a per-folder error icon, or fail the whole view?
- Should the back arrow be hidden at the root level (already at the patient's folder), or always shown (clicking it closes the modal)?
- TXT preview's max height / scroll behavior: 24rem vs full-height-within-pane; "Descargar completo" button when truncated.

## Test Strategy

Strict TDD is active (vitest v4.1.7 + @testing-library). No test ever opens a real UNC share — `UncFileRepository` is tested with `vi.mock('node:fs', …)` at the module boundary (same pattern as the prior change's adapter test). API route tests inject a mock `IFileRepository` via `__setFileRepositoryForTests` (dynamic import to avoid the production module's top-level `process.env.FILE_SERVER_BASE_PATH` evaluation) and assert status codes + headers — in particular, the `preview` route test asserts `Content-Disposition` starts with `inline` and the `download` route test asserts it still starts with `attachment`. The `useFileTree` hook is tested by mocking `fetch` at the module boundary and verifying that (1) a `navigate(path)` clears the previous listing, (2) a stale response from a prior `requestId` is discarded, (3) the empty-args short-circuit still applies, (4) the `selectionState` updates independently of `viewState`. The four `FileViewer` strategies get pure unit tests on their `canPreview` truth tables and a smoke render test using `@testing-library/react` — the PDF viewer is verified by asserting the `iframe` element's `src` attribute is correctly composed, NOT by actually rendering a PDF; the TXT viewer is verified by mocking `fetch` and asserting the `<pre>` textContent matches the mocked response; the image viewer is verified by asserting the `<img>` `src`; the `NoPreviewViewer` is verified by asserting the "No hay vista previa" message. The factory gets a truth-table test (`viewerFor('foo.pdf') instanceof PdfViewer`, etc.). The `FolderNode` Composite is tested for lazy-load semantics (`children` empty until `loadChildren()` resolves) and the `accept` visitor dispatch. `FilesModal` is tested by stubbing `useFileTree` and asserting: explorer pane renders folders and files, click on folder navigates, click on PDF shows iframe, click on TXT shows `<pre>`, click on JPG shows `<img>`, click on `.docx` shows "no preview", maximize toggle collapses the explorer pane, "Visualizar" and "Descargar" buttons both render on previewable rows, Escape / backdrop / X close the modal. The `sanitizeFolderPath` helper gets its own unit tests (rejects `..`, `/`, `\\`, empty, absolute Windows paths; passes valid `subfolder/inner` shapes).

## Out-of-scope but flagged for future

- `react-pdf@^10` integration for richer PDF UX (zoom, text selection across pages). Defer until v2.
- Syntax highlighting for TXT (would need a tokenizer — overkill for medical reports).
- Line numbers for TXT (CSS counter or a small utility).
- Preview of Office documents (`.doc`, `.docx`, `.xls`, `.xlsx`) — would require a real converter (LibreOffice headless) or a cloud viewer. Defer to a separate change.
- Drag-and-drop upload, file rename, file delete.
- Server-side zip preserving the subfolder structure (today's `download-all` only zips depth-1).
- A health-check route `/api/files/health` for UNC reachability monitoring (flagged by the prior change's archive report).

## Estimated Complexity

**Medium-Large.** The four GoF patterns add structure but also ceremony (each pattern = 2–4 new files + a test file). The chained PRs keep each slice reviewable. From the prior change's experience (forecast 1140 lines, actual 2692 lines — ~2.4× overrun), expect **forecast 600–800 lines, actual likely 900–1200 lines** because every viewer strategy and both Composite nodes get their own test file, and the master-detail layout is 3× the line count of the current single-column body. The integration PR (tracker → master) is trivial once both PRs are merged. Strict TDD cost: ~30% of the total lines are tests. Total wall-clock estimate: **2–3 working days** of apply time, plus operator time to address the 2 prior CRITICALs before opening the chain.
