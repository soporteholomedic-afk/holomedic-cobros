import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { createFileNode, type FileNode } from '@/features/envio-resultados/domain/ports';
import type { FileViewer, PreviewArgs } from '@/features/envio-resultados/presentation/viewers/FileViewer';
import type { SelectionState } from '@/features/envio-resultados/presentation/hooks/useFileTree';
import { viewerFor } from '@/features/envio-resultados/presentation/viewers/viewerFor';
import { FilesPreviewPane } from '@/features/envio-resultados/presentation/components/FilesPreviewPane';

const sampleFile: FileNode = createFileNode({
  name: 'informe.pdf',
  sizeBytes: 4096,
  modifiedAt: '2026-06-01T00:00:00.000Z',
});

/**
 * Build a mock `FileViewer` that returns a sentinel element from
 * `renderPreview`. The factory is the only place concrete strategies
 * are normally instantiated; here we bypass it to assert that
 * `FilesPreviewPane` calls the strategy's methods correctly.
 */
function makeMockViewer(): FileViewer {
  return {
    supportedExtensions: ['mock'],
    canPreview: (name: string): boolean => {
      void name;
      return true;
    },
    buildPreviewUrl: (args: PreviewArgs): string => {
      void args;
      return '/api/files/preview?mock=1';
    },
    renderPreview: (args: PreviewArgs): ReactElement => (
      <div data-testid="mock-viewer-element" data-name={args.name} data-folder={args.folderPath}>
        mock preview for {args.name} in {args.folderPath}
      </div>
    ),
  };
}

const baseProps = {
  selectionState: { kind: 'none' } as SelectionState,
  isMaximized: false,
  onClose: vi.fn(),
  onToggleMaximize: vi.fn(),
  ruc: 'RUC-1',
  dni: '12345678',
  idAten: 'AT-001',
  currentPath: '',
};

