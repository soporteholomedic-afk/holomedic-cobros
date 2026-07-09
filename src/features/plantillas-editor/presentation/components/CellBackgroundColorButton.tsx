'use client';

import { useCallback } from 'react';
import {
  useComponentsContext,
  useBlockNoteEditor,
  useEditorState,
} from '@blocknote/react';

import { CELL_COLORS } from './tableCellColors';

const PAINT_BUCKET_ICON = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="currentColor"
  >
    <path d="M19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z" />
    <path d="M12.12 2.59l-8.59 8.59c-.78.78-.78 2.05 0 2.83l5.66 5.66c.78.78 2.05.78 2.83 0l8.59-8.59c.78-.78.78-2.05 0-2.83l-5.66-5.66c-.78-.78-2.05-.78-2.83 0zM13.54 4.41l6.36 6.36-8.59 8.59-6.36-6.36 2.12-2.12 2.83 2.83 1.41-1.41-2.83-2.83 1.41-1.41 2.83 2.83 1.41-1.41-2.83-2.83 1.41-1.41z" />
  </svg>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getCellDepthInfo(editor: any): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tableBlock: any;
  cellPos: number;
  currentColor: string;
} | null {
  const $pos = editor._tiptapEditor.state.selection.$from;

  let cellDepth = -1;
  let blockId = '';

  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeType = (node as any).type?.name as string | undefined;
    if ((nodeType === 'tableCell' || nodeType === 'tableHeader') && cellDepth === -1) {
      cellDepth = d;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((node as any).type?.isInGroup?.('bnBlock')) {
      blockId = node.attrs.id as string;
      break;
    }
  }

  if (!blockId || cellDepth < 0) return null;

  const tableBlock = editor.getBlock(blockId);
  if (!tableBlock || tableBlock.type !== 'table') return null;

  const cellPos = $pos.before(cellDepth);
  const cellNode = $pos.node(cellDepth);
  const currentColor = (cellNode.attrs.backgroundColor as string) || 'default';

  return { tableBlock, cellPos, currentColor };
}

export function CellBackgroundColorButton() {
  const Components = useComponentsContext()!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useBlockNoteEditor<any, any, any>();

  const cellInfo = useEditorState({
    editor,
    on: 'selection',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selector: (e: any) => {
      if (!e.editor?.isEditable) return undefined;
      return getCellDepthInfo(e.editor);
    },
  });

  const updateColor = useCallback((color: string) => {
    if (!cellInfo) return;

    const view = editor._tiptapEditor.view;
    const { tr } = view.state;
    const cellNode = tr.doc.nodeAt(cellInfo.cellPos);
    if (!cellNode) return;

    const newAttrs = { ...cellNode.attrs, backgroundColor: color };
    tr.setNodeMarkup(cellInfo.cellPos, undefined, newAttrs);
    view.dispatch(tr);
  }, [editor, cellInfo]);

  if (!cellInfo) return null;

  return (
    <Components.Generic.Menu.Root>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button"
          label="Color de celda"
          mainTooltip="Color de fondo de celda"
          icon={PAINT_BUCKET_ICON}
          onClick={() => {
            // Trigger handles the dropdown
          }}
        />
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="bn-formatting-toolbar-dropdown">
        {CELL_COLORS.map((c) => (
          <Components.Generic.Menu.Item
            key={c.value}
            className={cellInfo.currentColor === c.value ? 'bn-menu-item bn-menu-item-selected' : 'bn-menu-item'}
            onClick={() => updateColor(c.value)}
          >
            <span
              style={{
                display: 'inline-block',
                width: 20,
                height: 20,
                borderRadius: 4,
                backgroundColor: c.value === 'default' ? 'transparent' : c.value,
                border: '1px solid #ccc',
                marginRight: 8,
                verticalAlign: 'middle',
              }}
            />
            {c.name}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}
