# Plan: CAMO/EMO Manual File Browse

**Slug**: `camo-emo-manual-browse`
**Date**: 2026-07-13
**Status**: drafted, pending orchestrator kick-off

---

## Context

The current `envio-resultados-camo-emo` wizard (merged to `master` at `ba1e1ed`) uses regex-based file detection to filter CAMO/EMO files:

- Step 2 (`pickType='CAMO'`) filters the ready pane by `^\d+CERT\.pdf$/i`
- Step 3 (`pickType='EMO'`) filters the ready pane by `^\d+EXPED\.pdf$/i`
- The user sees only files matching the regex for each step
- The sistema's route: `\\sigla\{ruc}\{dni}\{idAten}\LEGAJOS\` — scans only the `LEGAJOS` subfolder

The user wants: **the user should manually browse the patient folder tree (`\\sigla\{ruc}\{dni}\{idAten}`), navigate into any folder they wish, and pick the files they consider CAMO or EMO, with no regex auto-detection in the wizard flow.**

---

## Locked decisions

### L-1: Folder scope
**Browse starting from `\\sigla\{ruc}\{dni}\{idAten}` (the full patient root).**

Not just `LEGAJOS`. The user opens the file browser at the patient root and can navigate any subfolder (LEGAJOS, INFORMES, LABORATORIO, etc.).

### L-2: CAMO/EMO label
**The step (2 or 3) determines the tipoExamen — NOT the filename.**

- Step 2 → `tipoExamen = 'CAMO'`
- Step 3 → `tipoExamen = 'EMO'`
- No regex matching. No `parseReadyFile` fallback. The user decides what is CAMO and what is EMO by the step they choose.

### L-3: FilesModal reuse
**Reuse the existing `FilesModal` in default mode with the 3 tabs.**

- **Ready tab**: still shows the regex-filtered `LEGAJOS` flat list (unchanged). The user can use it as a hint for what they might pick.
- **All tab** (default): full navigable file tree from the patient root. The user browses and chooses files.
- **Generate tab**: file generation workflows (unchanged).
- The default tab when opened from the wizard is `'all'` (folder tree).

### L-4: "Seleccionar" button
**When the wizard opens `FilesModal`, the main action button is labeled `"Seleccionar"` (not `"Enviar"`).**

Single-select mode. When the user has chosen exactly one file, clicking "Seleccionar" calls `onPickSingle(file)` and closes the modal.

### L-5: Saltar button stays on the card
**The "Saltar CAMO" / "Saltar EMO" button remains outside the modal, on the patient card in Step2/Step3.**

The user opens the modal, browses, picks a file (or not), and closes it. If they want to skip, they click "Saltar" on the card.

---

## Files to change

### `src/features/envio-resultados/presentation/components/FilesModal.tsx`

**Remove**:
- `mode?: 'default' | 'pick-single'` prop
- `pickType?: 'CAMO' | 'EMO'` prop
- `PICK_REGEX` constant (lines 27-29)
- `isPickSingle` boolean and all conditional branches
- `singleSelection` state (line 151)

**Modify `onPickSingle`**:
- Signature changes: `(file: FileNode | null) => void` → `(file: FileNode) => void`
- (The `null` case is removed because Saltar is handled by the parent card)

**Add**:
- When `onPickSingle` is provided (non-null/undefined):
  - Default active tab → `'all'`
  - Single-select mode: clicking a file replaces the previous selection
  - The main action button label → `"Seleccionar"`
  - The button is disabled when 0 files are selected
  - On click: validate exactly 1 file → call `onPickSingle(file)` → call `onClose`
  - The 3 tabs are still all visible (user can switch freely)
- When `onPickSingle` is NOT provided (legacy per-row `Ver Archivos` flow):
  - Everything stays as today: multi-select, "Enviar" button, `onSend` callback
  - Default tab stays `'ready'`

### `src/features/envio-resultados/presentation/components/wizard/Step2Camo.tsx` and `Step3Emo.tsx`

**Remove**:
- `mode='pick-single'` and `pickType='CAMO' | 'EMO'` from `FilesModal` invocation

**Modify**:
- Pass `onPickSingle={(file) => onPickFile(dni, { ref: { ..., name: file.name, tipoExamen: 'CAMO' | 'EMO' }, displayName: file.name })}`
  - `tipoExamen` is hardcoded: `'CAMO'` in `Step2Camo`, `'EMO'` in `Step3Emo`
  - `file` is a `FileNode`; extract `name` for the display name and build the ref object

**Keep**:
- "Elegir CAMO" / "Elegir EMO" button on each patient card (opens the modal)
- "Saltar CAMO" / "Saltar EMO" button on each card (sets pick to null)
- "Volver" / "Siguiente" / "Continuar" footer buttons
- Patient card structure (one per selected `dni`)

### `src/features/envio-resultados/presentation/helpers/buildEmailViewDataFromWizard.ts`

