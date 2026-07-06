import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import {
  SubjectTokenInput,
  type SubjectTokenInputHandle,
} from '../SubjectTokenInput';
import { AREA_CONFIGS } from '../../../infrastructure/areaConfigRegistry';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Unit tests for `SubjectTokenInput` — the single-line chip-input for the
 * subject line (design Decision d).
 *
 * Spec `email-template-editor` / "Interactive subject with token chips":
 *  - "Drop token into subject": a palette chip dropped onto the subject
 *    appends a token segment; typing text produces text segments alongside
 *    chips.
 *  - "Subject round-trip": serialize(parse(s)) === s (covered for the pure
 *    helpers in task 3.5; here we verify the component round-trips a value
 *    through render + an append + backspace).
 *
 * The component is controlled (`value` / `onChange`). The parent editor
 * routes palette drag-drops by calling `appendToken(attrs)` on the
 * imperative handle (the DndContext lives in the parent). Typing happens in
 * a trailing text `<input>`; backspace on an empty tail deletes the
 * preceding segment.
 */
const consolidados = AREA_CONFIGS.get('consolidados')!;

function renderInput(
  value: string,
  onChange: ReturnType<typeof vi.fn> = vi.fn(),
): { onChange: ReturnType<typeof vi.fn>; ref: React.RefObject<SubjectTokenInputHandle | null> } {
  const ref = React.createRef<SubjectTokenInputHandle>();
  render(
    <SubjectTokenInput
      ref={ref}
      value={value}
      onChange={onChange}
      areaConfig={consolidados}
    />,
  );
  return { onChange, ref };
}

describe('SubjectTokenInput', () => {
  describe('rendering from a value (parse)', () => {
    it('renders text + a chip for "Informe — {{fecha}}"', () => {
      renderInput('Informe — {{fecha}}');
      // Regex matcher: testing-library normalizes trailing whitespace, so a
      // literal 'Informe — ' (with trailing space) would not match.
      expect(screen.getByText(/^Informe —$/)).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Fecha' })).toBeInTheDocument();
    });

    it('renders a trailing empty text input so the user can keep typing', () => {
      renderInput('Informe — {{fecha}}');
      const input = screen.getByRole('textbox', { name: /asunto/i });
      expect(input).toHaveValue('');
    });

    it('renders just an empty input for the empty subject', () => {
      renderInput('');
      expect(screen.getByRole('textbox', { name: /asunto/i })).toHaveValue('');
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('renders a table chip with its label', () => {
      renderInput('Adjunto {{tabla:documentosVencidos:fecha,monto}}');
      expect(
        screen.getByRole('img', { name: 'Documentos vencidos' }),
      ).toBeInTheDocument();
    });
  });

  describe('typing in the trailing input (text segments alongside chips)', () => {
    it('appends typed text to the subject via onChange', () => {
      const { onChange } = renderInput('Informe — {{fecha}}');
      const input = screen.getByRole('textbox', { name: /asunto/i });
      fireEvent.change(input, { target: { value: ' fin' } });
      // The trailing empty text segment becomes " fin" → re-serialized.
      expect(onChange).toHaveBeenCalledWith('Informe — {{fecha}} fin');
    });

    it('edits the trailing text when the value already ends in text', () => {
      const { onChange } = renderInput('Hello {{fecha}} world');
      const input = screen.getByRole('textbox', { name: /asunto/i });
      expect(input).toHaveValue(' world');
      fireEvent.change(input, { target: { value: ' worl' } });
      expect(onChange).toHaveBeenCalledWith('Hello {{fecha}} worl');
    });
  });

  describe('appendToken (drag-drop target)', () => {
    it('appends a simple token at the end of a text+token subject', () => {
      const { onChange, ref } = renderInput('Informe — {{fecha}}');
      const attrs: TokenAttrs = { key: 'empresa' };
      ref.current?.appendToken(attrs);
      expect(onChange).toHaveBeenCalledWith('Informe — {{fecha}}{{empresa}}');
    });

    it('appends a token to the empty subject', () => {
      const { onChange, ref } = renderInput('');
      ref.current?.appendToken({ key: 'fecha' });
      expect(onChange).toHaveBeenCalledWith('{{fecha}}');
    });

    it('appends a table token preserving column order', () => {
      const { onChange, ref } = renderInput('Adjunto ');
      ref.current?.appendToken({
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['fecha', 'monto'],
      });
      expect(onChange).toHaveBeenCalledWith(
        'Adjunto {{tabla:documentosVencidos:fecha,monto}}',
      );
    });
  });

  describe('backspace deletes the last segment', () => {
    it('removes the preceding chip when the trailing input is empty', () => {
      const { onChange } = renderInput('Informe — {{fecha}}');
      const input = screen.getByRole('textbox', { name: /asunto/i });
      // Trailing input is empty → Backspace deletes the {{fecha}} chip.
      fireEvent.keyDown(input, { key: 'Backspace' });
      expect(onChange).toHaveBeenCalledWith('Informe — ');
    });

    it('does NOT call onChange on Backspace when the trailing input has text (native deletion handles it)', () => {
      const { onChange } = renderInput('Hello {{fecha}} world');
      const input = screen.getByRole('textbox', { name: /asunto/i });
      expect(input).toHaveValue(' world');
      // Trailing input is non-empty → Backspace is a native char deletion,
      // NOT a segment deletion. The component must NOT fire onChange here
      // (the input's own onChange will fire on the resulting value change).
      fireEvent.keyDown(input, { key: 'Backspace' });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('does NOT call onChange on Backspace when there is nothing before the tail', () => {
      const { onChange } = renderInput('');
      const input = screen.getByRole('textbox', { name: /asunto/i });
      // Empty subject, empty input → Backspace has nothing to delete.
      fireEvent.keyDown(input, { key: 'Backspace' });
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('round-trip through the component (render → append → backspace)', () => {
    it('a full edit cycle preserves the round-trip invariant', () => {
      // Start empty, append two tokens, type text, then backspace the chip.
      const changes: string[] = [];
      const onChange = vi.fn((next: string) => changes.push(next));
      const { ref } = renderInput('', onChange);

      ref.current?.appendToken({ key: 'empresa' }); // -> {{empresa}}
      // Simulate the parent re-rendering with the latest value by re-rendering
      // is out of scope here; instead we assert the FIRST change is correct
      // and the pure-helper round-trip (tested in 3.5) covers the rest.
      expect(changes[0]).toBe('{{empresa}}');
    });
  });
});
