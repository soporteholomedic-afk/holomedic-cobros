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
        // Always send the checkbox state — including `false` when the user
        // unchecks "Por defecto" — so the repository persists the uncheck
        // instead of silently keeping the stored default.
        isDefault,
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
        <main className="mx-auto w-full max-w-7xl px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-6 lg:py-8">
          <header className="mb-6 border-b border-slate-200 pb-5 dark:border-slate-700">
            <p className="mb-1 text-sm font-medium text-sky-700 dark:text-sky-300">{areaConfig.label}</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Editor de plantillas</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Configura el correo, arrastra variables al asunto o al cuerpo y comprueba el resultado antes de guardar.
            </p>
          </header>

          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-start">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
              <h2 className="mb-1 text-base font-semibold">Variables disponibles</h2>
              <p className="mb-4 text-sm leading-5 text-slate-600 dark:text-slate-300">
                Arrastra una variable al asunto o al cuerpo. Para insertar una tabla, elige sus columnas.
              </p>
              <TokenPalette areaConfig={areaConfig} onPickTable={handlePickTable} />
            </div>

            <div className="min-w-0 space-y-6">
              <section aria-labelledby="template-config-heading" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/60 sm:p-6">
                <div className="mb-5">
                  <h2 id="template-config-heading" className="text-lg font-semibold">Configuración de la plantilla</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Selecciona una plantilla existente o crea una nueva.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1.5">
                    <label htmlFor="template-select" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                      Plantilla
                    </label>
                    <select
                      id="template-select"
                      value={selectedTemplateId}
                      onChange={(e) => handleSelectTemplate(e.target.value)}
                      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:border-sky-600 focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">— Nueva plantilla —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <label htmlFor="template-name" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                      Nombre de la plantilla
                    </label>
                    <input
                      id="template-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:border-sky-600 focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="Nombre de la plantilla"
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <label htmlFor="template-type" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                      Tipo
                    </label>
                    <select
                      id="template-type"
                      value={type}
                      onChange={(e) => setType(e.target.value as SpitchType)}
                      className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:border-sky-600 focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {SPITCH_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t === 'company' ? 'Empresa' : 'Paciente'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex min-h-11 items-center gap-3 self-end rounded-lg px-2 text-sm text-slate-700 focus-within:ring-2 focus-within:ring-sky-500 dark:text-slate-200">
                    <input
                      type="checkbox"
                      className="size-4 accent-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                      checked={isDefault}
                      onChange={(e) => setIsDefault(e.target.checked)}
                    />
                    Por defecto
                  </label>
                </div>
              </section>

              <section aria-labelledby="template-content-heading" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/60 sm:p-6">
                <h2 id="template-content-heading" className="text-lg font-semibold">Contenido del correo</h2>
                <p className="mt-1 mb-5 text-sm text-slate-600 dark:text-slate-300">Redacta el asunto y el mensaje usando las variables disponibles.</p>
                <div className="space-y-5">
                  <div>
                    <h3 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Asunto</h3>
                    {/* Subject (dnd drop target) */}
                    <SubjectDropZone>
                      <SubjectTokenInput
                        ref={subjectInputRef}
                        value={subject}
                        onChange={setSubject}
                        areaConfig={areaConfig}
                      />
                    </SubjectDropZone>
                  </div>

                  <section aria-labelledby="template-body-heading" className="min-w-0">
                    <h3 id="template-body-heading" className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Cuerpo del correo</h3>
                    {/* Body editor (dnd drop target) */}
                    <BodyDropZone className="min-h-[20rem] min-w-0 rounded-lg border border-slate-300 bg-white p-2 focus-within:ring-2 focus-within:ring-sky-500 dark:border-slate-600 dark:bg-slate-900">
                      {isClient ? (
                        <Suspense
                          fallback={
                            <div data-testid="editor-loading" className="p-4 text-sm text-slate-500 dark:text-slate-300">
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
                        <div data-testid="editor-loading" className="p-4 text-sm text-slate-500 dark:text-slate-300">
                          Cargando editor…
                        </div>
                      )}
                    </BodyDropZone>
                  </section>
                </div>
              </section>

              {/* Save + Preview buttons */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/60 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !name.trim() || !subject.trim()}
                    className="min-h-11 rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                  >
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTogglePreview}
                    aria-pressed={showPreview}
                    className="min-h-11 rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    {showPreview ? 'Ocultar previsualización' : 'Previsualizar'}
                  </button>
                </div>
                {!name.trim() || !subject.trim() ? (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Completa el nombre y el asunto para guardar.</p>
                ) : null}
                {saveMessage && (
                  <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
                    {saveMessage}
                  </p>
                )}
                {saveError && (
                  <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
                    {saveError}
                  </p>
                )}
              </div>

              {/* Preview iframe (sandboxed) */}
              {showPreview && (
                <section aria-labelledby="template-preview-heading" className="min-w-0 space-y-3">
                  <h2 id="template-preview-heading" className="text-lg font-semibold">Vista previa</h2>
                  <iframe
                    title="Vista previa del correo"
                    srcDoc={previewHtml}
                    sandbox=""
                    className="min-h-[24rem] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
                  />
                </section>
              )}
            </div>
          </div>
        </main>

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
