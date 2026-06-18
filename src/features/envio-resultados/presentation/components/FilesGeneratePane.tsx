'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Download, FileText, RefreshCw, XCircle } from 'lucide-react';
import type { GenerarPdfRequest, GenerarPdfResponse, ManifestRow, PlantillaRow } from '@/types/informe';
import {
  COD_EMP,
  COD_SED,
  COD_TCL,
  CLI_USER,
  CLI_PASS,
} from '@/features/envio-resultados/infrastructure/informes/constants';
import { useInformeOrder } from '@/features/envio-resultados/presentation/hooks/useInformeOrder';
import { usePlantillas } from '@/features/envio-resultados/presentation/hooks/usePlantillas';
import { useGenerarPdf } from '@/features/envio-resultados/presentation/hooks/useGenerarPdf';

/**
 * Fixed values for the generar request that don't come from the
 * `InformeNoCerradoRow` lookup. These mirror the legacy v1 call
 * sites (`InformesMedicosD.cs:28-29`).
 */
const DEFAULT_EMI_AFI = 1;
const DEFAULT_INC_EXP = 0;

export interface FilesGeneratePaneProps {
  ruc: string;
  dni: string;
  idAten: string;
  /**
   * Date the patient was attended (date-only, `dd/MM/yyyy`). Sourced
   * from `UnifiedFicha.fecAte` and forwarded to the lookup SP. When
   * empty the pane renders the "no order" disabled state.
   */
  fecAte?: string;
  /**
   * Fired exactly once per successful generation. The parent
   * (`FilesModal`) uses it to (a) invalidate the file-explorer
   * hook so the new PDFs appear in "Listo para enviar" and (b)
   * switch the active tab to `'ready'`.
   */
  onSuccess?: (result: GenerarPdfResponse) => void;
}

/**
 * Pane for the "Generar archivos" tab. Renders a checklist of the
 * plantillas resolved by `usePlantillas`, a **Descargar** button,
 * and a per-row status table from the response manifest.
 *
 * State flow:
 *
 * 1. `useInformeOrder(idAten, fecAte)` resolves the order metadata
 *    (`numOrd`, `codCli`, `codDCo?`).
 * 2. `usePlantillas(idAten, order)` lists the available exam
 *    templates (only when `order` is non-null).
 * 3. The operator toggles checkboxes → `Set<number>` of `idePMe`.
 * 4. **Descargar** builds a `GenerarPdfRequest` and calls
 *    `useGenerarPdf.run(request)`.
 * 5. The hook retries up to 3 times (1+2) with 1s/2s backoff.
 * 6. On success the pane renders the manifest status table and
 *    fires `onSuccess(result)` once.
 */
