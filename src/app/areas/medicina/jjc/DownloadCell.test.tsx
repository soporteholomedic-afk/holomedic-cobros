import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DownloadCell } from './DownloadCell';

const { mockToastError } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

const ID_ATEN = '01234567';
const PACIENTE = 'Juan Pérez';

function createMockResponse(ok: boolean, status: number, body?: unknown): Response {
  // The component only reads `res.ok`, `res.status` and `res.blob()`, so we
  // build a plain mock instead of a real Response. Constructing a real
  // `new Response(blob)` throws in jsdom because its Blob lacks `.stream()`.
  if (ok) {
    return {
      ok,
      status,
      statusText: 'OK',
      blob: async () => new Blob(['fake-pdf-content'], { type: 'application/pdf' }),
    } as unknown as Response;
  }
  return {
    ok,
    status,
    statusText: status === 404 ? 'Not Found' : 'Error',
    blob: async () => new Blob([JSON.stringify(body ?? {})], { type: 'application/json' }),
  } as unknown as Response;
}

/** Creates a mock anchor element that records click/href/download. */
function createMockAnchor() {
  return {
    href: '',
    download: '',
    click: vi.fn(),
  };
}

const originalCreateElement = document.createElement.bind(document);

describe('DownloadCell', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockReset();
    vi.spyOn(URL, 'createObjectURL').mockReset();
    vi.spyOn(URL, 'revokeObjectURL').mockReset();
    mockToastError.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a button with correct aria-label, title, type, and FileDown icon', () => {
    render(<DownloadCell idAten={ID_ATEN} paciente={PACIENTE} />);

    const button = screen.getByRole('button', { name: `Descargar PDF de ${PACIENTE}` });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Descargar PDF');
    expect(button).toHaveAttribute('type', 'button');

    // Lucide FileDown renders as an SVG inside the button
    const svg = button.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('calls fetch with the correct URL on click', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse(true, 200),
    );

    render(<DownloadCell idAten={ID_ATEN} paciente={PACIENTE} />);
    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/areas/medicina/jjc/${ID_ATEN}/pdf`,
      );
    });
  });

  it('on 200, creates blob, creates anchor, clicks it, and revokes object URL', async () => {
    const user = userEvent.setup();

    const mockCreateObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:http://localhost/fake');
    const mockRevokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
    const mockAnchor = createMockAnchor();

    // Spy on createElement to intercept <a> creation
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') return mockAnchor as unknown as HTMLElement;
      return originalCreateElement(tagName);
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse(true, 200),
    );

    render(<DownloadCell idAten={ID_ATEN} paciente={PACIENTE} />);
    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(mockAnchor.download).toBe(`jjc-${ID_ATEN}.pdf`);
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/fake');
    });
  });

  it('on 404, calls toast.error with "Atención no encontrada"', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse(false, 404, { error: 'atencion_not_found' }),
    );

    render(<DownloadCell idAten={ID_ATEN} paciente={PACIENTE} />);
    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Atención no encontrada',
        expect.objectContaining({
          description: expect.stringContaining('generar el PDF'),
        }),
      );
    });
  });

  it('on 502, calls toast.error with database_unavailable message', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse(false, 502, { error: 'database_unavailable' }),
    );

    render(<DownloadCell idAten={ID_ATEN} paciente={PACIENTE} />);
    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'No se pudo conectar a la base de datos, reintentá',
        expect.any(Object),
      );
    });
  });

  it('on 500, calls toast.error with generic error message', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse(false, 500, { error: 'internal_error' }),
    );

    render(<DownloadCell idAten={ID_ATEN} paciente={PACIENTE} />);
    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Error al generar el PDF',
        expect.any(Object),
      );
    });
  });

  it('shows loading state during fetch and clears after resolve', async () => {
    const user = userEvent.setup();

    // Use a deferred promise to control timing
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

    render(<DownloadCell idAten={ID_ATEN} paciente={PACIENTE} />);
    const button = screen.getByRole('button');
    await user.click(button);

    // While pending, button should show loading state
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    // Now resolve with a 200 response
    const mockAnchor = createMockAnchor();
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') return mockAnchor as unknown as HTMLElement;
      return originalCreateElement(tagName);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/fake');
    vi.spyOn(URL, 'revokeObjectURL');

    resolveFetch(createMockResponse(true, 200));

    await waitFor(() => {
      expect(button).not.toHaveAttribute('aria-busy', 'true');
    });
    expect(button).not.toBeDisabled();
  });

  it('clears loading state on fetch error', async () => {
    const user = userEvent.setup();

    let rejectFetch!: (reason: Error) => void;
    const fetchPromise = new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    });

    vi.spyOn(globalThis, 'fetch').mockReturnValue(fetchPromise);

    render(<DownloadCell idAten={ID_ATEN} paciente={PACIENTE} />);
    const button = screen.getByRole('button');
    await user.click(button);

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    rejectFetch(new Error('Network error'));

    await waitFor(() => {
      expect(button).not.toHaveAttribute('aria-busy', 'true');
    });
    expect(button).not.toBeDisabled();
  });
});