**Simplify**:
- The `tipoExamen` in the `fileRefs` entries already comes from the wizard state (`camoByDni` entries have `tipoExamen: 'CAMO'`, `emoByDni` entries have `tipoExamen: 'EMO'`)
- Remove any dependency on `parseReadyFile` (it's not needed in the wizard path; it still exists for the legacy badge system)
- The helper's tests should assert that `tipoExamen` is 'CAMO' for camo picks and 'EMO' for emo picks, without computing it from the filename

### Files with NO changes

| File | Reason |
|------|--------|
| `src/features/envio-resultados/domain/entities.ts` | `SelectedFileRef.tipoExamen?` stays — already optional |
| `src/features/envio-resultados/domain/ready-files/renameReadyFile.ts` | Already works for any file; tipoExamen comes from caller |
| `src/features/envio-resultados/domain/ready-files/parseReadyFile.ts` | Unchanged — still used by legacy badge endpoint |
| `src/features/envio-resultados/domain/ready-files/isReadyFile.ts` | Unchanged — used by ready tab in FilesModal |
| `src/features/envio-resultados/presentation/hooks/useReadyFiles.ts` | Unchanged — still used by "ready" tab |
| `src/features/envio-resultados/presentation/hooks/useEnvioWizard.ts` | Unchanged — reducer unchanged |
| `src/features/envio-resultados/presentation/components/EmailEditor.tsx` | Unchanged — backContext/onBack stays |
| `src/features/envio-resultados/presentation/components/WorkerDetailTable.tsx` | Unchanged — Enviar button + handoff stays |
| `src/features/envio-resultados/presentation/components/EnvioResultadosWizard.tsx` | Unchanged — shell, stepper, routing stay |
| `src/features/envio-resultados/presentation/components/wizard/Step1Pacientes.tsx` | Unchanged |
| `src/features/envio-resultados/presentation/components/wizard/Step4Resumen.tsx` | Unchanged — summary display |
| `src/features/envio-resultados/presentation/components/wizard/WizardStepper.tsx` | Unchanged |
| `src/features/envio-resultados/application/sendResults.ts` | Unchanged — one-line pass-through stays |
| `src/app/api/files/check-legajos/route.ts` | Unchanged — badges endpoint for legacy |
| `src/app/api/files/list-folder/route.ts` | Unchanged — already supports any path |

---

## Test changes

### `FilesModal.test.tsx`
- **Remove**: all `mode='pick-single'` cases (regex filter CAMO, regex filter EMO, single-select, Seleccionar/Saltar callbacks, hide tabs magic)
- **Add**: `onPickSingle` cases:
  - default tab is `'all'` when `onPickSingle` is provided
  - single-click replaces selection (does not toggle/add)
  - "Seleccionar" label instead of "Enviar"
  - button disabled at 0 selected, enabled at 1+
  - click calls `onPickSingle(file) + onClose`
  - all 3 tabs still visible
- **Keep**: all default mode tests (multi-select, onSend, 3 tabs, ready/all/generate)

### `Step2Camo.test.tsx` and `Step3Emo.test.tsx`
- **Remove**: tests that assert `mode='pick-single'` and `pickType='CAMO'|'EMO'`
- **Add**:
  - Modal receives `onPickSingle` callback (spy assertion)
  - When modal "confirms" selection, `onPickFile(dni, { ref, displayName })` is called with `tipoExamen: 'CAMO'|'EMO'`
  - "Saltar" calls `onPickFile(dni, null)`
  - "Volver" / "Siguiente" / "Continuar" unchanged (just ensure they still work with the new callback)
- **Keep**: card structure, footer buttons, navigation assertions

### `buildEmailViewDataFromWizard.test.ts`
- **Modify**: existing tests should assert `tipoExamen` is set correctly from the step, not computed from filename

### Files with NO test changes
- `renameReadyFile.test.ts` (no behavioral change)
- `sendResults.test.ts` (no behavioral change)
- `useSendResults.test.ts` (no behavioral change)
- `WorkerDetailTable.test.tsx` (no behavioral change)
- `EnvioResultadosWizard.test.tsx` (routing unchanged; Step2/Step3 stubs still work)
- `Step4Resumen.test.tsx` (no behavioral change)
- `useEnvioWizard.test.ts` (reducer unchanged)
- `EmailEditor.test.tsx` (no behavioral change)
- `WizardStepper.test.tsx` (no behavioral change)
- `Step1Pacientes.test.tsx` (no behavioral change)
- `entities.test.ts` (no behavioral change)

---

## PR structure

### Option 1: single PR (recommended start)

**Estimated LOC**: ~400-600 (production + tests, with Strict TDD expansion at ~2.5x)
**Branch**: `feature/camo-emo-manual-browse` from `master`

| Work unit | Files | Tests |
|-----------|-------|-------|
| 1. FilesModal refactor (remove pick-single, add onPickSingle path) | FilesModal.tsx | FilesModal.test.tsx |
| 2. Step2Camo/Step3Emo refactor (change callback contract) | Step2Camo.tsx, Step3Emo.tsx | Step2Camo.test.tsx, Step3Emo.test.tsx |
| 3. buildEmailViewDataFromWizard simplification | buildEmailViewDataFromWizard.ts | buildEmailViewDataFromWizard.test.ts |

**If Strict TDD pushes over 600 LOC**: split into Option 2.

### Option 2: 2 PRs (fallback if over 600 LOC)

| PR | Scope | Est. LOC |
|----|-------|----------|
| PR1 | FilesModal refactor + tests | ~250 |
| PR2 | Step2Camo + Step3Emo + buildEmailViewDataFromWizard + tests | ~250 |

---


## Known follow-ups (from previous change)

- W-001: unused `buildEmailViewDataFromWizard` value import in `EnvioResultadosWizard.tsx:49` — fix to `import type { WizardEmailViewData }`
- S-001: extract `resolveCompanyId` to shared helper
- Bonus: `page.tsx:312-315` dead wrapper back button cleanup
