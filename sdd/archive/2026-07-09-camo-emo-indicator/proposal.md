# Proposal: CAMO/EMO Indicator in Legajos

## Status
**PROPOSED** — awaiting user approval.

## Intent
Operators reviewing worker exam records currently have to open the "FilesModal" for each row individually to see if CAMO (Certificado) or EMO (Examen) PDFs exist. We need to display these document statuses directly in `WorkerDetailTable` at a glance to save time and reduce server load.

## Scope

### In Scope
- A new Next.js endpoint `POST /api/files/check-legajos` to check files in batch.
- A new custom hook `useLegajosStatus` to fetch and manage status/error states per patient row.
- A "Verificar documentos" button at the table level to trigger the check on-demand.
- A "Documentos" column in `WorkerDetailTable` displaying "CAMO" (green) and "EMO" (violet) text labels (gray if absent/unchecked).
- Inline retry indicator/error status per patient row on folder check failure.
- Unit tests for the new hook, API route, and UI elements.

### Out of Scope
- Automatic triggers on page load or after PDF generation (always manual/on-demand).
- Click interactions or previews directly from the badges (purely informational).
- Checks outside the `LEGAJOS` folder.

## Capabilities

### New Capabilities
- `batch-check-legajos`: Server-side endpoint to query file existence for multiple patient paths in parallel.
- `display-camo-emo-status`: UI status indicators showing CAMO/EMO availability.

### Modified Capabilities
- `view-patient-results-list`: Added on-demand document check triggering and row-level status/error rendering.

## Approach
Implement `POST /api/files/check-legajos` accepting `{ ruc, dni, idAten }[]`. It queries `/LEGAJOS` using `Promise.allSettled` and returns a map of `{ idAten: { hasCamo: boolean, hasEmo: boolean, error?: string } }`.

Frontend: `WorkerDetailTable` renders a "Verificar documentos" button. When clicked, `useLegajosStatus` issues a single batch request for all loaded rows. 

The "Documentos" column renders simple green ("CAMO") and violet ("EMO") badges. Absent or unchecked states are gray. Individual row check failures will display a small error state with a retry option.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/api/files/check-legajos/route.ts` | New | Batch check POST route |
| `src/features/envio-resultados/presentation/hooks/useLegajosStatus.ts` | New | Hook managing on-demand status & errors |
| `src/features/envio-resultados/presentation/components/WorkerDetailTable.tsx` | Modified | Add "Verificar documentos" button, column, badges, and retry triggers |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| UNC share latency/timeouts hang batch | Med | Wrap each check in a timeout/try-catch, returning a failure status/message for that `idAten` without failing the entire batch. |
| Large batches overwhelm server | Low | The batch is restricted to currently loaded rows. |

## Rollback Plan
Revert git commit containing the new route, hook, and table changes.

## Success Criteria
- [ ] Users can trigger document check manually via "Verificar documentos".
- [ ] Badges show correct green/violet statuses or gray/error states per row.
- [ ] Failed row checks show error indicators and can be retried individually.
