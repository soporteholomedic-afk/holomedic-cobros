import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFileNode,
  createFolderNode,
  type FileNode,
  type FileSystemNode,
} from '@/features/envio-resultados/domain/ports';
import type { UseFileTreeReturn, ViewState } from '@/features/envio-resultados/presentation/hooks/useFileTree';

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
});

import { FilesModal } from '../FilesModal';
