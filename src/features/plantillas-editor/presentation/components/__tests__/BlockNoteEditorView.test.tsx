import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  BlockNoteEditorView,
  type BlockNoteEditorViewHandle,
} from '../BlockNoteEditorView';
import { AREA_CONFIGS } from '../../../infrastructure/areaConfigRegistry';
import type { TokenAttrs } from '../../../domain/entities';

/**
 * Unit tests for `BlockNoteEditorView` — the BlockNote integration layer.
 *
 * This component ISOLATES `@blocknote/react` + `@blocknote/core` (the custom
 * `token` inline-content schema, the editor instance, the view) behind an
 * imperative handle so `TemplateEditor` can orchestrate save/load/insert
 * without importing BlockNote itself. `TemplateEditor` dynamically imports
 * this component with `ssr:false` to keep BlockNote out of the server bundle
 * (design Decision c / SSR boundary).
 *
 * BlockNote is mocked at the module boundary here (AGENTS.md: do NOT load
 * real BlockNote in unit tests — it is heavy and needs a real DOM). The mock
 * editor exposes the methods the imperative handle calls; the tests assert
 * the WIRING (which BlockNote method is invoked with what args), not
 * BlockNote's internal behavior (that is sdd-verify's job).
 */

// --- Mock @blocknote/core + @blocknote/react at the module boundary ---
const mockBlocksToHTMLLossy = vi.hoisted(() => vi.fn());
const mockTryParseHTMLToBlocks = vi.hoisted(() => vi.fn());
const mockInsertInlineContent = vi.hoisted(() => vi.fn());
const mockReplaceBlocks = vi.hoisted(() => vi.fn());
const mockUpdateBlock = vi.hoisted(() => vi.fn());
const mockFocus = vi.hoisted(() => vi.fn());

const mockEditor = {
  document: [] as unknown[],
  blocksToHTMLLossy: mockBlocksToHTMLLossy,
  tryParseHTMLToBlocks: mockTryParseHTMLToBlocks,
  insertInlineContent: mockInsertInlineContent,
  replaceBlocks: mockReplaceBlocks,
  updateBlock: mockUpdateBlock,
  focus: mockFocus,
  isEditable: true,
  getSelection: () => undefined,
  getTextCursorPosition: () => ({ block: { type: 'paragraph' } }),
  _tiptapEditor: {
    state: {
      selection: {
        $from: { depth: 0 },
      },
    },
  },
};

vi.mock('@blocknote/react', () => ({
  useCreateBlockNote: () => mockEditor,
  createReactInlineContentSpec: vi.fn(() => ({ config: {}, implementation: {} })),
  useBlockNoteEditor: () => mockEditor,
  useEditorState: ({ selector }: { selector: (state: { editor: unknown }) => unknown }) => selector({ editor: mockEditor }),
  useComponentsContext: () => ({
    FormattingToolbar: {
      Root: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
        <div data-testid="formatting-toolbar-root" className={className}>{children}</div>
      ),
      Button: ({ children, onClick, icon, label, mainTooltip, className }: {
        children?: React.ReactNode; onClick?: () => void; icon?: React.ReactNode;
        label?: string; mainTooltip?: string; className?: string;
      }) => (
        <button data-testid={`fmt-btn-${label}`} onClick={onClick} className={className} title={mainTooltip}>
          {icon}{children}
        </button>
      ),
    },
    Generic: {
      Menu: {
        Root: ({ children }: { children?: React.ReactNode }) => <div data-testid="menu-root">{children}</div>,
        Trigger: ({ children }: { children?: React.ReactNode }) => <div data-testid="menu-trigger">{children}</div>,
        Dropdown: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
          <div data-testid="menu-dropdown" className={className}>{children}</div>
        ),
        Item: ({ children, onClick, className }: {
          children?: React.ReactNode; onClick?: () => void; className?: string;
        }) => (
          <button data-testid="menu-item" onClick={onClick} className={className}>{children}</button>
        ),
      },
    },
  }),
  FormattingToolbarController: ({ formattingToolbar }: {
    formattingToolbar?: React.FC<{ blockTypeSelectItems?: unknown[] }>;
  }) => {
    const Comp = formattingToolbar;
    return Comp ? <Comp blockTypeSelectItems={[]} /> : <div data-testid="fmt-controller-mock" />;
  },
  getFormattingToolbarItems: vi.fn(() => []),
}));

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="blocknote-view-mock">{children}</div>
  ),
}));

vi.mock('@blocknote/core', () => ({
  BlockNoteSchema: { create: () => ({}) },
  defaultInlineContentSpecs: { text: { config: 'text', implementation: undefined }, link: { config: 'link', implementation: undefined } },
}));

