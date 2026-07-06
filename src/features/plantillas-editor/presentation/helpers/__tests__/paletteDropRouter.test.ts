import { describe, it, expect, vi } from 'vitest';

import { handlePaletteDragEnd } from '../paletteDropRouter';
import type { PaletteDragEndEvent } from '../paletteDropRouter';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Unit tests for `handlePaletteDragEnd` — the pure router that decides
 * where a palette chip drag goes (subject line vs body) and calls the right
 * imperative handle.
 *
 * Extracted from `TemplateEditor` so the dnd-kit `onDragEnd` wiring is
 * testable without simulating a real dnd-kit drag (jsdom does not model
 * pointer-based drag well). The handles are passed in; the event is a
 * structural shape, so no `@dnd-kit/core` import is needed here.
 *
 * Spec `email-template-editor` / "Drag token from palette into body" +
 * "Drop token into subject": a palette chip dropped on the body inserts at
 * the cursor; dropped on the subject appends a token segment.
 */
function makeEvent(
  attrs: TokenAttrs,
  overId: string | null,
): PaletteDragEndEvent {
  return {
    active: { data: { current: { type: 'token', attrs } } },
    over: overId === null ? null : { id: overId },
  };
}

function makeHandles() {
  const subjectInput = { appendToken: vi.fn() };
  const editorView = { insertToken: vi.fn(), focus: vi.fn() };
  return { subjectInput, editorView };
}

describe('handlePaletteDragEnd', () => {
  it('routes a drop on "body-drop" to editorView.insertToken + focus', () => {
    const { subjectInput, editorView } = makeHandles();
    const attrs: TokenAttrs = { key: 'empresa' };

    handlePaletteDragEnd(makeEvent(attrs, 'body-drop'), subjectInput, editorView);

    expect(editorView.insertToken).toHaveBeenCalledWith(attrs);
    expect(editorView.insertToken).toHaveBeenCalledTimes(1);
    expect(subjectInput.appendToken).not.toHaveBeenCalled();
  });

  it('routes a drop on "subject-drop" to subjectInput.appendToken', () => {
    const { subjectInput, editorView } = makeHandles();
    const attrs: TokenAttrs = { key: 'fecha' };

    handlePaletteDragEnd(makeEvent(attrs, 'subject-drop'), subjectInput, editorView);

    expect(subjectInput.appendToken).toHaveBeenCalledWith(attrs);
    expect(editorView.insertToken).not.toHaveBeenCalled();
  });

  it('does nothing when the drop is not over a known target (over is null)', () => {
    const { subjectInput, editorView } = makeHandles();
    handlePaletteDragEnd(makeEvent({ key: 'x' }, null), subjectInput, editorView);
    expect(subjectInput.appendToken).not.toHaveBeenCalled();
    expect(editorView.insertToken).not.toHaveBeenCalled();
  });

  it('does nothing when the drop target id is unknown', () => {
    const { subjectInput, editorView } = makeHandles();
    handlePaletteDragEnd(makeEvent({ key: 'x' }, 'somewhere-else'), subjectInput, editorView);
    expect(subjectInput.appendToken).not.toHaveBeenCalled();
    expect(editorView.insertToken).not.toHaveBeenCalled();
  });

  it('does nothing when active.data.current is null (no payload)', () => {
    const { subjectInput, editorView } = makeHandles();
    const event: PaletteDragEndEvent = {
      active: { data: { current: null } },
      over: { id: 'body-drop' },
    };
    handlePaletteDragEnd(event, subjectInput, editorView);
    expect(editorView.insertToken).not.toHaveBeenCalled();
  });

  it('does nothing when the payload has no attrs (malformed drag data)', () => {
    const { subjectInput, editorView } = makeHandles();
    const event: PaletteDragEndEvent = {
      active: { data: { current: { type: 'token' } } }, // no attrs
      over: { id: 'body-drop' },
    };
    handlePaletteDragEnd(event, subjectInput, editorView);
    expect(editorView.insertToken).not.toHaveBeenCalled();
  });

  it('routes a table token to the body with cols preserved', () => {
    const { subjectInput, editorView } = makeHandles();
    const attrs: TokenAttrs = {
      key: 'tabla',
      table: 'documentosVencidos',
      cols: ['fecha', 'monto'],
    };
    handlePaletteDragEnd(makeEvent(attrs, 'body-drop'), subjectInput, editorView);
    expect(editorView.insertToken).toHaveBeenCalledWith(attrs);
  });

  it('tolerates a null subjectInput handle (e.g. not yet mounted)', () => {
    const { editorView } = makeHandles();
    // Subject drop with no subjectInput handle — must not throw.
    expect(() =>
      handlePaletteDragEnd(makeEvent({ key: 'x' }, 'subject-drop'), null, editorView),
    ).not.toThrow();
    expect(editorView.insertToken).not.toHaveBeenCalled();
  });

  it('tolerates a null editorView handle (e.g. not yet mounted)', () => {
    const { subjectInput } = makeHandles();
    expect(() =>
      handlePaletteDragEnd(makeEvent({ key: 'x' }, 'body-drop'), subjectInput, null),
    ).not.toThrow();
    expect(subjectInput.appendToken).not.toHaveBeenCalled();
  });
});
