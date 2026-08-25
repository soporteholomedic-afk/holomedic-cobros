'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { BlockNoteSchema } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';

export interface EmailBodyEditorHandle {
  getHtml(): string;
  loadHtml(html: string): void;
  focus(): void;
}

interface EmailBodyEditorProps {
  initialHtml?: string;
  onChange?: (html: string) => void;
}

export const EmailBodyEditor = forwardRef<
  EmailBodyEditorHandle,
  EmailBodyEditorProps
>(function EmailBodyEditor({ initialHtml, onChange }, ref) {
  const schema = useMemo(() => BlockNoteSchema.create(), []);

  const editor = useCreateBlockNote({ schema });

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Load initial HTML on mount — key prop handles re-mount in the parent
  useEffect(() => {
    if (initialHtml) {
      const blocks = editor.tryParseHTMLToBlocks(initialHtml);
      if (blocks.length > 0) {
        editor.replaceBlocks(editor.document.map((b) => b.id), blocks);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount by design; the parent remounts via key when initialHtml changes
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getHtml() {
        return editor.blocksToHTMLLossy(
          editor.document as Parameters<
            typeof editor.blocksToHTMLLossy
          >[0],
        );
      },
      loadHtml(html: string) {
        if (!html.trim()) {
          editor.replaceBlocks(
            editor.document.map((b) => b.id),
            [],
          );
          return;
        }
        const blocks = editor.tryParseHTMLToBlocks(html);
        if (blocks.length > 0) {
          editor.replaceBlocks(
            editor.document.map((b) => b.id),
            blocks,
          );
        }
      },
      focus() {
        editor.focus();
      },
    }),
    [editor],
  );

  const handleChange = useCallback(() => {
    const html = editor.blocksToHTMLLossy(
      editor.document as Parameters<
        typeof editor.blocksToHTMLLossy
      >[0],
    );
    onChangeRef.current?.(html);
  }, [editor]);

  return (
    <div data-testid="email-body-editor" className="bn-container">
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme="light"
      />
    </div>
  );
});