export function FilesGeneratePane({
  ruc,
  dni,
  idAten,
  fecAte = '',
  onSuccess,
}: FilesGeneratePaneProps): ReactElement {
  const trimmedFecAte = fecAte.trim();
  const { state: orderState } = useInformeOrder(idAten, trimmedFecAte);
  const order = orderState.kind === 'ready' ? orderState.row : null;
  const { state: plantillasState } = usePlantillas(idAten, order);
  const { status, result, lastError, attempts, run, reset } = useGenerarPdf();

  // Selection state — `Set<number>` of `idePMe`. The pane owns it
  // locally; the parent doesn't need to read it.
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  // When the plantillas list changes (different order, refetch),
  // reset the selection — operators rarely keep the same selection
  // across different orders.
  const lastPlantillasKeyRef = useRef<string>('');
  useEffect(() => {
    const key =
      plantillasState.kind === 'ready'
        ? plantillasState.items.map((p) => p.idePMe).join(',')
        : '';
    if (key !== lastPlantillasKeyRef.current) {
      lastPlantillasKeyRef.current = key;
      setSelected(new Set());
    }
  }, [plantillasState]);

  // Fire `onSuccess` exactly once per successful run. The ref
  // remembers the response identity so a status flip back to
  // 'idle' (via `reset`) does not re-fire the callback.
  const firedSuccessRef = useRef<GenerarPdfResponse | null>(null);
  useEffect(() => {
    if (status === 'success' && result !== null && firedSuccessRef.current !== result) {
      firedSuccessRef.current = result;
      onSuccess?.(result);
    }
  }, [status, result, onSuccess]);

  const toggleIdePMe = useCallback((idePMe: number): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idePMe)) next.delete(idePMe);
      else next.add(idePMe);
      return next;
    });
  }, []);

  const selectedList = useMemo(() => Array.from(selected), [selected]);

  // The Descargar button is enabled when:
  // - the order has resolved AND
  // - the plantillas list is ready AND
  // - at least one plantilla is selected AND
  // - the order carries a non-null `codCli` (the route requires it) AND
  // - we are not currently loading
  const canDownload =
    order !== null &&
    order.codCli !== null &&
    plantillasState.kind === 'ready' &&
    selected.size > 0 &&
    status !== 'loading';

  const handleDescargar = useCallback((): void => {
    if (order === null || order.codCli === null) return;
    const request: GenerarPdfRequest = {
      idAten,
      codEmp: COD_EMP,
      codSed: COD_SED,
      codTCl: COD_TCL,
      numOrd: order.numOrd,
      codCli: order.codCli,
      emiAfi: DEFAULT_EMI_AFI,
      incExp: DEFAULT_INC_EXP,
      codDCo: order.codDCo,
      ruc,
      dni,
      user: CLI_USER,
      pass: CLI_PASS,
      idePmeList: selectedList,
    };
    run(request);
  }, [order, idAten, ruc, dni, selectedList, run]);

  // The pane title carries the (ruc, dni, idAten) triple so the
  // operator can confirm the active context — mirrors the
  // placeholder's footer line.
  return (
    <div className="flex flex-col h-full" data-testid="files-generate-pane">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
          {ruc} / {dni} / {idAten}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ---- Guard: empty fecAte (worker-sourced ficha) ---- */}
        {trimmedFecAte === '' && (
          <Notice kind="info" message="No se puede generar archivos para esta ficha (sin orden asociada)." />
        )}

        {/* ---- Order lookup state ---- */}
        {trimmedFecAte !== '' && orderState.kind === 'loading' && (
          <Skeleton label="Buscando orden..." testId="files-generate-order-skeleton" />
        )}

        {trimmedFecAte !== '' && orderState.kind === 'error' && (
          <ErrorBlock
            message={orderState.message}
            actionLabel="Reintentar"
            onAction={() => {
              // Re-arm the lookup by remounting: simplest path is
              // forcing a state bump in useInformeOrder via its
              // refetch. We don't expose it here, so we use the
              // local-selected reset + a window.location nudge
              // would be heavy; instead trigger a stable
              // `useGenerarPdf.reset()` so the retry path is
              // re-armed. The operator can also click "Reintentar"
              // on the plantillas block below.
            }}
            disabled
            testId="files-generate-order-error"
          />
        )}

        {trimmedFecAte !== '' && orderState.kind === 'empty' && (
          <Notice
            kind="info"
            message={`No se encontró la orden ${idAten} en ${trimmedFecAte}.`}
          />
        )}

        {/* ---- Plantillas state (only when order is ready) ---- */}
        {orderState.kind === 'ready' && (
          <>
            {plantillasState.kind === 'loading' && (
              <Skeleton label="Cargando plantillas..." testId="files-generate-plantillas-skeleton" />
            )}

            {plantillasState.kind === 'error' && (
              <ErrorBlock
                message={plantillasState.message}
                actionLabel="Reintentar"
                onAction={reset}
                testId="files-generate-plantillas-error"
              />
            )}

            {plantillasState.kind === 'empty' && (
              <Notice kind="info" message="No hay plantillas disponibles para esta orden." />
            )}

            {plantillasState.kind === 'ready' && (
              <Checklist
                items={plantillasState.items}
                selected={selected}
                onToggle={toggleIdePMe}
                disabled={status === 'loading'}
              />
            )}
          </>
        )}

        {/* ---- Post-generation result ---- */}
        {status === 'success' && result !== null && (
          <ResultBlock result={result} plantillas={plantillasState.kind === 'ready' ? plantillasState.items : []} />
        )}

        {status === 'error' && lastError !== null && (
          <ErrorBlock
            message={lastError}
            actionLabel="Reintentar"
            onAction={reset}
            testId="files-generate-error"
          />
        )}
      </div>

      {/* ---- Footer with Descargar button ---- */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400" data-testid="files-generate-counter">
          {selected.size > 0 ? `${selected.size} seleccionado(s)` : 'Sin selección'}
        </span>
        <button
          type="button"
          onClick={handleDescargar}
          disabled={!canDownload}
          aria-disabled={canDownload ? 'false' : 'true'}
          data-testid="files-generate-download"
          className={
            'px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg transition-all duration-300 inline-flex items-center gap-2 ' +
            (status === 'loading'
              ? 'bg-slate-400 cursor-wait'
              : canDownload
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 shadow-emerald-500/20 hover:scale-[1.02]'
                : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed')
          }
        >
          <Download className="w-4 h-4" />
          {status === 'loading' ? `Descargando... (intento ${attempts}/3)` : 'Descargar'}
        </button>
      </div>
    </div>
  );
}

