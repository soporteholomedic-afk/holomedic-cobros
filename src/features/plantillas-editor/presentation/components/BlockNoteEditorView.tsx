'use client';

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type FC,
  type JSX,
} from 'react';
import {
  BlockNoteSchema,
  defaultInlineContentSpecs,
} from '@blocknote/core';
import {
  createReactInlineContentSpec,
  useCreateBlockNote,
  FormattingToolbarController,
  getFormattingToolbarItems,
  useComponentsContext,
  type FormattingToolbarProps,
} from '@blocknote/react';
import { BlockNoteView, type Theme } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';

import { CellBackgroundColorButton } from './CellBackgroundColorButton';
import { buildTableCellColorCSS } from './tableCellColors';

const BLOCKNOTE_THEME: { light: Theme; dark: Theme } = {
  light: {
    borderRadius: 8,
    colors: {
      editor: { text: '#0f172a', background: '#ffffff' },
      menu: { text: '#0f172a', background: '#ffffff' },
      tooltip: { text: '#f8fafc', background: '#0f172a' },
      hovered: { text: '#0f172a', background: '#f1f5f9' },
      selected: { text: '#0f172a', background: '#e0f2fe' },
      disabled: { text: '#64748b', background: '#f8fafc' },
      border: '#cbd5e1',
      shadow: 'rgba(15, 23, 42, 0.12)',
      sideMenu: '#475569',
    },
  },
  dark: {
    borderRadius: 8,
    colors: {
      editor: { text: '#f1f5f9', background: '#0f172a' },
      menu: { text: '#f1f5f9', background: '#1e293b' },
      tooltip: { text: '#0f172a', background: '#e2e8f0' },
      hovered: { text: '#f1f5f9', background: '#334155' },
      selected: { text: '#f1f5f9', background: '#075985' },
      disabled: { text: '#94a3b8', background: '#1e293b' },
      border: '#475569',
      shadow: 'rgba(2, 6, 23, 0.45)',
      sideMenu: '#cbd5e1',
    },
  },
};

/**
 * Custom formatting toolbar that extends the default items with the cell
 * background color button. Rendered INSIDE `BlockNoteView` (where the
 * Mantine `ComponentsContext` is available), so `useComponentsContext`
 * is safe here.
 */
function FormattingToolbarWithCellColor(props: FormattingToolbarProps) {
  const Components = useComponentsContext()!;
  return (
    <Components.FormattingToolbar.Root
      className="bn-toolbar bn-formatting-toolbar"
    >
      {getFormattingToolbarItems(props.blockTypeSelectItems)}
      <CellBackgroundColorButton />
    </Components.FormattingToolbar.Root>
  );
}

import type { AreaConfig } from '../../infrastructure/areaConfigRegistry';
import type { TokenAttrs } from '../../domain/entities';
import { encodeToken } from '../helpers/tokenSerializer';
import { resolveTokenLabel } from '../helpers/tokenLabel';
import { postProcessTokenBlocks } from '../helpers/postProcessTokenBlocks';
import { documentWithTokensAsText } from '../helpers/documentWithTokensAsText';
import { TokenChip } from './TokenChip';

/**
 * Imperative handle `TemplateEditor` uses to orchestrate the BlockNote editor
 * without importing `@blocknote/react` itself. Keeps BlockNote isolated behind
 * this dynamically-imported (ssr:false) component.
 */
export interface BlockNoteEditorViewHandle {
  /** Serialize the current document to HTML with `{{token}}` placeholders. */
  getHtml(): string;
  /** Parse HTML → blocks → post-process `{{token}}` text → replace the document. */
  loadHtml(html: string): void;
  /** Insert a token chip at the current cursor position (palette drop / picker insert). */
  insertToken(attrs: TokenAttrs): void;
  /** Update the FIRST table token matching `target` in place (edit-in-place). */
  updateTableToken(target: { table: string }, newAttrs: TokenAttrs): void;
  /** Focus the editor. */
  focus(): void;
}