import type { AreaConfig } from '../../../infrastructure/areaConfigRegistry';

const consolidados: AreaConfig = AREA_CONFIGS.get('consolidados')!;

function renderView(props: {
  areaConfig?: AreaConfig;
  onChange?: () => void;
  onTokenClick?: (attrs: TokenAttrs) => void;
} = {}) {
  const ref = React.createRef<BlockNoteEditorViewHandle>();
  render(
    <BlockNoteEditorView
      ref={ref}
      areaConfig={props.areaConfig ?? consolidados}
      onChange={props.onChange ?? vi.fn()}
      onTokenClick={props.onTokenClick ?? vi.fn()}
    />,
  );
  return { ref };
}

describe('BlockNoteEditorView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEditor.document = [{ id: 'b1', type: 'paragraph', content: [] }];
  });

  describe('imperative handle: getHtml (save serialization)', () => {
    it('pre-converts token nodes to text and hands the result to blocksToHTMLLossy', () => {
      // Document with a token inline content node — the pre-conversion
      // helper turns it into a text node carrying `{{empresa}}` BEFORE
      // serialization, so the broken `toExternalHTML` portal is bypassed.
      mockEditor.document = [
        {
          id: 'b-1',
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'token', props: { key: 'empresa', table: '', cols: '' } },
          ],
        },
      ];
      mockBlocksToHTMLLossy.mockReturnValue('<p>Hello {{empresa}}</p>');
      const { ref } = renderView();

      const html = ref.current?.getHtml();

      expect(mockBlocksToHTMLLossy).toHaveBeenCalledTimes(1);
      // The argument to blocksToHTMLLossy is NOT the original document —
      // it's the pre-converted version with the token node replaced by a
      // text node containing the placeholder.
      const callArg = mockBlocksToHTMLLossy.mock.calls[0]![0] as Array<{
        content: Array<Record<string, unknown>>;
      }>;
      const blockContent = callArg[0]!.content;
      // First node stays as text, second node is now text (was token).
      expect(blockContent).toHaveLength(2);
      expect(blockContent[0]!.type).toBe('text');
      expect((blockContent[0]! as { text: string }).text).toBe('Hello ');
      expect(blockContent[1]!.type).toBe('text');
      expect((blockContent[1]! as { text: string }).text).toBe('{{empresa}}');
      expect(html).toBe('<p>Hello {{empresa}}</p>');
    });

    it('leaves blocks with no inline content array untouched', () => {
      // Table blocks carry a `tableContent` OBJECT in `content`, not an
      // array. The helper must not try to walk it as an array.
      mockEditor.document = [
        {
          id: 'b-1',
          type: 'table',
          content: {
            type: 'tableContent',
            rows: [{ cells: [[{ type: 'text', text: 'cell' }]] }],
          },
        },
      ];
      mockBlocksToHTMLLossy.mockReturnValue('<table><tr><td>cell</td></tr></table>');
      const { ref } = renderView();

      const html = ref.current?.getHtml();

      // The pre-conversion passes the table block through unchanged; the
      // table serializer inside BlockNote handles it normally.
      const callArg = mockBlocksToHTMLLossy.mock.calls[0]![0] as unknown[];
      expect(callArg[0]).toBe(mockEditor.document[0]);
      expect(html).toBe('<table><tr><td>cell</td></tr></table>');
    });

    it('handles a table token inside a paragraph (converts to text with cols)', () => {
      mockEditor.document = [
        {
          id: 'b-1',
          type: 'paragraph',
          content: [
            {
              type: 'token',
              props: { key: 'tabla', table: 'examenes', cols: 'fecha,resultado' },
            },
          ],
        },
      ];
      mockBlocksToHTMLLossy.mockReturnValue('<p>{{tabla:examenes:fecha,resultado}}</p>');
      const { ref } = renderView();

      ref.current?.getHtml();

      const callArg = mockBlocksToHTMLLossy.mock.calls[0]![0] as Array<{
        content: Array<{ type: string; text?: string }>;
      }>;
      expect(callArg[0]!.content[0]!.type).toBe('text');
      expect(callArg[0]!.content[0]!.text).toBe('{{tabla:examenes:fecha,resultado}}');
    });
  });

  describe('imperative handle: loadHtml (parse + post-process + replace)', () => {
    it('parses HTML to blocks, post-processes token placeholders, and replaces the document', () => {
      // tryParseHTMLToBlocks returns blocks with {{token}} as plain text;
      // postProcessTokenBlocks (real, not mocked) splits them into token nodes.
      mockTryParseHTMLToBlocks.mockReturnValue([
        { id: 'b-new', type: 'paragraph', content: [{ type: 'text', text: 'Hola {{empresa}}' }] },
      ]);
      mockReplaceBlocks.mockReturnValue({ insertedBlocks: [], removedBlocks: [] });
      const { ref } = renderView();

      ref.current?.loadHtml('<p>Hola {{empresa}}</p>');

      expect(mockTryParseHTMLToBlocks).toHaveBeenCalledWith('<p>Hola {{empresa}}</p>');
      expect(mockReplaceBlocks).toHaveBeenCalledTimes(1);
      // replaceBlocks is called with (idsToRemove, blocksToInsert). The
      // inserted blocks are the post-processed blocks (with a token node).
      const [idsToRemove, blocksToInsert] = mockReplaceBlocks.mock.calls[0] as [
        unknown[],
        unknown[],
      ];
      expect(idsToRemove).toEqual(['b1']); // the existing block id
      // The post-processed block content includes a token node for {{empresa}}.
      const inserted = blocksToInsert as Array<{ content: Array<{ type: string }> }>;
      expect(inserted).toHaveLength(1);
      const types = inserted[0]!.content.map((c) => c.type);
      expect(types).toContain('token');
      expect(types).toContain('text');
    });
  });

  describe('imperative handle: insertToken (palette drop / column picker insert)', () => {
    it('inserts a simple token inline content at the cursor and focuses', () => {
      const { ref } = renderView();

      ref.current?.insertToken({ key: 'empresa' });

      expect(mockInsertInlineContent).toHaveBeenCalledTimes(1);
      const arg = mockInsertInlineContent.mock.calls[0]![0] as Array<{
        type: string;
        props: { key: string; table: string; cols: string };
      }>;
      expect(arg).toHaveLength(1);
      expect(arg[0]!.type).toBe('token');
      expect(arg[0]!.props).toEqual({ key: 'empresa', table: '', cols: '' });
      expect(mockFocus).toHaveBeenCalled();
    });

    it('inserts a table token with cols joined as a string', () => {
      const { ref } = renderView();

      ref.current?.insertToken({
        key: 'tabla',
        table: 'documentosVencidos',
        cols: ['fecha', 'monto'],
      });

      const arg = mockInsertInlineContent.mock.calls[0]![0] as Array<{
        props: { key: string; table: string; cols: string };
      }>;
      expect(arg).toHaveLength(1);
      expect(arg[0]!.props).toEqual({
        key: 'tabla',
        table: 'documentosVencidos',
        cols: 'fecha,monto',
      });
    });
  });

  describe('imperative handle: updateTableToken (edit existing chip in place)', () => {
    it('walks the document, finds the first matching table token, and updateBlock with new attrs', () => {
      // Document with two blocks; the first contains a table token chip.
      mockEditor.document = [
        {
          id: 'b-1',
          type: 'paragraph',
          content: [
            { type: 'token', props: { key: 'tabla', table: 'docs', cols: 'fecha' } },
          ],
        },
        { id: 'b-2', type: 'paragraph', content: [{ type: 'text', text: 'tail' }] },
      ];
      mockUpdateBlock.mockReturnValue({});
      const { ref } = renderView();

      ref.current?.updateTableToken(
        { table: 'docs' },
        { key: 'tabla', table: 'docs', cols: ['fecha', 'monto'] },
      );

      expect(mockUpdateBlock).toHaveBeenCalledTimes(1);
      const [blockId, update] = mockUpdateBlock.mock.calls[0] as [string, { content: unknown[] }];
      expect(blockId).toBe('b-1');
      const newContent = update.content as Array<{ type: string; props: { cols: string } }>;
      expect(newContent[0]!.type).toBe('token');
      expect(newContent[0]!.props.cols).toBe('fecha,monto');
    });

    it('does NOT call updateBlock when no matching token is found', () => {
      mockEditor.document = [
        { id: 'b-1', type: 'paragraph', content: [{ type: 'text', text: 'no tokens' }] },
      ];
      const { ref } = renderView();

      ref.current?.updateTableToken(
        { table: 'docs' },
        { key: 'tabla', table: 'docs', cols: ['fecha'] },
      );

      expect(mockUpdateBlock).not.toHaveBeenCalled();
    });
  });

  describe('rendering', () => {
    it('renders the BlockNote view', () => {
      renderView();
      expect(screen.getByTestId('blocknote-view-mock')).toBeInTheDocument();
    });
  });
});
