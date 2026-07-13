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
import type { UseReadyFilesReturn } from '@/features/envio-resultados/presentation/hooks/useReadyFiles';
import type {
  FileViewer,
  PreviewArgs,
} from '@/features/envio-resultados/presentation/viewers/FileViewer';

// ---- PR-2 stub for FilesGeneratePane ----
// The pane has its own test file (FilesGeneratePane.test.tsx). For the
// FilesModal integration we only need to verify the wiring — the stub
// renders a button that fires `onSuccess` when clicked, and a
// button that fires the success callback with a fake result.
const mockFilesGeneratePaneOnSuccess = vi.hoisted(() => vi.fn());
vi.mock('../FilesGeneratePane', () => ({
  FilesGeneratePane: (props: Record<string, unknown>) => {
    const onSuccess = props['onSuccess'] as ((result: unknown) => void) | undefined;
    return (
      <div data-testid="files-generate-pane-stub">
        <span data-testid="files-generate-pane-fecate">{String(props['fecAte'] ?? '')}</span>
        {typeof onSuccess === 'function' && (
          <button
            data-testid="files-generate-pane-trigger-onsuccess"
            onClick={() => {
              mockFilesGeneratePaneOnSuccess(props);
              onSuccess({
                manifest: [],
                summary: { generated: 0, failed: 0, skipped: 0, exitCode: 0, retries: 0 },
              });
            }}
          >
            trigger-onsuccess
          </button>
        )}
      </div>
    );
  },
}));

/**
 * Stub the `useFileTree` and `useReadyFiles` hooks so each test controls
 * their return values without ever issuing a real network request.
 */
const mockUseFileTree = vi.fn<() => UseFileTreeReturn>();
const mockUseReadyFiles = vi.fn<() => UseReadyFilesReturn>();

vi.mock('@/features/envio-resultados/presentation/hooks/useFileTree', () => ({
  useFileTree: () => mockUseFileTree(),
}));

vi.mock('@/features/envio-resultados/presentation/hooks/useReadyFiles', () => ({
  useReadyFiles: () => mockUseReadyFiles(),
}));

