import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '@/features/envio-resultados/domain/ports';
import type { UsePatientFilesReturn } from '@/features/envio-resultados/presentation/hooks/usePatientFiles';

/**
 * Stub the `usePatientFiles` hook so each test controls its return
 * value without ever issuing a real network request.
 */
const mockUsePatientFiles = vi.fn<() => UsePatientFilesReturn>();

vi.mock('@/features/envio-resultados/presentation/hooks/usePatientFiles', () => ({
  usePatientFiles: () => mockUsePatientFiles(),
}));

beforeEach(() => {
  mockUsePatientFiles.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleFiles: FileEntry[] = [
  { name: 'informe.pdf', sizeBytes: 4096, modifiedAt: '2026-06-01T00:00:00.000Z' },
  { name: 'foto.jpg', sizeBytes: 524288, modifiedAt: '2026-06-02T00:00:00.000Z' },
];

describe('FilesModal', () => {
  it('renders the loading skeleton while files are being fetched', () => {
    mockUsePatientFiles.mockReturnValue({
      files: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
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

    // Header reflects the patient name and dni.
    expect(screen.getByText(/Juan Pérez/)).toBeInTheDocument();
    // Loading state — no file rows, no empty/error messages.
    expect(screen.queryByText('informe.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay archivos/)).not.toBeInTheDocument();
    expect(screen.getByTestId('files-skeleton')).toBeInTheDocument();
  });

  it('renders the empty state when the repository returns no files', () => {
    mockUsePatientFiles.mockReturnValue({
      files: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
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
    // Descargar todos must be disabled in the empty state.
    const downloadAll = screen.getByRole('link', { name: /Descargar todos/ });
    expect(downloadAll).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders the error state with a Reintentar button that calls refetch()', () => {
    const refetch = vi.fn();
    mockUsePatientFiles.mockReturnValue({
      files: [],
      loading: false,
      error: new Error('boom'),
      refetch,
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
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders one row per file with the correct download href', () => {
    mockUsePatientFiles.mockReturnValue({
      files: sampleFiles,
      loading: false,
      error: null,
      refetch: vi.fn(),
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

    // Per-file rows: locate the file name, then find the link inside the same <li>.
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
    mockUsePatientFiles.mockReturnValue({
      files: sampleFiles,
      loading: false,
      error: null,
      refetch: vi.fn(),
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

  it('closes the modal when the X button is clicked', () => {
    const onClose = vi.fn();
    mockUsePatientFiles.mockReturnValue({
      files: sampleFiles,
      loading: false,
      error: null,
      refetch: vi.fn(),
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
    mockUsePatientFiles.mockReturnValue({
      files: sampleFiles,
      loading: false,
      error: null,
      refetch: vi.fn(),
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
    mockUsePatientFiles.mockReturnValue({
      files: sampleFiles,
      loading: false,
      error: null,
      refetch: vi.fn(),
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

    // The backdrop is the outer fixed element.
    const backdrop = container.querySelector('.fixed.inset-0') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { FilesModal } from '../FilesModal';