export interface BlockNoteEditorViewProps {
  areaConfig: AreaConfig;
  /** Fired when the editor content changes (so the parent can track dirty state). */
  onChange?: () => void;
  /** Fired when the user clicks a token chip already in the body (edit-in-place). */
  onTokenClick?: (attrs: TokenAttrs) => void;
}

/**
 * BlockNote integration layer — isolates `@blocknote/react` + `@blocknote/core`
 * behind an imperative handle so `TemplateEditor` can orchestrate save/load/
 * insert without importing BlockNote. `TemplateEditor` dynamically imports
 * this component with `ssr:false` (design Decision c / SSR boundary) so
 * BlockNote + ProseMirror never run on the server.
 *
 * Custom `token` inline content (design Decision c):
 *  - `propSchema`: `key`/`table`/`cols` are STRINGS (BlockNote PropSchema only
 *    accepts boolean/number/string). `cols` is comma-joined; the renderer and
 *    serializer split it back into an array at the boundary.
 *  - `render`: a `TokenChip` with the label resolved from `areaConfig`.
 *  - `toExternalHTML`: a fragment rendering `encodeToken(attrs)` as bare text.
 *
 * `getHtml` pre-converts every `token` inline content node to a plain text
 * node containing the `{{token}}` placeholder BEFORE handing the document
 * to `editor.blocksToHTMLLossy`. The reason is that BlockNote's
 * `toExternalHTML` path for custom inline content goes through a React
 * portal that silently renders an empty `<span></span>` in our setup
 * ("ReactInlineContentSpec: renderHTML() failed" in the browser console);
 * the saved HTML would then lack the `{{token}}` text and the interpolate
 * pipeline would have nothing to resolve. By substituting the token node
 * with a text node ahead of export, the standard text serializer is used
 * (which is stable and matches the behaviour of typing `{{token}}` by
 * hand). Tables, lists, headings and every other block type continue to
 * go through BlockNote's own serializers untouched.
 *
 * Storage format (`{{token}}`) is independent of BlockNote internals: if
 * BlockNote is replaced, only this component's schema + serialization change.
 */
export const BlockNoteEditorView = forwardRef<
  BlockNoteEditorViewHandle,
  BlockNoteEditorViewProps
