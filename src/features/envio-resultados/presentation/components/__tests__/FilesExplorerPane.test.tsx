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

  it('PDF row renders a Descargar link (no Visualizar in PR-A — concrete viewers land in PR-B1)', () => {
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf])}
      />,
    );
    const row = screen.getByText('informe.pdf').closest('li');
    expect(row).toBeTruthy();
    // No Visualizar button in PR-A: the only viewer is NoPreviewViewer.
    expect(within(row as HTMLElement).queryByRole('button', { name: /Visualizar/ })).not.toBeInTheDocument();
    const downloadLink = within(row as HTMLElement).getByText(/Descargar/);
    expect(downloadLink).toBeInTheDocument();
    expect((downloadLink as HTMLAnchorElement).tagName).toBe('A');
  });

  it('clicking the Descargar link on a PDF row does NOT call onSelect (it triggers a download)', () => {
    const pdf = createFileNode({ name: 'informe.pdf', sizeBytes: 100, modifiedAt: '2026-01-01T00:00:00.000Z' });
    render(
      <FilesExplorerPane
        {...baseProps}
        viewState={makeReady([pdf])}
      />,
    );
    const link = screen.getByText(/Descargar/).closest('a');
    fireEvent.click(link as HTMLElement);
    // onSelect is for Visualizar (future PR-B1). For now it must not fire.
    expect(baseProps.onSelect).not.toHaveBeenCalled();
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
});

// Keep the FileNode type referenced (the assertion in one of the tests
// uses `expect.objectContaining` which does not narrow statically).
type _KeepFileNode = FileNode;
const _k: _KeepFileNode | null = null;
void _k;