beforeEach(() => {
  mockUseFileTree.mockReset();
  mockUseReadyFiles.mockReset();
  // Default: ready pane is empty so the modal opens cleanly. Each
  // test that exercises the ready pane overrides this mock. PR #2
  // (generar-archivos-pdf-informes) — `refetch` is now part of the
  // hook's return shape, so the mock must include it.
  mockUseReadyFiles.mockReturnValue({ state: { kind: 'empty' }, refetch: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Helper — switch to the "Todos" tab. Default tab is "Listo para enviar",
 * so every test that asserts behavior of the explorer pane must first
 * call this. New tests that exercise the ready pane skip it.
 */
function selectAllTab(): void {
  fireEvent.click(screen.getByRole('tab', { name: /Todos/ }));
}

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
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        destino=""
        onClose={vi.fn()}
      />,
    );

    selectAllTab();
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
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        destino=""
        onClose={vi.fn()}
      />,
    );

    selectAllTab();
    expect(screen.getByText(/No hay archivos para esta ficha/)).toBeInTheDocument();
    const downloadBtn = screen.getByTestId('files-modal-download-selected');
    expect(downloadBtn).toBeDisabled();
    expect(downloadBtn).toHaveTextContent('Descargar seleccionados (0)');
  });

  it('renders the error state with a Reintentar button', () => {
    mockUseFileTree.mockReturnValue({
      viewState: { kind: 'error', message: 'boom' },
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        destino=""
        onClose={vi.fn()}
      />,
    );

    selectAllTab();
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
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    selectAllTab();
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

  it('renders the download-selected button with the correct label and is enabled when files are selected', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    // Ready pane with files so the pre-check populates selectedFilesMap
    mockUseReadyFiles.mockReturnValue({
      state: {
        kind: 'ready',
        files: sampleFiles,
      },
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    const downloadBtn = screen.getByTestId('files-modal-download-selected');
    expect(downloadBtn).toBeInTheDocument();
    expect(downloadBtn).toHaveTextContent('Descargar seleccionados (2)');
    expect(downloadBtn).not.toBeDisabled();
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
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    selectAllTab();
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
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    selectAllTab();
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
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
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
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
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
      refetch: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
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
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        destino=""
        onClose={vi.fn()}
      />,
    );

    selectAllTab();
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
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    selectAllTab();
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
      refetch: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
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
    expect(explorerContainer!.classList.contains('hidden')).toBe(true);
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
      refetch: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
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
    expect(explorerContainer!.classList.contains('hidden')).toBe(false);
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
      selectionState: { kind: 'previewing', file: sampleFiles[0]!, viewer, folderPath: '' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection,
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Cerrar vista previa/i }));
    expect(closeSelection).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('plumbs selectionState.folderPath to the preview pane (folder path is forwarded to the viewer)', () => {
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
      selectionState: {
        kind: 'previewing',
        file: sampleFiles[0]!,
        viewer,
        folderPath: 'subfolder/inner',
      },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    // The viewer received folderPath = 'subfolder/inner' — sourced from
    // selectionState.folderPath, NOT viewState.currentPath. This proves
    // that a preview opened from any pane (explorer or ready) carries
    // its own folder context.
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
      refetch: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    // The explorer's container does NOT have the 'hidden' class.
    const explorerContainer = container.querySelector('[data-testid="files-explorer-container"]');
    expect(explorerContainer).toBeTruthy();
    expect(explorerContainer!.classList.contains('hidden')).toBe(false);
    // Toggles show "Maximizar" (not "Minimizar").
    expect(screen.getAllByRole('button', { name: 'Maximizar' }).length).toBeGreaterThan(0);
  });

  // ─── TABS: Listo para enviar | Todos ──────────────────────────────

  it('renders both tabs in the left pane (Listo para enviar + Todos)', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: /Listo para enviar/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Todos/ })).toBeInTheDocument();
  });

  it('default tab is "Listo para enviar" — the ready pane is visible on mount, the explorer is NOT', () => {
    const readyFiles: FileNode[] = [
      createFileNode({
        name: '75618561CERT.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
    ];
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'ready', files: readyFiles }, refetch: vi.fn() });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    // Ready pane is visible — its file is rendered.
    expect(screen.getByText('75618561CERT.pdf')).toBeInTheDocument();
    // Explorer pane is NOT visible — none of its sample files are rendered.
    expect(screen.queryByText('informe.pdf')).not.toBeInTheDocument();
    // The Ready tab is marked as selected.
    expect(screen.getByRole('tab', { name: /Listo para enviar/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('clicking the "Todos" tab hides the ready pane and shows the explorer (and vice versa)', () => {
    const readyFiles: FileNode[] = [
      createFileNode({
        name: '75618561CERT.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
    ];
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'ready', files: readyFiles }, refetch: vi.fn() });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    // Mount: ready pane visible.
    expect(screen.getByText('75618561CERT.pdf')).toBeInTheDocument();

    // Switch to Todos: explorer files visible, ready file hidden.
    fireEvent.click(screen.getByRole('tab', { name: /Todos/ }));
    expect(screen.getByText('informe.pdf')).toBeInTheDocument();
    expect(screen.queryByText('75618561CERT.pdf')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Todos/ })).toHaveAttribute('aria-selected', 'true');

    // Switch back to Ready: ready pane returns.
    fireEvent.click(screen.getByRole('tab', { name: /Listo para enviar/ }));
    expect(screen.getByText('75618561CERT.pdf')).toBeInTheDocument();
    expect(screen.queryByText('informe.pdf')).not.toBeInTheDocument();
  });

  it('selecting a file from the ready pane stamps folderPath="LEGAJOS" on selectFile', () => {
    const readyFiles: FileNode[] = [
      createFileNode({
        name: '75618561CERT.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
    ];
    const selectFile = vi.fn();
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', []),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile,
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'ready', files: readyFiles }, refetch: vi.fn() });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Visualizar/ }));
    expect(selectFile).toHaveBeenCalledTimes(1);
    expect(selectFile).toHaveBeenCalledWith(readyFiles[0], 'LEGAJOS');
  });

  it('ready pane empty state surfaces the "Sin archivos listos" message', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'empty' }, refetch: vi.fn() });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Sin archivos listos para enviar/)).toBeInTheDocument();
  });

  it('selection persists across tab switches (closing the preview is the only way to dismiss it)', () => {
    const viewer: FileViewer = {
      supportedExtensions: ['pdf'],
      canPreview: () => true,
      buildPreviewUrl: () => '',
      renderPreview: (args: PreviewArgs): ReactElement => (
        <div data-testid="mock-viewer" data-folder={args.folderPath} data-name={args.name} />
      ),
    };
    const preselected: FileNode = createFileNode({
      name: '75618561CERT.pdf',
      sizeBytes: 1024,
      modifiedAt: '2026-06-01T00:00:00.000Z',
    });
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: {
        kind: 'previewing',
        file: preselected,
        viewer,
        folderPath: 'LEGAJOS',
      },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });

    const { container } = render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    // The mock viewer renders in both tabs because selectionState is mocked.
    expect(container.querySelector('[data-folder="LEGAJOS"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Todos/ }));
    expect(container.querySelector('[data-folder="LEGAJOS"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Listo para enviar/ }));
    expect(container.querySelector('[data-folder="LEGAJOS"]')).toBeTruthy();
  });

  // ─── PR #3: selection state + Enviar button ─────────────────────────

  it('renders the "Enviar (0)" button in the footer with data-testid="files-modal-send"', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    const sendButton = screen.getByTestId('files-modal-send');
    expect(sendButton).toBeInTheDocument();
    expect(sendButton).toHaveTextContent('Enviar (0)');
  });

  it('disables the "Enviar" button when no file is selected (count = 0)', () => {
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    const sendButton = screen.getByTestId('files-modal-send');
    expect(sendButton).toBeDisabled();
  });

  it('pre-checks all ready-pane files when the modal mounts (Enviar label becomes "Enviar (N)")', () => {
    const readyFiles: FileNode[] = [
      createFileNode({
        name: '75618561CERT.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
      createFileNode({
        name: '012109975EXPED.pdf',
        sizeBytes: 2048,
        modifiedAt: '2026-06-02T00:00:00.000Z',
      }),
    ];
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'ready', files: readyFiles }, refetch: vi.fn() });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    // Pre-check effect populates the map → counter shows 2.
    expect(screen.getByTestId('files-modal-send')).toHaveTextContent('Enviar (2)');
    // The checkboxes themselves reflect the selection.
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    for (const cb of checkboxes) {
      expect(cb).toBeChecked();
    }
  });

  it('enables the "Enviar" button when at least one file is selected', () => {
    const readyFiles: FileNode[] = [
      createFileNode({
        name: '75618561CERT.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
    ];
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'ready', files: readyFiles }, refetch: vi.fn() });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    const sendButton = screen.getByTestId('files-modal-send');
    expect(sendButton).not.toBeDisabled();
  });

  it('updates the "Enviar" counter live when a ready-pane checkbox is toggled (uncheck + recheck)', () => {
    const readyFiles: FileNode[] = [
      createFileNode({
        name: 'a.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
      createFileNode({
        name: 'b.pdf',
        sizeBytes: 2048,
        modifiedAt: '2026-06-02T00:00:00.000Z',
      }),
    ];
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'ready', files: readyFiles }, refetch: vi.fn() });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    const sendButton = screen.getByTestId('files-modal-send');
    expect(sendButton).toHaveTextContent('Enviar (2)');

    // Uncheck the first file → counter drops to 1.
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    expect(sendButton).toHaveTextContent('Enviar (1)');
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();

    // Re-check the first file → counter goes back to 2.
    fireEvent.click(checkboxes[0]!);
    expect(sendButton).toHaveTextContent('Enviar (2)');
    expect(checkboxes[0]).toBeChecked();
  });

  it('fires onSend with a ReadonlyMap<fileRef, FileNode> when "Enviar" is clicked', () => {
    // PR #1 — signature changed from FileNode[] to
    // ReadonlyMap<fileRef, FileNode> so the bridge can preserve the
    // explorer-pane folder path (the `fileRef` key is "folderPath::name").
    const readyFiles: FileNode[] = [
      createFileNode({
        name: 'a.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
      createFileNode({
        name: 'b.pdf',
        sizeBytes: 2048,
        modifiedAt: '2026-06-02T00:00:00.000Z',
      }),
    ];
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'ready', files: readyFiles }, refetch: vi.fn() });
    const onSend = vi.fn();

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
        onSend={onSend}
      />,
    );

    fireEvent.click(screen.getByTestId('files-modal-send'));

    expect(onSend).toHaveBeenCalledTimes(1);
    // Payload is now a Map keyed by fileRef ("LEGAJOS::name" for the ready pane).
    const payload = onSend.mock.calls[0]?.[0] as ReadonlyMap<string, FileNode>;
    expect(payload).toBeInstanceOf(Map);
    expect(payload.size).toBe(2);
    // Insertion order preserved.
    expect(payload.get('LEGAJOS::a.pdf')).toBe(readyFiles[0]);
    expect(payload.get('LEGAJOS::b.pdf')).toBe(readyFiles[1]);
  });

  it('does not throw when "Enviar" is clicked without an onSend handler (optional prop)', () => {
    const readyFiles: FileNode[] = [
      createFileNode({
        name: 'a.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
    ];
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'ready', files: readyFiles }, refetch: vi.fn() });

    // No `onSend` prop on purpose.
    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    const sendButton = screen.getByTestId('files-modal-send');
    expect(sendButton).not.toBeDisabled();
    expect(() => fireEvent.click(sendButton)).not.toThrow();
  });

  it('resets the selection when (ruc, dni, idAten) change', () => {
    const readyFiles: FileNode[] = [
      createFileNode({
        name: 'a.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
    ];
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'ready', files: readyFiles }, refetch: vi.fn() });

    const { rerender } = render(
      <FilesModal
        ruc="RUC-OLD"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    const sendButton = screen.getByTestId('files-modal-send');
    expect(sendButton).toHaveTextContent('Enviar (1)');

    // Switch the ruc → identity-reset effect clears the map. The readyState
    // mock is unchanged (same reference) so the pre-check effect does NOT
    // re-fire, leaving the counter at 0.
    rerender(
      <FilesModal
        ruc="RUC-NEW"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    expect(sendButton).toHaveTextContent('Enviar (0)');
    expect(sendButton).toBeDisabled();
  });

  it('does not trigger selectFile (Visualizar) when a ready-pane checkbox is clicked', () => {
    const readyFiles: FileNode[] = [
      createFileNode({
        name: 'a.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
    ];
    const selectFile = vi.fn();
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile,
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'ready', files: readyFiles }, refetch: vi.fn() });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(selectFile).not.toHaveBeenCalled();
  });

  // ================================================================
  // PR-2 (generar-archivos-pdf-informes) — 'Generar archivos' tab
  // ================================================================

  it('renders the "Generar archivos" tab alongside the existing tabs', () => {
    mockUseFileTree.mockReturnValue({
      viewState: { kind: 'empty' },
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        destino=""
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: /Listo para enviar/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Todos/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Generar archivos/ })).toBeInTheDocument();
  });

  it('clicking the "Generar archivos" tab mounts the FilesGeneratePane with the fecAte prop', () => {
    mockUseFileTree.mockReturnValue({
      viewState: { kind: 'empty' },
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        destino=""
        fecAte="17/06/2026"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: /Generar archivos/ }));

    expect(screen.getByTestId('files-generate-pane-stub')).toBeInTheDocument();
    expect(screen.getByTestId('files-generate-pane-fecate')).toHaveTextContent('17/06/2026');
  });

  it('on generation success the modal switches to the "Listo para enviar" tab and refetches ready files', () => {
    const readyRefetch = vi.fn();
    mockUseFileTree.mockReturnValue({
      viewState: { kind: 'empty' },
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({
      state: { kind: 'ready', files: [] },
      refetch: readyRefetch,
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme"
        destino=""
        fecAte="17/06/2026"
        onClose={vi.fn()}
      />,
    );

    // Switch to the generate tab.
    fireEvent.click(screen.getByRole('tab', { name: /Generar archivos/ }));
    expect(screen.getByRole('tab', { name: /Generar archivos/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Fire onSuccess via the stub's trigger button.
    fireEvent.click(screen.getByTestId('files-generate-pane-trigger-onsuccess'));

    // The modal must have switched to the "Listo para enviar" tab and
    // called `readyRefetch` to invalidate the explorer hook.
    expect(screen.getByRole('tab', { name: /Listo para enviar/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(readyRefetch).toHaveBeenCalledTimes(1);
  });

  it('calls both tree and ready refetch functions when the reload header button is clicked', () => {
    const treeRefetch = vi.fn();
    const readyRefetch = vi.fn();
    mockUseFileTree.mockReturnValue({
      viewState: readyView('', sampleFiles),
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: treeRefetch,
    });
    mockUseReadyFiles.mockReturnValue({ state: { kind: 'empty' }, refetch: readyRefetch });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Recargar archivos/ }));
    expect(treeRefetch).toHaveBeenCalledTimes(1);
    expect(readyRefetch).toHaveBeenCalledTimes(1);
  });
});

// ================================================================
// PR envio-resultados CAMO/EMO wizard — WU-2a.1
//
// `mode='pick-single'` repurposes the modal as a single-pane picker
// for the wizard's Step 2 (CAMO) and Step 3 (EMO). The ready-pane
// listing is filtered by a regex tied to `pickType`, selection is
// radio-style (single file), and the footer carries a confirm/skip
// pair instead of the default multi-select "Enviar" button.
//
// All these cases are NEW behavior; the existing default-mode
// regression coverage stays in the outer `describe('FilesModal', …)`
// block and continues to drive the file-tree + tabs + multi-select
// path unchanged.
// ================================================================

describe('FilesModal - pick-single mode', () => {
  // Common fixture: a mix of CERT, EXPED, and an unrelated file so the
  // regex filter is the only thing differentiating what's visible.
  const readyFiles: FileNode[] = [
    createFileNode({
      name: '75618561CERT.pdf',
      sizeBytes: 1024,
      modifiedAt: '2026-06-01T00:00:00.000Z',
    }),
    createFileNode({
      name: '012109975EXPED.pdf',
      sizeBytes: 2048,
      modifiedAt: '2026-06-02T00:00:00.000Z',
    }),
    createFileNode({
      name: 'informe.pdf',
      sizeBytes: 4096,
      modifiedAt: '2026-06-03T00:00:00.000Z',
    }),
  ];

  function mockPanes(): void {
    mockUseFileTree.mockReturnValue({
      viewState: { kind: 'empty' },
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({
      state: { kind: 'ready', files: readyFiles },
      refetch: vi.fn(),
    });
  }

  it('filters the ready pane to /^\\d+CERT\\.pdf$/i when mode="pick-single" pickType="CAMO"', () => {
    mockPanes();
    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        mode="pick-single"
        pickType="CAMO"
        onPickSingle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('75618561CERT.pdf')).toBeInTheDocument();
    expect(screen.queryByText('012109975EXPED.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('informe.pdf')).not.toBeInTheDocument();
  });

  it('filters the ready pane to /^\\d+EXPED\\.pdf$/i when mode="pick-single" pickType="EMO"', () => {
    mockPanes();
    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        mode="pick-single"
        pickType="EMO"
        onPickSingle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('012109975EXPED.pdf')).toBeInTheDocument();
    expect(screen.queryByText('75618561CERT.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('informe.pdf')).not.toBeInTheDocument();
  });

  it('hides the explorer and generate tabs in pick-single mode (only the ready pane is visible)', () => {
    mockPanes();
    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        mode="pick-single"
        pickType="CAMO"
        onPickSingle={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    // The three default-mode tabs are not rendered in pick-single mode.
    expect(screen.queryByRole('tab', { name: /Listo para enviar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Todos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Generar archivos/ })).not.toBeInTheDocument();
  });

  it('enforces single-select (radio behavior) — selecting a different file replaces the previous pick', () => {
    // To exercise single-select we need at least two CERT files. We
    // swap the fixture for this case.
    const twoCerts: FileNode[] = [
      createFileNode({
        name: '75618561CERT.pdf',
        sizeBytes: 1024,
        modifiedAt: '2026-06-01T00:00:00.000Z',
      }),
      createFileNode({
        name: '99999999CERT.pdf',
        sizeBytes: 2048,
        modifiedAt: '2026-06-02T00:00:00.000Z',
      }),
    ];
    mockUseFileTree.mockReturnValue({
      viewState: { kind: 'empty' },
      selectionState: { kind: 'none' },
      navigate: vi.fn(),
      goUp: vi.fn(),
      selectFile: vi.fn(),
      closeSelection: vi.fn(),
      refetch: vi.fn(),
    });
    mockUseReadyFiles.mockReturnValue({
      state: { kind: 'ready', files: twoCerts },
      refetch: vi.fn(),
    });

    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        mode="pick-single"
        pickType="CAMO"
        onPickSingle={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);

    // Initially neither is checked.
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();

    // Click the first → first is checked, second is not.
    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();

    // Click the second → the previous selection is REPLACED. Only the
    // second is checked now.
    fireEvent.click(checkboxes[1]!);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it('renders a "Seleccionar" (disabled when 0 selected) and a "Saltar" (always enabled) footer in pick-single mode', () => {
    mockPanes();
    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        mode="pick-single"
        pickType="CAMO"
        onPickSingle={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const seleccionar = screen.getByTestId('files-modal-pick-select');
    const saltar = screen.getByTestId('files-modal-pick-skip');
    expect(seleccionar).toBeInTheDocument();
    expect(seleccionar).toBeDisabled();
    expect(saltar).toBeInTheDocument();
    expect(saltar).toBeEnabled();

    // The default-mode "Enviar" footer button is NOT rendered in pick-single.
    expect(screen.queryByTestId('files-modal-send')).not.toBeInTheDocument();
    expect(screen.queryByTestId('files-modal-download-selected')).not.toBeInTheDocument();
  });

  it('enables "Seleccionar" once exactly one file is checked', () => {
    mockPanes();
    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        mode="pick-single"
        pickType="CAMO"
        onPickSingle={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const seleccionar = screen.getByTestId('files-modal-pick-select');
    expect(seleccionar).toBeDisabled();

    // Pick the only CERT file → Seleccionar enables.
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(seleccionar).toBeEnabled();
  });

  it('clicking "Seleccionar" calls onPickSingle with the selected file AND onClose', () => {
    mockPanes();
    const onPickSingle = vi.fn();
    const onClose = vi.fn();
    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        mode="pick-single"
        pickType="CAMO"
        onPickSingle={onPickSingle}
        onClose={onClose}
      />,
    );

    // Pick the CERT file, then confirm.
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    fireEvent.click(screen.getByTestId('files-modal-pick-select'));

    expect(onPickSingle).toHaveBeenCalledTimes(1);
    const picked = onPickSingle.mock.calls[0]?.[0] as FileNode;
    expect(picked).toBeDefined();
    expect(picked.name).toBe('75618561CERT.pdf');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking "Saltar" calls onPickSingle(null) AND onClose', () => {
    mockPanes();
    const onPickSingle = vi.fn();
    const onClose = vi.fn();
    render(
      <FilesModal
        ruc="RUC-1"
        dni="12345678"
        idAten="AT-001"
        nombrePaciente="Juan Pérez"
        empresa="Acme Corp"
        destino=""
        mode="pick-single"
        pickType="CAMO"
        onPickSingle={onPickSingle}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId('files-modal-pick-skip'));

    expect(onPickSingle).toHaveBeenCalledTimes(1);
    expect(onPickSingle).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { FilesModal } from '../FilesModal';
