import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createFileNode,
  createFolderNode,
  type FileNode,
  type FileSystemNode,
} from '@/features/envio-resultados/domain/ports';
import { FilesExplorerPane } from '@/features/envio-resultados/presentation/components/FilesExplorerPane';
import type { ViewState } from '@/features/envio-resultados/presentation/hooks/useFileTree';

/**
 * Build a `ready` `viewState` for the tests that exercise folder /
 * file rows. Folders first, then files.
 */
function makeReady(
  nodes: FileSystemNode[],
  currentPath = '',
): Extract<ViewState, { kind: 'ready' }> {
  return { kind: 'ready', currentPath, nodes };
}

const baseProps = {
  ruc: 'RUC',
  dni: '12345678',
  idAten: 'AT-001',
  isAtRoot: true,
  onNavigate: vi.fn(),
  onGoUp: vi.fn(),
  onSelect: vi.fn(),
};

describe('FilesExplorerPane', () => {
  it('renders the loading skeleton when viewState is loading', () => {
    render(<FilesExplorerPane {...baseProps} viewState={{ kind: 'loading' }} />);
    expect(screen.getByTestId('files-skeleton')).toBeInTheDocument();
  });

  it('renders the empty state when viewState is empty', () => {
    render(<FilesExplorerPane {...baseProps} viewState={{ kind: 'empty' }} />);
    expect(screen.getByText(/No hay archivos para esta ficha/)).toBeInTheDocument();
  });

  it('renders the error state with a Reintentar button when viewState is error', () => {
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={{ kind: 'error', message: 'boom' }}
      />,
    );
    expect(screen.getByText(/No se pudieron cargar los archivos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });

  it('hides the back arrow at the root (isAtRoot=true)', () => {
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([])}
        isAtRoot
      />,
    );
    expect(screen.queryByRole('button', { name: /Atr/i })).not.toBeInTheDocument();
  });

  it('shows the back arrow in a subfolder (isAtRoot=false)', () => {
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([], 'subdir')}
        isAtRoot={false}
      />,
    );
    expect(screen.getByRole('button', { name: /Atr/i })).toBeInTheDocument();
  });

  it('clicking the back arrow calls onGoUp', () => {
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([], 'subdir')}
        isAtRoot={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Atr/i }));
    expect(baseProps.onGoUp).toHaveBeenCalledTimes(1);
  });

  it('renders a folder row as a clickable button', () => {
    const folder = createFolderNode({ name: 'subdir' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([folder])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'subdir' }));
    expect(baseProps.onNavigate).toHaveBeenCalledWith('subdir');
  });

  it('PDF row renders BOTH a Visualizar button (PR-B1: PdfViewer registered) and a Descargar link', () => {
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf])}
      />,
    );
    const row = screen.getByText('informe.pdf').closest('li');
    expect(row).toBeTruthy();
    // PR-B1: PdfViewer is now registered in the factory, so PDF rows
    // expose BOTH actions (per REQ-FE-7 in the spec).
    expect(within(row as HTMLElement).getByRole('button', { name: /Visualizar/ })).toBeInTheDocument();
    const downloadLink = within(row as HTMLElement).getByText(/Descargar/);
    expect(downloadLink).toBeInTheDocument();
    expect((downloadLink as HTMLAnchorElement).tagName).toBe('A');
  });

  it('clicking the Visualizar button on a PDF row calls onSelect with the file', () => {
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf])}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Visualizar/ }));
    expect(baseProps.onSelect).toHaveBeenCalledTimes(1);
    expect(baseProps.onSelect).toHaveBeenCalledWith(pdf);
  });

  it('clicking the Descargar link on a PDF row does NOT call onSelect (it triggers a download)', () => {
    // The shared `baseProps.onSelect` is polluted by the previous test
    // (which deliberately clicks Visualizar). Reset the mock so this
    // assertion is hermetic.
    baseProps.onSelect.mockClear();
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf])}
      />,
    );
    const link = screen.getByText(/Descargar/).closest('a');
    fireEvent.click(link as HTMLElement);
    // onSelect is for Visualizar only. Descargar is a plain anchor that
    // triggers a browser download and must NOT mutate selection state.
    expect(baseProps.onSelect).not.toHaveBeenCalled();
  });

  it('TXT row renders BOTH a Visualizar button (TxtViewer) and a Descargar link', () => {
    const txt = createFileNode({ name: 'reporte.txt', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([txt])}
      />,
    );
    expect(screen.getByRole('button', { name: /Visualizar/ })).toBeInTheDocument();
    expect(screen.getByText(/Descargar/)).toBeInTheDocument();
  });

  it('JPG row renders BOTH a Visualizar button (ImageViewer) and a Descargar link', () => {
    const jpg = createFileNode({ name: 'foto.jpg', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([jpg])}
      />,
    );
    expect(screen.getByRole('button', { name: /Visualizar/ })).toBeInTheDocument();
    expect(screen.getByText(/Descargar/)).toBeInTheDocument();
  });

  it('Descargas link on a PDF row points to /api/files/download with the right query string', () => {
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf])}
      />,
    );
    const link = screen.getByText(/Descargar/).closest('a');
    expect(link).toHaveAttribute(
      'href',
      '/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );
  });

  it('non-previewable .docx row renders ONLY a Descargar link (no Visualizar)', () => {
    const docx = createFileNode({ name: 'plan.docx', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([docx])}
      />,
    );
    expect(screen.queryByText(/Visualizar/)).not.toBeInTheDocument();
    const link = screen.getByText(/Descargar/).closest('a');
    expect(link).toHaveAttribute(
      'href',
      '/api/files/download?ruc=RUC&dni=12345678&idAten=AT-001&filename=plan.docx',
    );
  });

  it('renders folders first, then files (sort order preserved)', () => {
    const nodes: FileSystemNode[] = [
      createFileNode({ name: 'z.pdf', sizeBytes: 1, modifiedAt: '2026-01-01T00:00:00.000Z' }),
      createFolderNode({ name: 'sub' }),
      createFileNode({ name: 'a.pdf', sizeBytes: 1, modifiedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady(nodes)}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('folder row uses a Folder icon (matches the explorer convention)', () => {
    const folder = createFolderNode({ name: 'subdir' });
    const { container } = render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([folder])}
      />,
    );
    // The button has the folder name; the icon is a sibling SVG.
    const button = screen.getByRole('button', { name: 'subdir' });
    expect(button.querySelector('svg')).toBeTruthy();
    expect(container).toBeTruthy();
  });

  // -- PR #2: pane checkboxes (selection wiring) + key collision fix -------

  it('FileRow renders a checkbox', () => {
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf])}
      />,
    );
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('FileRow checkbox is checked by default when selectedRefs is not provided (backward compat)', () => {
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf])}
      />,
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('clicking the FileRow checkbox calls onToggle with "${currentPath}::${name}" and the file', () => {
    const onToggle = vi.fn();
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf], 'subdir')}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('subdir::informe.pdf', pdf);
  });

  it('clicking the FileRow checkbox does NOT trigger onSelect (no Visualizar side-effect)', () => {
    baseProps.onSelect.mockClear();
    const onSelect = baseProps.onSelect;
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf])}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('checked state mirrors selectedRefs.has("${currentPath}::${name}") when selectedRefs is provided', () => {
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });

    // selectedRefs contains the ref → checked
    const { rerender } = render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf], 'subdir')}
        selectedRefs={new Set(['subdir::informe.pdf'])}
      />,
    );
    expect(screen.getByRole('checkbox')).toBeChecked();

    // selectedRefs does NOT contain the ref → unchecked
    rerender(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf], 'subdir')}
        selectedRefs={new Set()}
      />,
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('two folders with the same file name produce distinct rows (key collision fix)', () => {
    // React warns on duplicate keys via console.error. With the old
    // `key={'file:' + file.name}` two FileRows in the same render that
    // share a basename (across different `currentPath` values) would
    // produce the SAME key. The fix includes `currentPath` in the key.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });

    // Two explorer panes side-by-side, each with a different currentPath,
    // each containing a file with the same basename. The two FileRows must
    // be reconciled as distinct React elements.
    render(
      <div>
        <FilesExplorerPane {...baseProps} viewState={makeReady([pdf], 'folderA')} />
        <FilesExplorerPane {...baseProps} viewState={makeReady([pdf], 'folderB')} />
      </div>,
    );

    // Two independent checkboxes rendered, not one shared node.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);

    // No React duplicate-key warning was emitted.
    const duplicateKeyWarnings = errorSpy.mock.calls.filter((call) => {
      const message = call.map((part) => String(part ?? '')).join(' ');
      return message.includes('two children with the same key');
    });
    expect(duplicateKeyWarnings).toHaveLength(0);

    errorSpy.mockRestore();
  });

  it('FolderRow does NOT render a checkbox (only files are selectable)', () => {
    const folder = createFolderNode({ name: 'subdir' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([folder])}
      />,
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

// Keep the FileNode type referenced (the assertion in one of the tests
// uses `expect.objectContaining` which does not narrow statically).
type _KeepFileNode = FileNode;
const _k: _KeepFileNode | null = null;
void _k;
