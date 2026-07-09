## Exploration: CAMO/EMO Indicator in Legajos

### Current State
Today, the patient results page (`src/app/consolidados/envio-resultados/page.tsx`) displays the list of workers using the `WorkerDetailTable` component. This component fetches patient data by calling the `useUnifiedResults` hook.

The `useUnifiedResults` hook merges:
1. Worker exam data from SQL Server (`SP_RPT_MATRIZICCGSA` via `GET /api/consolidados/results`)
2. Patient order data from SQL Server (`SP_SEL_ORDEN` via `GET /api/consolidados/results_by_companies`)

Files for each patient are located under `\\172.16.10.12\sigla\{ruc}\{dni}\{idAten}\LEGAJOS` on the LAN share. Currently, they are only checked on-demand when the operator opens the `FilesModal` for a specific row. Inside the modal, the `useReadyFiles` hook invokes `GET /api/files/list-folder` with `path=LEGAJOS`. 

File names are matched against the regex `/^\d+(CERT|EXPED)\.pdf$/i`:
- `CERT` files represent the **CAMO** (Certificado de Aptitud Médica Ocupacional).
- `EXPED` files represent the **EMO** (Examen Médico Ocupacional).

There is currently no batch API or mechanism to check the existence of CAMO/EMO files for all patients in the table in a single request.

---

### Affected Areas
- `src/features/envio-resultados/presentation/components/WorkerDetailTable.tsx`
  Needs to display a new "Documentos" column with badges showing the CAMO/EMO status for the primary row and expanded sub-rows.
- `src/features/envio-resultados/presentation/hooks/useLegajosStatus.ts` (NEW)
  A custom hook to extract valid fichas, trigger the batch status endpoint, and expose the loading/status states.
- `src/app/api/files/check-legajos/route.ts` (NEW)
  A Next.js App Router POST endpoint that accepts an array of `{ ruc, dni, idAten }` and checks file presence on the LAN share.

---

### Approaches

#### 1. Client-Side Parallel Fetches
The client loops over loaded patients/fichas and triggers a parallel `GET /api/files/list-folder` call for each one.
- **Pros**: 
  - No new backend API endpoints are needed.
  - Reuses the existing `/api/files/list-folder` endpoint.
- **Cons**: 
  - Extremely inefficient. A table of 50 patients with multiple fichas could trigger 50–70 parallel HTTP requests.
  - Throttled by browser domain limits (max 6 concurrent requests), causing a slow queue and bad user experience.
  - High resource consumption on the web server and the LAN file share.
- **Effort**: Medium (due to writing complex client-side request scheduling/batching to prevent browser choking).

#### 2. Server-Side Batch API (Recommended)
Introduce a new endpoint `POST /api/files/check-legajos` that accepts an array of `{ ruc, dni, idAten }`. The server performs file checks concurrently (using `Promise.allSettled`) and returns a combined map of results.
- **Pros**:
  - Only a single HTTP request from the browser.
  - Server-side checking is extremely fast since the server is co-located with the LAN file share or CIFS mount.
  - Clean API contract and optimal network usage.
  - No browser connection limit bottlenecks.
- **Cons**:
  - Requires adding a new Next.js route.
- **Effort**: Low-Medium.

---

### Recommendation
We recommend **Approach 2 (Server-Side Batch API)**. This ensures optimal performance and scaling, especially for companies with larger numbers of workers, and avoids hitting browser connection limits.

The implementation details:
1. **API route**: `POST /api/files/check-legajos` accepts a list of `{ ruc, dni, idAten }`. It loops over the items, performs a `listFolder` check for each, parses the files using `isReadyFile`, and checks if any file names contain `CERT` (CAMO) or `EXPED` (EMO). It returns a dictionary mapping `idAten` to `{ hasCamo: boolean, hasEmo: boolean }`.
2. **Hook**: `useLegajosStatus` collects all fichas with non-empty `ruc`, `dni`, and `idAten`, POSTs to `/api/files/check-legajos`, and yields a status map.
3. **UI**: Add a "Documentos" column to `WorkerDetailTable` displaying gray, green (CAMO), and violet (EMO) status badges.

---

### Risks
- **UNC Share Offline / Latency**: If the file server goes offline or has high latency, checking multiple folders could hang the request.
  - *Mitigation*: We should use `Promise.allSettled` to resolve each folder check independently, wrap each file system operation in a safe try/catch block returning `{ hasCamo: false, hasEmo: false }` on failure, and set a timeout or keep the operations non-blocking.
- **Worker-sourced Rows**: Rows without matching orders have empty `idAten` or `ruc` values, making a file check impossible.
  - *Mitigation*: These rows are ignored in the batch request, defaulting to gray (absent) badges in the UI.

### Ready for Proposal
Yes — the exploration is complete. The orchestrator should proceed to define the proposal for this feature.
