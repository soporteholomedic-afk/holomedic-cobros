import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import {
  createFileNode,
  createFolderNode,
  type FileNode,
  type FileSystemNode,
} from '@/features/envio-resultados/domain/ports';
import type { UseFileTreeReturn, ViewState } from '@/features/envio-resultados/presentation/hooks/useFileTree';
import type {
  FileViewer,
  PreviewArgs,
} from '@/features/envio-resultados/presentation/viewers/FileViewer';

/**
 * Stub the `useFileTree` hook so each test controls its return value
 * without ever issuing a real network request.
 */
const mockUseFileTree = vi.fn<() => UseFileTreeReturn>();

vi.mock('@/features/envio-resultados/presentation/hooks/useFileTree', () => ({
  useFileTree: () => mockUseFileTree(),
}));

beforeEach(() => {
  mockUseFileTree.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleFiles: FileNode[] = [
  createFileNode({ name: 'informe.pdf', sizeBytes: 4096, modifiedAt: '2026-06-01T00:00:00.000Z' }),
  createFileNode({ name: 'foto.jpg', sizeBytes: 524288, modifiedAt: '2026-06-02T00:00:00.000Z' }),
];

const readyView = (currentPath: string, nodes: FileSystemNode[]): ViewState => ({
  kind: 'ready',
  currentPath,
  nodes,
});

describe('FilesModal', () => {
  it('renders the loading skeleton while the listing is being fetched', () => {
    mockUseFileTree.mockReturnValue({
      viewState: { kind: 'loading' },
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Juan Pérez/)).toBeInTheDocument();
    expect(screen.queryByText('informe.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay archivos/)).not.toBeInTheDocument();
    expect(screen.getByTestId('files-skeleton')).toBeInTheDocument();
  });

  it('renders the empty state when the listing is empty', () => {
    mockUseFileTree.mockReturnValue({
      viewState: { kind: 'empty' },
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/No hay archivos para esta ficha/)).toBeInTheDocument();
    const downloadAll = screen.getByRole('link', { name: /Descargar todos/ });
    expect(downloadAll).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders the error state with a Reintentar button', () => {
    mockUseFileTree.mockReturnValue({
      viewState: { kind: 'error', message: 'boom' },
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/No se pudieron cargar los archivos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });

  it('renders one row per file with the correct download href', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={vi.fn()}
      />,
    );

    const informeRow = screen.getByText('informe.pdf').closest('li');
    expect(informeRow).toBeTruthy();
    const informeLink = informeRow!.querySelector('a');
    expect(informeLink).toHaveAttribute(
      'href',
      '/api/files/download?ruc=RUC-1&dni=12345678&idAten=AT-001&filename=informe.pdf',
    );

    const fotoRow = screen.getByText('foto.jpg').closest('li');
    expect(fotoRow).toBeTruthy();
    const fotoLink = fotoRow!.querySelector('a');
    expect(fotoLink).toHaveAttribute(
      'href',
      '/api/files/download?ruc=RUC-1&dni=12345678&idAten=AT-001&filename=foto.jpg',
    );
  });

  it('renders the bulk-download link with the sanitized zip filename query string', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={vi.fn()}
      />,
    );

    const downloadAll = screen.getByRole('link', { name: /Descargar todos/ });
    const href = downloadAll.getAttribute('href') ?? '';
    expect(href.startsWith('/api/files/download-all?')).toBe(true);
    expect(href).toContain('ruc=RUC-1');
    expect(href).toContain('dni=12345678');
    expect(href).toContain('idAten=AT-001');
    expect(href).toContain('nombrePaciente=Juan');
    expect(href).toContain('empresa=Acme');
  });

  it('shows the back arrow in a subfolder and calls onGoUp when clicked', () => {
    const goUp = vi.fn();
    mockUseFileTree.mockReturnValue({
      viewState: readyView('subdir', [createFolderNode({ name: 'inner' })]),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp,
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={vi.fn()}
      />,
    );

    const back = screen.getByRole('button', { name: /Atr/i });
    fireEvent.click(back);
    expect(goUp).toHaveBeenCalledTimes(1);
  });

  it('hides the back arrow at the root', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Atr/i })).not.toBeInTheDocument();
  });

  it('closes the modal when the X button is clicked', () => {
    const onClose = vi.fn();
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar modal' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the modal when the Escape key is pressed', () => {
    const onClose = vi.fn();
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the modal when the backdrop is clicked', () => {
    const onClose = vi.fn();
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={onClose}
      />,
    );

    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('navigate() is called when a folder row is clicked (delegate to explorer pane)', () => {
    const navigate = vi.fn();
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', [createFolderNode({ name: 'subdir' })]),
      selectionState: { kind: 'none' },
      navigate,
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'subdir' }));
    expect(navigate).toHaveBeenCalledWith('subdir');
  });

  // ─── PR-B2 — master-detail layout + maximize toggle ──────────────

  it('renders both the explorer pane and the preview pane (master-detail layout)', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={vi.fn()}
      />,
    );

    // The explorer pane exposes the file list.
    expect(screen.getByText('informe.pdf')).toBeInTheDocument();
    // The preview pane exposes its placeholder.
    expect(
      screen.getByText(/Selecciona un archivo para previsualizarlo/),
    ).toBeInTheDocument();
    // At least one maximize toggle exists (header + preview pane).
    expect(screen.getAllByRole('button', { name: 'Maximizar' }).length).toBeGreaterThan(0);
  });

  it('clicking the header maximize toggle hides the explorer pane and shows a full-width preview', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={vi.fn()}
      />,
    );

    // Click the header's maximize toggle (the one in the header container
    // is identified by being a direct child of the header div). We
    // simply click the FIRST one (header comes first in document order).
    const headerToggles = screen.getAllByRole('button', { name: 'Maximizar' });
    fireEvent.click(headerToggles[0]!);

    // The explorer pane container has the 'hidden' class.
    const explorerContainer = container.querySelector('[data-testid="files-explorer-container"]');
    expect(explorerContainer).toBeTruthy();
    expect(explorerContainer!.className).toContain('hidden');
    // All toggles now show "Minimizar".
    expect(screen.queryByRole('button', { name: 'Maximizar' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Minimizar' }).length).toBeGreaterThan(0);
  });

  it('clicking minimize after maximize restores the explorer pane', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={vi.fn()}
      />,
    );

    // Maximize then minimize.
    const headerToggles = screen.getAllByRole('button', { name: 'Maximizar' });
    fireEvent.click(headerToggles[0]!);
    const headerMinimize = screen.getAllByRole('button', { name: 'Minimizar' });
    fireEvent.click(headerMinimize[0]!);

    // The explorer's container is no longer hidden.
    const explorerContainer = container.querySelector('[data-testid="files-explorer-container"]');
    expect(explorerContainer).toBeTruthy();
    expect(explorerContainer!.className).not.toContain('hidden');
    // Toggles flipped back to "Maximizar".
    expect(screen.getAllByRole('button', { name: 'Maximizar' }).length).toBeGreaterThan(0);
  });

  it('the preview pane close (X) button calls closeSelection (NOT onClose)', () => {
    const onClose = vi.fn();
    const closeSelection = vi.fn();
    const viewer: FileViewer = {
      supportedExtensions: ['x'],
      canPreview: () => true,
      buildPreviewUrl: () => '',
      renderPreview: (): ReactElement => <div data-testid="mock-viewer" />,
    };
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'previewing', file: sampleFiles[0]!, viewer },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection,
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Cerrar vista previa/i }));
    expect(closeSelection).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('plumbs currentPath to the preview pane (folder path is forwarded to the viewer)', () => {
    // The mock viewer renders the folderPath as a data-folder attribute.
    const renderPreview = vi.fn(
      (args: PreviewArgs): ReactElement => (
        <div data-testid="mock-viewer" data-folder={args.folderPath} />
      ),
    );
    const viewer: FileViewer = {
      supportedExtensions: ['x'],
      canPreview: () => true,
      buildPreviewUrl: () => '',
      renderPreview,
    };
    mockUseFileTree.mockReturnValue({
      viewState: readyView('subfolder/inner', sampleFiles),
      selectionState: { kind: 'previewing', file: sampleFiles[0]!, viewer },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={vi.fn()}
      />,
    );

    // The viewer received folderPath = 'subfolder/inner'.
    expect(renderPreview).toHaveBeenCalledTimes(1);
    const args = renderPreview.mock.calls[0]?.[0];
    expect(args?.folderPath).toBe('subfolder/inner');
    const element = container.querySelector('[data-folder="subfolder/inner"]');
    expect(element).toBeTruthy();
  });

  it('isMaximized is initialized to false (no hidden class on the explorer container on a fresh mount)', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        onClose={vi.fn()}
      />,
    );

    // The explorer's container does NOT have the 'hidden' class.
    const explorerContainer = container.querySelector('[data-testid="files-explorer-container"]');
    expect(explorerContainer).toBeTruthy();
    expect(explorerContainer!.className).not.toContain('hidden');
    // Toggles show "Maximizar" (not "Minimizar").
    expect(screen.getAllByRole('button', { name: 'Maximizar' }).length).toBeGreaterThan(0);
  });
});

import { FilesModal } from '../FilesModal';
