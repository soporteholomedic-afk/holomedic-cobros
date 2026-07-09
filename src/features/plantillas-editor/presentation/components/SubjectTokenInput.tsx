'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';

import type { AreaConfig } from '../../infrastructure/areaConfigRegistry';
import type { TokenAttrs } from '../../domain/entities';
import {
  splitIntoSegments,
  serializeSubject,
  type SubjectSegment,
} from '../helpers/splitIntoSegments';
import { resolveTokenLabel } from '../helpers/tokenLabel';
import { TokenChip } from './TokenChip';

/**
 * Imperative handle exposed by `SubjectTokenInput` so the parent editor
 * (which owns the `DndContext`) can route a palette drag-drop into the
 * subject line without lifting the segment state out of the component.
 */
export interface SubjectTokenInputHandle {
  /** Append a token segment at the end of the subject (design: "at the caret (or end)"). */
  appendToken(attrs: TokenAttrs): void;
}

export interface SubjectTokenInputProps {
  /** The current subject string with `{{token}}` placeholders. */
  value: string;
  /** Called with the new serialized subject whenever the user edits it. */
  onChange: (next: string) => void;
  /** The current area's config — used to resolve chip labels. */
  areaConfig: AreaConfig;
}

/**
 * A single-line chip-input for the email subject (design Decision d).
 *
 * The subject does NOT use a block editor — a single line doesn't need
 * block structure. Instead, `value` is parsed into `SubjectSegment[]` via
 * `splitIntoSegments`; text segments render inline and token segments
 * render as `TokenChip`s. A trailing text `<input>` is always present so
 * the user can keep typing; typing appends to the tail text segment, and
 * Backspace on an empty tail deletes the preceding segment (chip or text).
 *
 * Drag-drop from the palette is routed by the parent: when the editor's
 * `onDragEnd` detects a drop on the subject, it calls `appendToken(attrs)`
 * on the imperative handle, which appends a token segment and fires
 * `onChange` with the re-serialized subject.
 *
 * v1 limitation (design-permitted "or end"): tokens are appended at the
 * end, not at an arbitrary caret position. Editing text in the middle of
 * already-typed segments is not supported — the subject is built
 * left-to-right (type, drop chip, type, drop chip, type). This keeps the
 * component simple without a contentEditable.
 */
export const SubjectTokenInput = forwardRef<
  SubjectTokenInputHandle,
  SubjectTokenInputProps
>(function SubjectTokenInput({ value, onChange, areaConfig }, ref) {
  // Keep the latest value in a ref so the imperative `appendToken` sees
  // the current subject without restating the deps (avoids stale closures).
  const valueRef = useRef(value);
  valueRef.current = value;

  const segments = useMemo<SubjectSegment[]>(() => {
    const parsed = splitIntoSegments(value);
    // Guarantee a trailing text segment so there is always an editable tail.
    if (parsed.length === 0 || parsed[parsed.length - 1]!.type !== 'text') {
      return [...parsed, { type: 'text', value: '' }];
    }
    return parsed;
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      appendToken(attrs: TokenAttrs) {
        const current = splitIntoSegments(valueRef.current);
        current.push({ type: 'token', attrs });
        onChange(serializeSubject(current));
      },
    }),
    [onChange],
  );

  function handleTailChange(nextTail: string) {
    // Replace the last text segment with the new tail value.
    const updated: SubjectSegment[] = segments.map((seg, i) =>
      i === segments.length - 1 ? { type: 'text', value: nextTail } : seg,
    );
    onChange(serializeSubject(updated));
  }

  function handleTailKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Backspace') return;
    const tail = segments[segments.length - 1];
    const tailValue = tail?.type === 'text' ? tail.value : '';
    // Only intercept Backspace when the tail is empty — native deletion
    // handles non-empty tails (a char is removed, firing onChange).
    if (tailValue.length > 0) return;
    // Nothing to delete if the tail is the only segment.
    if (segments.length <= 1) return;
    e.preventDefault();
    // Drop the segment just before the tail (the last chip or text).
    const trimmed = segments.slice(0, -2);
    trimmed.push({ type: 'text', value: '' });
    onChange(serializeSubject(trimmed));
  }

  return (
    <div
      role="group"
      aria-label="Asunto"
      className="flex flex-wrap items-center gap-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200 dark:focus-within:ring-sky-900 outline-none transition-colors min-h-[2.5rem]"
    >
      {segments.map((seg, i) => {
        const isTail = i === segments.length - 1;
        if (seg.type === 'token') {
          return (
            <TokenChip
              key={`tok-${i}`}
              label={resolveTokenLabel(seg.attrs, areaConfig)}
              attrs={seg.attrs}
            />
          );
        }
        if (isTail) {
          return (
            <input
              key="tail"
              type="text"
              aria-label="Texto del asunto"
              value={seg.value}
              onChange={(e) => handleTailChange(e.target.value)}
              onKeyDown={handleTailKeyDown}
              className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100"
              placeholder="Asunto del correo…"
            />
          );
        }
        return (
          <span
            key={`txt-${i}`}
            className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre"
          >
            {seg.value}
          </span>
        );
      })}
    </div>
  );
});
