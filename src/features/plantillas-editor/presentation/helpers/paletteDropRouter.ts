import type { TokenAttrs } from '../../domain/entities';

/**
 * Structural shape of a dnd-kit `DragEndEvent` — only the fields
 * `handlePaletteDragEnd` reads. Declared locally so this helper is pure and
 * testable without importing `@dnd-kit/core` (the real `DragEndEvent` is
 * structurally compatible).
 */
export interface PaletteDragEndEvent {
  active: {
    data: {
      current?: { type?: string; attrs?: TokenAttrs } | null;
    };
  };
  over: { id: string | number } | null;
}

/** The minimal imperative surface `handlePaletteDragEnd` calls into. */
export interface SubjectDropTarget {
  appendToken(attrs: TokenAttrs): void;
}
export interface BodyDropTarget {
  insertToken(attrs: TokenAttrs): void;
  focus(): void;
}

/** Drop-zone ids used by `TemplateEditor`'s `useDroppable` calls. */
export const SUBJECT_DROP_ID = 'subject-drop';
export const BODY_DROP_ID = 'body-drop';

/**
 * Route a palette chip drag-drop to the right target.
 *
 * - Dropped on `body-drop` → `editorView.insertToken(attrs)` + `focus()`
 *   (inserts at the BlockNote cursor).
 * - Dropped on `subject-drop` → `subjectInput.appendToken(attrs)` (appends
 *   a token segment at the end of the subject).
 * - Dropped elsewhere / no payload / null handles → no-op (never throws).
 *
 * Pure: takes the event + two (possibly null) handles, calls at most one
 * method. Extracted from `TemplateEditor` so the dnd-kit `onDragEnd` wiring
 * is testable without simulating a real pointer drag (jsdom does not model
 * dnd-kit drags well).
 */
export function handlePaletteDragEnd(
  event: PaletteDragEndEvent,
  subjectInput: SubjectDropTarget | null,
  editorView: BodyDropTarget | null,
): void {
  const payload = event.active.data.current;
  const attrs = payload?.attrs;
  if (!attrs) return;
  const overId = event.over?.id;
  if (overId === SUBJECT_DROP_ID) {
    subjectInput?.appendToken(attrs);
    return;
  }
  if (overId === BODY_DROP_ID) {
    editorView?.insertToken(attrs);
    editorView?.focus();
    return;
  }
  // Unknown target — no-op.
}