>(function BlockNoteEditorView({ areaConfig, onChange, onTokenClick }, ref) {
  // Keep the latest onTokenClick in a ref so the (memoized-once) token spec
  // always invokes the latest handler without forcing an editor re-create.
  // The ref is updated in a layout effect so we never assign to `.current`
  // during render (`react-hooks/refs`).
  //
  // We do NOT keep `areaConfig` in a ref: the schema's `render` callback
  // needs the LATEST `areaConfig` to resolve the `TokenChip` label, and
  // reading a ref during render is the same anti-pattern the lint rule
  // forbids. Instead, the schema's `useMemo` depends on `areaConfig` — the
  // editor is re-created when the area changes, which is acceptable (the
  // area is stable for the editor's lifetime; the route only renders one
  // area at a time).
  const onTokenClickRef = useRef(onTokenClick);
  useLayoutEffect(() => {
    onTokenClickRef.current = onTokenClick;
  });

  const schema = useMemo(() => {
    const tokenSpec = createReactInlineContentSpec(
      {
        type: 'token',
        content: 'none',
        propSchema: {
          key: { default: '' },
          table: { default: '' },
          cols: { default: '' },
        },
      },
      {
        render: ({ inlineContent }) => {
          const props = (inlineContent as { props: { key: string; table: string; cols: string } }).props;
          const attrs: TokenAttrs = {
            key: props.key,
            ...(props.table ? { table: props.table } : {}),
            ...(props.cols ? { cols: props.cols.split(',') } : {}),
          };
          return (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onTokenClickRef.current?.(attrs);
              }}
            >
              <TokenChip label={resolveTokenLabel(attrs, areaConfig)} attrs={attrs} />
            </span>
          ) as unknown as JSX.Element;
        },
        toExternalHTML: ({ inlineContent }) => {
          const props = (inlineContent as { props: { key: string; table: string; cols: string } }).props;
          const attrs: TokenAttrs = {
            key: props.key,
            ...(props.table ? { table: props.table } : {}),
            ...(props.cols ? { cols: props.cols.split(',') } : {}),
          };
          // Bare text via a fragment — no wrapper span — so the stored HTML
          // has `{{token}}` as plain inline text (the Mustache format).
          return <>{encodeToken(attrs)}</> as unknown as JSX.Element;
        },
      },
    );
    return BlockNoteSchema.create({
      inlineContentSpecs: {
        ...defaultInlineContentSpecs,
        token: tokenSpec,
      },
    });
  }, [areaConfig]);

  const editor = useCreateBlockNote({ schema });

  useImperativeHandle(
    ref,
    () => ({
      getHtml() {
        return editor.blocksToHTMLLossy(
          documentWithTokensAsText(
            editor.document as unknown as Parameters<typeof documentWithTokensAsText>[0],
          ) as unknown as Parameters<typeof editor.blocksToHTMLLossy>[0],
        );
      },
      loadHtml(html: string) {
        const parsed = editor.tryParseHTMLToBlocks(html);
        const processed = postProcessTokenBlocks(parsed as unknown as Parameters<typeof postProcessTokenBlocks>[0]);
        const currentIds = editor.document.map((b) => b.id);
        editor.replaceBlocks(currentIds, processed as unknown as Parameters<typeof editor.replaceBlocks>[1]);
      },
      insertToken(attrs: TokenAttrs) {
        editor.insertInlineContent([{
          type: 'token',
          props: {
            key: attrs.key,
            table: attrs.table ?? '',
            cols: (attrs.cols ?? []).join(','),
          },
        }] as unknown as Parameters<typeof editor.insertInlineContent>[0]);
        editor.focus();
      },
      updateTableToken(target: { table: string }, newAttrs: TokenAttrs) {
        for (const block of editor.document) {
          const content = (block as { content?: Array<{ type: string; props?: { key?: string; table?: string; cols?: string } }> }).content;
          // BlockNote v0.51 blocks with `content: "table"` tag (e.g. the
          // default `table` block) hold a `TableContent` OBJECT in
          // `block.content`, not an array. Calling `findIndex` on that
          // object would throw. We only look for tokens in blocks whose
          // `content` is an array of inline content.
          if (!Array.isArray(content)) continue;
          const idx = content.findIndex(
            (c) =>
              c.type === 'token' &&
              c.props?.key === 'tabla' &&
              c.props?.table === target.table,
          );
          if (idx >= 0) {
            const newContent = content.map((c, i) =>
              i === idx
                ? {
                    ...c,
                    props: {
                      key: newAttrs.key,
                      table: newAttrs.table ?? '',
                      cols: (newAttrs.cols ?? []).join(','),
                    },
                  }
                : c,
            );
            editor.updateBlock(block.id, { content: newContent } as unknown as Parameters<typeof editor.updateBlock>[1]);
            return;
          }
        }
        // No matching token — no-op (the caller may surface a message).
      },
      focus() {
        editor.focus();
      },
    }),
    [editor],
  );

  return (
    <div data-testid="blocknote-editor" className="bn-container min-w-0 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <style>{buildTableCellColorCSS()}</style>
      <BlockNoteView
        editor={editor}
        onChange={onChange}
        theme={BLOCKNOTE_THEME}
        formattingToolbar={false}
      >
        <FormattingToolbarController
          formattingToolbar={FormattingToolbarWithCellColor}
        />
      </BlockNoteView>
    </div>
  );
});

// Silence the unused-import lint for the FC type (kept for clarity).
void (0 as unknown as FC);
