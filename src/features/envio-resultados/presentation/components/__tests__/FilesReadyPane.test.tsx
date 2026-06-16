import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createFileNode,
  type FileNode,
} from '@/features/envio-resultados/domain/ports';
import { FilesReadyPane } from '../FilesReadyPane';

const sampleFiles: FileNode[] = [
  createFileNode({ name: '75618561CERT.pdf', sizeBytes: 1024, modifiedAt: '2026-06-01T00:00:00.000Z' }),
  createFileNode({ name: '012109975EXPED.pdf', sizeBytes: 2048, modifiedAt: '2026-06-02T00:00:00.000Z' }),
];

const baseProps = {
  ruc: 'RUC-1',
  dni: '12345678',
  idAten: 'AT-001',
  onSelect: vi.fn(),
};

describe('FilesReadyPane', () => {
  it('renders the loading skeleton while the listing is being fetched', () => {
    render(<FilesReadyPane {...baseProps} state={{ kind: 'loading' }} />);

    expect(screen.getByTestId('files-ready-skeleton')).toBeInTheDocument();
    expect(screen.queryByText(/Sin archivos listos/)).not.toBeInTheDocument();
  });

  it('renders the empty state when no files matched', () => {
    render(<FilesReadyPane {...baseProps} state={{ kind: 'empty' }} />);

    expect(screen.getByText(/Sin archivos listos para enviar/)).toBeInTheDocument();
  });

  it('renders the error state', () => {
    render(
      <FilesReadyPane {...baseProps} state={{ kind: 'error', message: 'boom' }} />,
    );

    expect(screen.getByText(/No se pudieron cargar los archivos/)).toBeInTheDocument();
  });

  it('renders one row per matched file with the LEGAJOS download href', () => {
    render(<FilesReadyPane {...baseProps} state={{ kind: 'ready', files: sampleFiles }} />);

    const certRow = screen.getByText('75618561CERT.pdf').closest('li');
    expect(certRow).toBeTruthy();
    const certLink = certRow!.querySelector('a');
    expect(certLink).toHaveAttribute(
      'href',
      '/api/files/download?ruc=RUC-1&dni=12345678&idAten=AT-001&path=LEGAJOS&filename=75618561CERT.pdf',
    );

    const expedRow = screen.getByText('012109975EXPED.pdf').closest('li');
    expect(expedRow).toBeTruthy();
    const expedLink = expedRow!.querySelector('a');
    expect(expedLink).toHaveAttribute(
      'href',
      '/api/files/download?ruc=RUC-1&dni=12345678&idAten=AT-001&path=LEGAJOS&filename=012109975EXPED.pdf',
    );
  });

  it('calls onSelect with the FileNode when the Visualizar button is clicked', () => {
    const onSelect = vi.fn();
    render(
      <FilesReadyPane
        {...baseProps}
        onSelect={onSelect}
        state={{ kind: 'ready', files: sampleFiles }}
      />,
    );

    const allVisualizar = screen.getAllByRole('button', { name: /Visualizar/ });
    expect(allVisualizar).toHaveLength(2);
    fireEvent.click(allVisualizar[0]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(sampleFiles[0]);
  });

  // -- PR #2: pane checkboxes (selection wiring) ---------------------------

  it('renders a checkbox for each file in the ready list', () => {
    render(
      <FilesReadyPane {...baseProps} state={{ kind: 'ready', files: sampleFiles }} />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(sampleFiles.length);
  });

  it('checkbox is checked by default when selectedRefs is not provided (backward compat)', () => {
    render(
      <FilesReadyPane {...baseProps} state={{ kind: 'ready', files: sampleFiles }} />,
    );

    for (const cb of screen.getAllByRole('checkbox')) {
      expect(cb).toBeChecked();
    }
  });

  it('clicking the checkbox calls onToggle with "::" + name and the FileNode', () => {
    const onToggle = vi.fn();
    render(
      <FilesReadyPane
        {...baseProps}
        state={{ kind: 'ready', files: sampleFiles }}
        onToggle={onToggle}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('::75618561CERT.pdf', sampleFiles[0]);
  });

  it('checkbox click does NOT trigger onSelect (no Visualizar side-effect)', () => {
    const onSelect = vi.fn();
    render(
      <FilesReadyPane
        {...baseProps}
        onSelect={onSelect}
        state={{ kind: 'ready', files: sampleFiles }}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('checked state mirrors selectedRefs.has("::" + name) when selectedRefs is provided', () => {
    // Only the second file is in the selection set.
    const selectedRefs = new Set<string>(['::012109975EXPED.pdf']);
    render(
      <FilesReadyPane
        {...baseProps}
        state={{ kind: 'ready', files: sampleFiles }}
        selectedRefs={selectedRefs}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // First file NOT in selectedRefs → unchecked
    expect(checkboxes[0]).not.toBeChecked();
    // Second file IS in selectedRefs → checked
    expect(checkboxes[1]).toBeChecked();
  });
});