describe('FilesPreviewPane', () => {
  it('renders the placeholder message when there is no selection', () => {
    render(<FilesPreviewPane {...baseProps} selectionState={{ kind: 'none' }} />);
    expect(screen.getByText(/Selecciona un archivo para previsualizarlo/)).toBeInTheDocument();
  });

  it('does NOT render a close (X) button when there is no selection', () => {
    render(<FilesPreviewPane {...baseProps} selectionState={{ kind: 'none' }} />);
    // The placeholder is the only thing in the pane — no X button.
    expect(screen.queryByRole('button', { name: /Cerrar vista previa/i })).not.toBeInTheDocument();
  });

  it('the maximize toggle is DISABLED when there is no selection', () => {
    render(<FilesPreviewPane {...baseProps} selectionState={{ kind: 'none' }} />);
    const toggle = screen.getByRole('button', { name: /Maximizar/i });
    expect(toggle).toBeDisabled();
  });

  it('renders the viewer element when a file is previewing', () => {
    const viewer = makeMockViewer();
    render(
      <FilesPreviewPane
        {...baseProps}
        selectionState={{ kind: 'previewing', file: sampleFile, viewer }}
      />,
    );
    expect(screen.getByTestId('mock-viewer-element')).toBeInTheDocument();
    expect(screen.getByText(/mock preview for informe\.pdf/)).toBeInTheDocument();
  });

  it('passes the file name and the currentPath to the viewer as folderPath', () => {
    const viewer = makeMockViewer();
    const { container } = render(
      <FilesPreviewPane
        {...baseProps}
        currentPath="subfolder/inner"
        selectionState={{ kind: 'previewing', file: sampleFile, viewer }}
      />,
    );
    const element = container.querySelector('[data-testid="mock-viewer-element"]');
    expect(element).toBeTruthy();
    expect(element!.getAttribute('data-name')).toBe('informe.pdf');
    expect(element!.getAttribute('data-folder')).toBe('subfolder/inner');
  });

  it('passes ruc / dni / idAten to the viewer args (used by buildPreviewUrl)', () => {
    // Spy on the viewer's renderPreview to capture the args.
    const renderSpy = vi.fn((args: PreviewArgs): ReactElement => {
      void args;
      return <div data-testid="spy" />;
    });
    const viewer: FileViewer = {
      supportedExtensions: ['x'],
      canPreview: () => true,
      buildPreviewUrl: (args) =>
        `/api/files/preview?ruc=${args.ruc}&dni=${args.dni}&idAten=${args.idAten}`,
      renderPreview: renderSpy,
    };
    render(
      <FilesPreviewPane
        {...baseProps}
        ruc="RUC-Z"
        dni="99999999"
        idAten="AT-Z"
        selectionState={{ kind: 'previewing', file: sampleFile, viewer }}
      />,
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);
    const args = renderSpy.mock.calls[0]?.[0] as PreviewArgs | undefined;
    expect(args).toBeDefined();
    expect(args!.ruc).toBe('RUC-Z');
    expect(args!.dni).toBe('99999999');
    expect(args!.idAten).toBe('AT-Z');
    expect(args!.name).toBe('informe.pdf');
    expect(args!.folderPath).toBe('');
  });

  it('renders a close (X) button when a file is previewing', () => {
    const viewer = makeMockViewer();
    render(
      <FilesPreviewPane
        {...baseProps}
        selectionState={{ kind: 'previewing', file: sampleFile, viewer }}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Cerrar vista previa/i }),
    ).toBeInTheDocument();
  });

  it('clicking the close (X) button calls onClose exactly once', () => {
    const onClose = vi.fn();
    const viewer = makeMockViewer();
    render(
      <FilesPreviewPane
        {...baseProps}
        onClose={onClose}
        selectionState={{ kind: 'previewing', file: sampleFile, viewer }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cerrar vista previa/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the maximize toggle is ENABLED when a file is previewing', () => {
    const viewer = makeMockViewer();
    render(
      <FilesPreviewPane
        {...baseProps}
        selectionState={{ kind: 'previewing', file: sampleFile, viewer }}
      />,
    );
    const toggle = screen.getByRole('button', { name: /Maximizar/i });
    expect(toggle).not.toBeDisabled();
  });

  it('clicking the maximize toggle calls onToggleMaximize exactly once', () => {
    const onToggleMaximize = vi.fn();
    const viewer = makeMockViewer();
    render(
      <FilesPreviewPane
        {...baseProps}
        onToggleMaximize={onToggleMaximize}
        selectionState={{ kind: 'previewing', file: sampleFile, viewer }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Maximizar/i }));
    expect(onToggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('flips the toggle label to "Minimizar" when isMaximized is true', () => {
    const viewer = makeMockViewer();
    render(
      <FilesPreviewPane
        {...baseProps}
        isMaximized
        selectionState={{ kind: 'previewing', file: sampleFile, viewer }}
      />,
    );
    expect(screen.getByRole('button', { name: /Minimizar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Maximizar/i })).not.toBeInTheDocument();
  });

  it('keeps the "Maximizar" label when isMaximized is false (no flip)', () => {
    const viewer = makeMockViewer();
    render(
      <FilesPreviewPane
        {...baseProps}
        isMaximized={false}
        selectionState={{ kind: 'previewing', file: sampleFile, viewer }}
      />,
    );
    expect(screen.getByRole('button', { name: /Maximizar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Minimizar/i })).not.toBeInTheDocument();
  });

  it('renders the NoPreviewViewer message for an unknown file type', () => {
    // NoPreviewViewer is the production fallback; this test asserts the
    // pane forwards the selection to the real strategy without a
    // hard-coded branch.
    const docx = createFileNode({ name: 'plan.docx', sizeBytes: 1, modifiedAt: '2026-01-01T00:00:00.000Z' });
    const viewer = viewerFor('plan.docx');
    render(
      <FilesPreviewPane
        {...baseProps}
        selectionState={{ kind: 'previewing', file: docx, viewer }}
      />,
    );
    expect(screen.getByText(/No hay vista previa disponible/)).toBeInTheDocument();
  });
});
