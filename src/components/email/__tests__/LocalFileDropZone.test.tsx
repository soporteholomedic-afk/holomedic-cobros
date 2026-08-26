import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocalFileDropZone } from '../LocalFileDropZone';

function createFile(name: string, size: number, type = 'application/octet-stream'): File {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type });
}

/** Minimal DataTransfer mock — jsdom does not expose `DataTransfer`. */
function mockDataTransfer(files: File[]) {
  return {
    files: {
      length: files.length,
      item: (i: number) => files[i] ?? null,
      [Symbol.iterator]() { return files[Symbol.iterator](); },
    } as unknown as FileList,
  };
}

/** Build a synthetic `DragEvent` with a `FileList` containing the given files. */
function createDragEvent(files: File[]): DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: mockDataTransfer(files) as unknown as DataTransfer,
  } as unknown as DragEvent;
}

describe('LocalFileDropZone', () => {
  it('renders the idle state with drop instruction', () => {
    render(
      <LocalFileDropZone files={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByText('Arrastra archivos aquí o haz clic para seleccionar')).toBeInTheDocument();
  });

  it('shows drag-over state when a file is dragged over', () => {
    render(
      <LocalFileDropZone files={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );

    const zone = screen.getByTestId('local-file-drop-zone');
    fireEvent.dragOver(zone);

    expect(screen.getByText('Suelta los archivos aquí')).toBeInTheDocument();
  });

  it('calls onAdd with the dropped files on drop', () => {
    const onAdd = vi.fn();
    render(
      <LocalFileDropZone files={[]} onAdd={onAdd} onRemove={vi.fn()} />,
    );

    const zone = screen.getByTestId('local-file-drop-zone');
    const files = [createFile('test.pdf', 100)];
    fireEvent.drop(zone, createDragEvent(files));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const added = onAdd.mock.calls[0]?.[0] as File[];
    expect(added).toHaveLength(1);
    expect(added[0]!.name).toBe('test.pdf');
  });

  it('shows the file list when files are present', () => {
    render(
      <LocalFileDropZone
        files={[createFile('doc1.pdf', 200), createFile('img.png', 300)]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('doc1.pdf')).toBeInTheDocument();
    expect(screen.getByText('img.png')).toBeInTheDocument();
  });

  it('calls onRemove with the index when the X button is clicked', () => {
    const onRemove = vi.fn();
    render(
      <LocalFileDropZone
        files={[createFile('to-remove.pdf', 100)]}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    );

    const removeButton = screen.getByLabelText('Quitar to-remove.pdf');
    fireEvent.click(removeButton);

    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it('rejects a drop that would exceed the total byte cap', () => {
    const onAdd = vi.fn();
    const maxTotalBytes = 1000;
    // Already has 800 bytes, trying to add 300 more = 1100 > 1000
    render(
      <LocalFileDropZone
        files={[createFile('existing.bin', 800)]}
        onAdd={onAdd}
        onRemove={vi.fn()}
        maxTotalBytes={maxTotalBytes}
      />,
    );

    const zone = screen.getByTestId('local-file-drop-zone');
    const files = [createFile('too-big.bin', 300)];
    fireEvent.drop(zone, createDragEvent(files));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId('drop-error')).toBeInTheDocument();
  });

  it('accepts a drop that stays within the byte cap', () => {
    const onAdd = vi.fn();
    // Existing 500, adding 200 = 700 < 1000 (within cap)
    render(
      <LocalFileDropZone
        files={[createFile('existing.bin', 500)]}
        onAdd={onAdd}
        onRemove={vi.fn()}
        maxTotalBytes={1000}
      />,
    );

    const zone = screen.getByTestId('local-file-drop-zone');
    const files = [createFile('ok.bin', 200)];
    fireEvent.drop(zone, createDragEvent(files));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows the current total size counter in MB', () => {
    render(
      <LocalFileDropZone
        files={[createFile('a.pdf', 1024), createFile('b.pdf', 2048)]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    // 1024 + 2048 = 3072 bytes → 0.0 MB / 50 MB
    expect(screen.getByText(/0\.0 MB \/ 50 MB/)).toBeInTheDocument();
  });

  it('renders the "Archivos locales" heading', () => {
    render(
      <LocalFileDropZone files={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(screen.getByText('Archivos locales')).toBeInTheDocument();
  });
});
