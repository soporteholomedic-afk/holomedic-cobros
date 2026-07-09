# Technical Design: CAMO/EMO Indicator in Legajos

This document outlines the design and implementation details for on-demand batch checks of CAMO (Certificado) and EMO (Examen) PDFs directly within the unified results table.

## 1. Technical Approach
Operators require an on-demand, batch-level check of CAMO/EMO files in `WorkerDetailTable` to prevent unnecessary folder-by-folder clicks.
- **Backend API**: A Next.js POST endpoint `/api/files/check-legajos` processes an array of `{ ruc, dni, idAten }` objects. It resolves them concurrently using the existing `UncFileRepository` to check the `LEGAJOS` folder.
  - CAMO is present if any file matches `^\d+CERT\.pdf$` (case-insensitive).
  - EMO is present if any file matches `^\d+EXPED\.pdf$` (case-insensitive).
- **Frontend Hook**: `useLegajosStatus` triggers the batch call, tracking overall loading/error status and a dictionary of row-specific results.
- **Frontend UI**: A "Verificar documentos" button is added next to the company name. The table displays a "Documentos" column containing CAMO and EMO badges. If checking a folder fails, a small retry option is shown next to that row.

## 2. Architecture Decisions
### Server-Side Batch API (Chosen)
- **Alternative**: Client-side parallel checks where the browser sends `GET /api/files/list-folder` requests for every patient row.
- **Rationale**: Client-side checking hits browser concurrency limits (max 6 parallel requests per domain), causing queueing delays and excessive network overhead. A batch endpoint reduces connection overhead, runs file checks co-located with the LAN share, and improves performance.
- **Error Isolation**: Individual folder checks are wrapped in try-catch blocks and resolved using `Promise.allSettled`. This ensures folder lookup failures (e.g., specific folder access issues) return a row-level error without failing the entire batch.

## 3. Data Flow

```
[WorkerDetailTable]
        │
   (Click "Verificar documentos")
        │
        ▼
[useLegajosStatus]
        │
  POST /api/files/check-legajos  [{ ruc, dni, idAten }, ...]
        │
        ▼
[Next.js API Route] ──(Promise.allSettled)──► [UncFileRepository]
        │                                             │
        │◄─── [{ name: "123CERT.pdf" }, ...] ─────────┘ (readdir)
        │
        ▼
  Return JSON: { [idAten]: { hasCamo, hasEmo } }
        │
        ▼
[useLegajosStatus] (Update status map)
        │
        ▼
[WorkerDetailTable] (Render badges / error-retry)
```

## 4. Affected Files
- [route.ts](file:///home/sysadmin/DEV/holomedic-cobros/src/app/api/files/check-legajos/route.ts) (New): Next.js POST route for batch checking.
- [useLegajosStatus.ts](file:///home/sysadmin/DEV/holomedic-cobros/src/features/envio-resultados/presentation/hooks/useLegajosStatus.ts) (New): Custom hook managing batch state and retries.
- [WorkerDetailTable.tsx](file:///home/sysadmin/DEV/holomedic-cobros/src/features/envio-resultados/presentation/components/WorkerDetailTable.tsx) (Modified): Column headers, badges, button, and sub-rows.

## 5. Interfaces / Contracts

### API Request / Response
```typescript
interface CheckLegajosItem {
  ruc: string;
  dni: string;
  idAten: string;
}

// Request Payload: CheckLegajosItem[]

type CheckLegajosResponse = Record<string, {
  hasCamo: boolean;
  hasEmo: boolean;
  error?: string;
}>;
```

### Hook API
```typescript
export interface LegajosRowStatus {
  hasCamo: boolean;
  hasEmo: boolean;
  error?: string;
  loading?: boolean;
}

export interface UseLegajosStatusReturn {
  statuses: Record<string, LegajosRowStatus>;
  checkAll: (items: CheckLegajosItem[]) => Promise<void>;
  checkRow: (item: CheckLegajosItem) => Promise<void>;
  isChecking: boolean;
  error: string | null;
}
```

## 6. Testing Strategy

### API Route Tests
- Mock `IFileRepository` using `__setFileRepositoryForTests`.
- Assert that `POST /api/files/check-legajos` rejects invalid parameters (e.g. empty or non-numeric DNI) with a `400` status.
- Verify correct parsing of file names (CAMO vs. EMO) and that file exceptions resolve to individual item error statuses rather than endpoint crashes.

### Hook Tests
- Mock `fetch` globally in `useLegajosStatus.test.ts`.
- Verify state updates during check sequences (`loading` -> `success`).
- Confirm that calling `checkRow` invokes the backend endpoint with a single-item array and updates the targeted row's status correctly.

### UI & Table Tests
- Mock `useLegajosStatus` in `WorkerDetailTable.test.tsx`.
- Assert that:
  1. A "Documentos" column is rendered.
  2. "Verificar documentos" button triggers `checkAll` with the mapped row details.
  3. Green (CAMO) and violet (EMO) badges render if files exist, and gray labels render if unchecked/absent.
  4. Rows with errors display a retry button that triggers `checkRow`.
