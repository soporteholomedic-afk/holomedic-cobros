# Tasks: CAMO/EMO Indicator in Legajos

## Review Workload Forecast
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units
| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Create batch verification API & tests | PR 1 | ~100 lines |
| 2 | Implement frontend hook `useLegajosStatus` & tests | PR 2 | ~100 lines |
| 3 | Integrate column, badges & retry button in `WorkerDetailTable` & tests | PR 3 | ~150 lines |

## Phase 1: Infrastructure / Foundation
- [x] 1.1 Create `src/app/api/files/check-legajos/route.ts` implementing a POST handler that validates the `{ ruc, dni, idAten }[]` payload and returns `400` if DNI is non-numeric or parameters are missing.
- [x] 1.2 Implement concurrent folder reads in the route using `getFileRepository().listFolder(ruc, dni, idAten, 'LEGAJOS')` wrapped in a catch block per patient to capture single-row lookup failures without crashing the entire batch request.
- [x] 1.3 Add regex check on files returned to determine `hasCamo` (file name matching `^\d+CERT\.pdf$` case-insensitively) and `hasEmo` (file name matching `^\d+EXPED\.pdf$` case-insensitively).
- [x] 1.4 Write unit tests in `src/app/api/files/check-legajos/__tests__/route.test.ts` mocking the UNC repository to assert correct status responses, validation failures, and row-level error propagation.

## Phase 2: Core Implementation
- [x] 2.1 Implement `useLegajosStatus.ts` in `src/features/envio-resultados/presentation/hooks/` to track `statuses`, `isChecking`, and hook-level `error`.
- [x] 2.2 Add `checkAll` function to the hook to trigger verification for all provided patient items, updating loading/success/error statuses dynamically.
- [x] 2.3 Add `checkRow` function to the hook to issue a single-item check for targeted retries on individual row failures.
- [x] 2.4 Add unit tests in `src/features/envio-resultados/presentation/hooks/__tests__/useLegajosStatus.test.ts` to assert transitions for loading, success, and individual row failures.

## Phase 3: Testing / Verification
- [x] 3.1 Import and instantiate `useLegajosStatus` in `src/features/envio-resultados/presentation/components/WorkerDetailTable.tsx`.
- [x] 3.2 Add the "Verificar documentos" button next to the company header. Trigger `checkAll` passing all current row details when clicked.
- [x] 3.3 Add the "Documentos" column header and render gray/green/violet badges and retry buttons on primary and sub-rows depending on `hasCamo` and `hasEmo` state.
- [x] 3.4 Wire the inline retry click handler to execute `checkRow` for the specific failed patient record.
- [x] 3.5 Update `WorkerDetailTable.test.tsx` to assert "Documentos" header, "Verificar documentos" trigger behavior, badge rendering colors, error states, and individual retry actions.

## Phase 4: Cleanup / Documentation
- [x] 4.1 Run full project test suite (`vitest`) to ensure zero regressions in results table or files modal logic.
- [x] 4.2 Document the batch check mechanism in the codebase comments and verify clean build outputs.
