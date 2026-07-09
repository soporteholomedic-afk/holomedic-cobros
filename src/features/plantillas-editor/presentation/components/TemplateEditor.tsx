'use client';

import {
  useDroppable,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { lazy, useRef, useState, useSyncExternalStore, Suspense } from 'react';

import type { AreaConfig, PredefinedTable, TokenDef } from '../../infrastructure/areaConfigRegistry';
import type { SpitchType, Template, TokenAttrs } from '../../domain/entities';
import { SPITCH_TYPES } from '../../domain/entities';
import {
  type BlockNoteEditorViewHandle,
} from './BlockNoteEditorView';
import { TokenPalette } from './TokenPalette';
import { ClientOnly } from './ClientOnly';
import {
  SubjectTokenInput,
  type SubjectTokenInputHandle,
} from './SubjectTokenInput';
import { TokenChip } from './TokenChip';
import { ColumnPicker } from './ColumnPicker';
import { buildPreviewHtml } from '../helpers/buildPreviewHtml';
import { buildTableCellColorCSS } from './tableCellColors';
import { saveTemplateApi } from '../helpers/saveTemplateApi';
import {
  handlePaletteDragEnd,
  BODY_DROP_ID,
  SUBJECT_DROP_ID,
} from '../helpers/paletteDropRouter';

/**
 * Detect whether the component is running on the client (after hydration).
 * Uses `useSyncExternalStore` with a no-op subscribe — the snapshot is
 * `false` on the server and `true` on the client. This is the React 19
 * recommended pattern for client-only rendering and avoids the
 * `react-hooks/set-state-in-effect` lint rule (no `useEffect` + `setState`
 * cascade).
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {}, // subscribe: never changes
    () => true,      // client snapshot
    () => false,     // server snapshot
  );
}

/**
 * The BlockNote integration layer is lazy-loaded (design Decision c) so
 * BlockNote + ProseMirror never run on the server. Combined with the
 * `useIsClient` gate below, the editor is server-safe: during SSR the
 * gate shows the loading state, after hydration the lazy import resolves
 * and the editor mounts.
 *
 * `React.lazy` is preferred over `next/dynamic` here because:
 *  - `next/dynamic` with `ssr:false` cannot be rendered on the server
 *    at all (even for the loading state), which complicates tests in
 *    jsdom and the Suspense boundary.
 *  - `React.lazy` + the `useIsClient` gate achieves the same effect
 *    (BlockNote only runs on the client) with a standard React API
 *    that works identically in tests and production.
 *
 * Storage format (`{{token}}`) stays independent of BlockNote internals:
 * if BlockNote is replaced, only `BlockNoteEditorView`'s schema +
 * serialization change.
 */
const BlockNoteEditorViewLazy = lazy(() =>
  import('./BlockNoteEditorView').then((m) => ({ default: m.BlockNoteEditorView })),
);

export interface TemplateEditorProps {
  areaConfig: AreaConfig;
  templates: Template[];
}

interface PickerState {
  mode: 'insert' | 'edit';
  table: PredefinedTable;
  /** In edit mode, the chip's current attrs (for pre-population + update target). */
  editAttrs?: TokenAttrs;
}

/**
 * The BlockNote-based email template editor — the orchestrator client
 * component (design Decision c).
 *
 * Wires `TokenPalette` (dnd-kit drag source) + `SubjectTokenInput` (chip
 * subject) + `BlockNoteEditorViewDynamic` (ssr:false) + `ColumnPicker`
 * (table tokens) + save/preview flows. Save serializes the body via
 * `editorView.getHtml()` (which calls `blocksToHTMLLossy` → `{{token}}` HTML
 * via `encodeToken`) and POSTs to `/api/plantillas`. Preview renders a
 * sandboxed iframe `srcDoc` with `buildPreviewHtml` (simple mock-data
 * replace — the full `interpolateSpitch` is PR 4).
 *
 * The BlockNote editor instance + custom `token` schema live INSIDE
 * `BlockNoteEditorView`; this component orchestrates via the imperative
 * handle so it never imports `@blocknote/react` directly.
 */
export function TemplateEditor({ areaConfig, templates }: TemplateEditorProps) {
  // --- form state ---
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [name, setName] = useState('');
  const [type, setType] = useState<SpitchType>('company');
  const [subject, setSubject] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // --- save/preview state ---
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  // Preview HTML is computed on demand (when the user toggles preview on),
  // NOT on every render — computing it during render would read the
  // BlockNote ref during render, which `react-hooks/refs` disallows.
  const [previewHtml, setPreviewHtml] = useState<string>('');

  // --- column picker state ---
  const [picker, setPicker] = useState<PickerState | null>(null);

  // --- drag-and-drop state ---
  const [activeDragAttrs, setActiveDragAttrs] = useState<TokenAttrs | null>(null);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);

  // --- imperative refs ---
  const editorViewRef = useRef<BlockNoteEditorViewHandle>(null);
  const subjectInputRef = useRef<SubjectTokenInputHandle>(null);

  // --- client-only BlockNote ---
  // BlockNote + ProseMirror cannot run on the server (they use browser APIs).
  // `useIsClient` returns `false` during SSR and the first client render
  // before hydration; after hydration it returns `true`. The dynamically-
  // imported `BlockNoteEditorViewDynamic` only renders once we're on the
  // client.
  const isClient = useIsClient();

  // --- dnd-kit sensors ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  function handleDragStart(event: DragStartEvent) {
    const payload = event.active.data.current as
      | { type?: string; attrs?: TokenAttrs; label?: string }
      | undefined;
    if (payload?.type === 'token' && payload.attrs) {
      setActiveDragAttrs(payload.attrs);
      setActiveDragLabel(payload.label ?? null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragAttrs(null);
    setActiveDragLabel(null);
    handlePaletteDragEnd(
      event as unknown as Parameters<typeof handlePaletteDragEnd>[0],
      subjectInputRef.current,
      editorViewRef.current,
    );
  }

  function handleSelectTemplate(id: string) {
    setSelectedTemplateId(id);
    if (id === '') {
      setName('');
      setSubject('');
      setIsDefault(false);
      // Clear the editor by loading empty HTML.
      editorViewRef.current?.loadHtml('<p></p>');
      return;
    }
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setName(tpl.name);
    setType(tpl.type);
    setSubject(tpl.subject);
    setIsDefault(tpl.isDefault);
    editorViewRef.current?.loadHtml(tpl.bodyHtml);
  }

  function handlePickTable(token: TokenDef) {
    if (!token.tableRef) return;
    const table = areaConfig.predefinedTables.find((t) => t.name === token.tableRef);
    if (!table) return;
    setPicker({ mode: 'insert', table });
  }

  function handlePickerConfirm(attrs: TokenAttrs) {
    if (!picker) return;
    if (picker.mode === 'insert') {
      editorViewRef.current?.insertToken(attrs);
    } else if (picker.editAttrs?.table) {
      editorViewRef.current?.updateTableToken({ table: picker.editAttrs.table }, attrs);
    }
    setPicker(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const bodyHtml = editorViewRef.current?.getHtml() ?? '';
      const result = await saveTemplateApi({
        area: areaConfig.area,
        type,
        name,
        subject,
        bodyHtml,
        ...(selectedTemplateId ? { id: selectedTemplateId } : {}),
        ...(isDefault ? { isDefault: true } : {}),
      });
      setSaveMessage(
        selectedTemplateId
          ? `Plantilla actualizada (id ${result.id}).`
          : `Plantilla guardada (id ${result.id}).`,
      );
      if (!selectedTemplateId) {
        setSelectedTemplateId(result.id);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No se pudo guardar la plantilla');
    } finally {
      setSaving(false);
    }
  }

  function handleTogglePreview() {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    // Compute the preview HTML on demand (event handler — safe to read refs).
    const bodyHtml = editorViewRef.current?.getHtml() ?? '';
    const bodyPreview = buildPreviewHtml(bodyHtml, areaConfig.mockPreviewData);
    setPreviewHtml(
      `<!DOCTYPE html><html><head><style>
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background-color: #f8f9fa; font-weight: 600; }
        ${buildTableCellColorCSS()}
      </style></head><body>${bodyPreview}</body></html>`,
    );
    setShowPreview(true);
  }

  return (
    <ClientOnly>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6 p-6">
          {/* ===== LEFT: Token palette ===== */}
          <TokenPalette areaConfig={areaConfig} onPickTable={handlePickTable} />

        {/* ===== RIGHT: Editor form ===== */}
        <div className="space-y-4">
          {/* Template selector + name + type */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="template-select" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Plantilla
              </label>
              <select
                id="template-select"
                aria-label="Plantilla"
                value={selectedTemplateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              >
                <option value="">— Nueva plantilla —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[12rem] space-y-1">
              <label htmlFor="template-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Nombre
              </label>
              <input
                id="template-name"
                aria-label="Nombre de la plantilla"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                placeholder="Nombre de la plantilla"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="template-type" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Tipo
              </label>
              <select
                id="template-type"
                aria-label="Tipo"
                value={type}
                onChange={(e) => setType(e.target.value as SpitchType)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              >
                {SPITCH_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === 'company' ? 'Empresa' : 'Paciente'}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Por defecto
            </label>
          </div>

          {/* Subject (dnd drop target) */}
          <SubjectDropZone>
            <SubjectTokenInput
              ref={subjectInputRef}
              value={subject}
              onChange={setSubject}
              areaConfig={areaConfig}
            />
          </SubjectDropZone>

          {/* Body editor (dnd drop target) */}
          <BodyDropZone className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 min-h-[20rem]">
            {isClient ? (
              <Suspense
                fallback={
                  <div data-testid="editor-loading" className="text-sm text-slate-400 p-4">
                    Cargando editor…
                  </div>
                }
              >
                <BlockNoteEditorViewLazy
                  ref={editorViewRef}
                  areaConfig={areaConfig}
                  onChange={() => {
                    /* dirty tracking — PR 4 can wire finer-grained change detection */
                  }}
                  onTokenClick={(attrs) => {
                    // Edit-in-place: re-open the picker for an existing table chip.
                    if (attrs.key === 'tabla' && attrs.table) {
                      const table = areaConfig.predefinedTables.find((t) => t.name === attrs.table);
                      if (table) {
                        setPicker({ mode: 'edit', table, editAttrs: attrs });
                      }
                    }
                  }}
                />
              </Suspense>
            ) : (
              <div data-testid="editor-loading" className="text-sm text-slate-400 p-4">
                Cargando editor…
              </div>
            )}
          </BodyDropZone>

          {/* Save + Preview buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !name.trim() || !subject.trim()}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={handleTogglePreview}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {showPreview ? 'Ocultar previsualización' : 'Previsualizar'}
            </button>
            {saveMessage && (
              <span role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
                {saveMessage}
              </span>
            )}
            {saveError && (
              <span role="alert" className="text-sm text-red-600 dark:text-red-400">
                {saveError}
              </span>
            )}
          </div>

          {/* Preview iframe (sandboxed) */}
          {showPreview && (
            <iframe
              title="Vista previa del correo"
              srcDoc={previewHtml}
              sandbox=""
              className="w-full min-h-[24rem] rounded-lg border border-slate-200 dark:border-slate-700 bg-white"
            />
          )}
        </div>
      </div>

      {/* Column picker popover (modal overlay) */}
      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setPicker(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <ColumnPicker
              predefinedTable={picker.table}
              onConfirm={handlePickerConfirm}
              onCancel={() => setPicker(null)}
              initialCols={picker.mode === 'edit' ? picker.editAttrs?.cols : undefined}
            />
          </div>
        </div>
      )}
      <DragOverlay dropAnimation={null}>
        {activeDragAttrs && activeDragLabel ? (
          <TokenChip label={activeDragLabel} attrs={activeDragAttrs} />
        ) : null}
      </DragOverlay>
      </DndContext>
    </ClientOnly>
  );
}

/**
 * Wraps the body editor area in a `useDroppable` so dnd-kit can detect drops
 * on the body. Must be rendered INSIDE the `<DndContext>` — extracted from
 * `TemplateEditor` because `useDroppable` reads the DndContext via React
 * context (calling it in the parent component would be outside the provider).
 */
function BodyDropZone({ children, className }: { children: React.ReactNode; className?: string }) {
  const { setNodeRef } = useDroppable({ id: BODY_DROP_ID });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
}

/**
 * Wraps the subject input in a `useDroppable` so dnd-kit can detect drops
 * on the subject line. Must be rendered INSIDE the `<DndContext>`.
 */
function SubjectDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: SUBJECT_DROP_ID });
  return (
    <div ref={setNodeRef}>
      {children}
    </div>
  );
}