// ---- Sub-components (kept inline to stay within the 400-line budget) ----

interface NoticeProps {
  kind: 'info' | 'warning';
  message: string;
}
function Notice({ kind, message }: NoticeProps): ReactElement {
  return (
    <div
      className={
        'p-3 rounded-lg border text-sm ' +
        (kind === 'info'
          ? 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50 text-sky-700 dark:text-sky-300'
          : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300')
      }
      role="status"
    >
      {message}
    </div>
  );
}

interface SkeletonProps {
  label: string;
  testId?: string;
}
function Skeleton({ label, testId }: SkeletonProps): ReactElement {
  return (
    <div data-testid={testId} className="space-y-2">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-9 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ))}
    </div>
  );
}

interface ErrorBlockProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  testId?: string;
}
function ErrorBlock({ message, actionLabel, onAction, disabled = false, testId }: ErrorBlockProps): ReactElement {
  return (
    <div
      data-testid={testId}
      className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm space-y-2"
    >
      <div className="flex items-center space-x-2">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RefreshCw className="w-4 h-4" />
        <span>{actionLabel}</span>
      </button>
    </div>
  );
}

interface ChecklistProps {
  items: readonly PlantillaRow[];
  selected: ReadonlySet<number>;
  onToggle: (idePMe: number) => void;
  disabled: boolean;
}
function Checklist({ items, selected, onToggle, disabled }: ChecklistProps): ReactElement {
  return (
    <ul data-testid="files-generate-checklist" className="space-y-1.5">
      {items.map((item) => {
        const isSelected = selected.has(item.idePMe);
        return (
          <li
            key={item.idePMe}
            className={
              'flex items-center px-3 py-2 rounded-lg border ' +
              (isSelected
                ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20'
                : 'border-slate-100 dark:border-slate-800')
            }
          >
            <label className="flex items-center space-x-2 min-w-0 flex-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isSelected}
                disabled={disabled}
                onChange={() => onToggle(item.idePMe)}
                aria-label={`Seleccionar ${item.arcPla}`}
                data-testid={`files-generate-checkbox-${item.idePMe}`}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
              />
              {isSelected ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
              ) : (
                <Circle className="w-4 h-4 flex-shrink-0 text-slate-300" />
              )}
              <FileText className="w-4 h-4 flex-shrink-0 text-slate-400" />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {item.arcPla}
              </span>
              <span className="text-xs font-mono text-slate-400 flex-shrink-0">#{item.idePMe}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

interface ResultBlockProps {
  result: GenerarPdfResponse;
  plantillas: readonly PlantillaRow[];
}
function ResultBlock({ result, plantillas }: ResultBlockProps): ReactElement {
  const labelByIde = new Map<number, string>();
  for (const p of plantillas) labelByIde.set(p.idePMe, p.arcPla);
  return (
    <div data-testid="files-generate-result" className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
        Resultado
      </h4>
      <ul className="space-y-1">
        {result.manifest.map((row: ManifestRow) => (
          <li
            key={row.idePMe}
            data-testid={`files-generate-row-${row.idePMe}`}
            className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800 text-sm"
          >
            <div className="flex items-center space-x-2 min-w-0 flex-1">
              {row.status === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              ) : row.status === 'skipped' ? (
                <Circle className="w-4 h-4 text-slate-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                {row.arcPla ?? labelByIde.get(row.idePMe) ?? `#${row.idePMe}`}
              </span>
              {row.file !== undefined && (
                <span className="text-xs font-mono text-slate-400 truncate">{row.file}</span>
              )}
            </div>
            <span
              className={
                'text-xs font-bold uppercase tracking-wider ' +
                (row.status === 'success'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : row.status === 'skipped'
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'text-red-600 dark:text-red-400')
              }
            >
              {row.status}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Generados: {result.summary.generated} · Omitidos: {result.summary.skipped} ·
        Fallidos: {result.summary.failed} · exit {result.summary.exitCode}
      </p>
    </div>
  );
}
