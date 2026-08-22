/**
 * Tests for `HistorialNotificaciones` (REQ-02 R4/R5, task 8.1/8.2).
 *
 * Spec R4 (per-client history visualization): on mount the section
 * fetches the audit history (via useCobranzaHistorial) and renders
 * most-recent-first rows, each expandable to recipients/date/status
 * detail, dates in es-PE from stored UTC; zero rows show the
 * empty-state message; junk keys show the informational skip state.
 *
 * Spec R5 (Infocorte extract): "Copiar extracto" places the
 * plain-text chronology on the clipboard via navigator.clipboard,
 * with a textarea+execCommand fallback when the API is unavailable,
 * inline failure text when both fail, and 2s copied feedback.
 *
 * Mocking strategy: fetch at the global boundary (the API route is
 * the only external dependency); navigator.clipboard /
 * document.execCommand per test (browser APIs at the module
 * boundary). HistoryList component-test conventions.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HistorialNotificaciones } from '../HistorialNotificaciones';
import type { CobranzaEnvioHistorial } from '../../../../cobranza/domain/entities';

function envio(overrides: Partial<CobranzaEnvioHistorial> = {}): CobranzaEnvioHistorial {
  return {
    id: 1,
    ruc: '20601234567',
    razonSocial: 'HOLOMEDIC S.A.C.',
    destinatarios: ['contacto@empresa.com'],
    copias: null,
    asunto: 'Recordatorio de pago',
    montoReclamado: null,
    moneda: null,
    comprobantesCount: null,
    estadoEnvio: 'SUCCESS',
    errorDetalle: null,
    enviadoPor: 'María Pérez',
    fechaEnvio: '2026-08-22T14:30:00.000Z',
    ...overrides,
  };
}

const ROWS: CobranzaEnvioHistorial[] = [
  envio({
    id: 2,
    destinatarios: ['a@x.com', 'b@y.com', 'c@z.com'],
    copias: ['copia@empresa.com'],
    montoReclamado: 1234.56,
    moneda: 'S/',
    comprobantesCount: 5,
  }),
  envio({
    id: 1,
    estadoEnvio: 'FAILED',
    errorDetalle: 'SMTP 554 rejected',
    fechaEnvio: '2026-08-21T20:15:00.000Z',
  }),
];

function res(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

/** es-PE short rendering of a stored UTC instant (HistoryList.formatSentAt contract). */
function esPe(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

function stubClipboard(writeText: ReturnType<typeof vi.fn> | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
    writable: true,
  });
}

describe('HistorialNotificaciones', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    stubClipboard(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ---- State 1: loading ----

  it('renders the loading state while the history is in flight', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    render(<HistorialNotificaciones ruc="20601234567" razonSocial="HOLOMEDIC S.A.C." />);

    expect(screen.getByText(/Cargando historial/i)).toBeInTheDocument();
    // The section is framed even while loading (R4 section presence).
    expect(screen.getByText('Historial de Notificaciones')).toBeInTheDocument();
  });

  // ---- State 2: error + Reintentar ----

  it('renders the error state with Reintentar and recovers on retry', async () => {
    fetchMock
      .mockResolvedValueOnce(res({ success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' }, false, 500))
      .mockResolvedValue(res({ success: true, envios: ROWS }));

    render(<HistorialNotificaciones ruc="20601234567" razonSocial="HOLOMEDIC S.A.C." />);

    await waitFor(() => {
      expect(screen.getByText('INTERNAL_ERROR')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    await waitFor(() => {
      expect(screen.getByText('Enviado')).toBeInTheDocument();
    });
  });

  // ---- State 3: empty (R4.2) ----

  it('renders the empty-state message for a client with no audited sends', async () => {
    fetchMock.mockResolvedValue(res({ success: true, envios: [] }));

    render(<HistorialNotificaciones ruc="20601234567" razonSocial="HOLOMEDIC S.A.C." />);

    await waitFor(() => {
      expect(
        screen.getByText('Aún no hay envíos de cobranza registrados para este cliente'),
      ).toBeInTheDocument();
    });
    // The accrual hint (deployment-forward expectation setting, design §4.2).
    expect(screen.getByText(/despliegue/i)).toBeInTheDocument();
    // Copy is present but disabled — nothing to copy (R5 preconditions).
    expect(screen.getByRole('button', { name: /copiar extracto/i })).toBeDisabled();
  });

  // ---- State 4: skipped (junk key, informational) ----

  it('renders the informational skip state for a junk key without fetching', async () => {
    render(<HistorialNotificaciones ruc="CLIENTE SIN NOMBRE" razonSocial="CLIENTE SIN NOMBRE" />);

    await waitFor(() => {
      expect(screen.getByText(/no es válido para consultar/i)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---- Ready: table rendering (R4.1) ----

  it('renders rows most-recent-first with es-PE dates, badges, recipients, amount and sender', async () => {
    fetchMock.mockResolvedValue(res({ success: true, envios: ROWS }));

    render(<HistorialNotificaciones ruc="20601234567" razonSocial="HOLOMEDIC S.A.C." />);

    // Status badges (SUCCESS → 'Enviado', FAILED → 'Error').
    await waitFor(() => {
      expect(screen.getByText('Enviado')).toBeInTheDocument();
    });
    expect(screen.getByText('Error')).toBeInTheDocument();

    // Dates rendered es-PE from stored UTC (not raw ISO).
    expect(screen.getByText(esPe('2026-08-22T14:30:00.000Z'))).toBeInTheDocument();
    expect(screen.getByText(esPe('2026-08-21T20:15:00.000Z'))).toBeInTheDocument();
    expect(screen.queryByText('2026-08-22T14:30:00.000Z')).not.toBeInTheDocument();

    // Recipients summarized (first 2 + rest count, CC count suffix).
    expect(screen.getByText('a@x.com, b@y.com +1 · CC: 1')).toBeInTheDocument();

    // Amount with currency symbol + comprobantes + sender (both rows share it).
    expect(screen.getByText('S/ 1,234.56')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getAllByText('María Pérez')).toHaveLength(2);
  });

  it('renders the em dash for null amount/count cells', async () => {
    fetchMock.mockResolvedValue(res({ success: true, envios: [ROWS[1]] }));

    render(<HistorialNotificaciones ruc="20601234567" razonSocial="HOLOMEDIC S.A.C." />);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2); // monto + comprobantes
  });

  // ---- Expandable rows (R4.1 detail) ----

  it('expands a row to the full recipients/cc lists and the FAILED error detail', async () => {
    fetchMock.mockResolvedValue(res({ success: true, envios: ROWS }));

    render(<HistorialNotificaciones ruc="20601234567" razonSocial="HOLOMEDIC S.A.C." />);

    await waitFor(() => {
      expect(screen.getByText('Enviado')).toBeInTheDocument();
    });

    // Error detail is NOT visible before expanding.
    expect(screen.queryByText('SMTP 554 rejected')).not.toBeInTheDocument();

    const toggles = screen.getAllByRole('button', { name: /ver detalle/i });
    expect(toggles).toHaveLength(2);
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggles[0]); // expand the SUCCESS row
    expect(screen.getAllByRole('button', { name: /ver detalle/i })[0]).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // Full recipient list now visible (no truncation/summary).
    expect(screen.getByText('a@x.com, b@y.com, c@z.com')).toBeInTheDocument();
    expect(screen.getByText(/copia@empresa\.com/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /ver detalle/i })[1]); // FAILED row
    expect(screen.getByText('SMTP 554 rejected')).toBeInTheDocument();
  });

  // ---- Copy extract (R5.1) ----

  it('copies the Infocorte extract via navigator.clipboard and shows 2s feedback', async () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      fetchMock.mockResolvedValue(res({ success: true, envios: ROWS }));

      render(<HistorialNotificaciones ruc="20601234567" razonSocial="HOLOMEDIC S.A.C." />);

      // Flush the fetch→json→setState chain with microtask act flushes —
      // waitFor would hang under fake timers (its poll clock is faked).
      await act(async () => {});
      await act(async () => {});
      expect(screen.getByText('Enviado')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /copiar extracto/i }));

      // Flush the writeText promise resolution (microtasks, not timers).
      await act(async () => {});

      expect(writeText).toHaveBeenCalledTimes(1);
      const extract = writeText.mock.calls[0]?.[0] as string;
      expect(extract).toMatch(/^HISTORIAL DE COBRANZA — HOLOMEDIC S\.A\.C\. \(RUC\/DNI: 20601234567\)\n/);
      expect(extract).toContain('SUCCESS | para: a@x.com, b@y.com, c@z.com');
      expect(extract).toContain('FAILED | para: contacto@empresa.com | error: SMTP 554 rejected');
      expect(extract.split('\n').filter((line) => line.startsWith('['))).toHaveLength(2);

      expect(screen.getByText('¡Extracto copiado!')).toBeInTheDocument();

      // Feedback resets after 2 seconds.
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.queryByText('¡Extracto copiado!')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /copiar extracto/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // ---- Clipboard fallback (R5.2) ----

  it('falls back to the hidden textarea + execCommand when navigator.clipboard is unavailable', async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as unknown as typeof document.execCommand;
    fetchMock.mockResolvedValue(res({ success: true, envios: ROWS }));

    render(<HistorialNotificaciones ruc="20601234567" razonSocial="HOLOMEDIC S.A.C." />);

    await waitFor(() => {
      expect(screen.getByText('Enviado')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /copiar extracto/i }));
    await act(async () => {});

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByText('¡Extracto copiado!')).toBeInTheDocument();
    // The temporary textarea is removed from the DOM after copying.
    expect(document.querySelector('textarea[data-copy-fallback]')).toBeNull();
  });

  it('verifies the fallback textarea value content via selection before removal', async () => {
    // Assert the textarea payload by intercepting execCommand while the
    // node is still attached (the fallback runs synchronously).
    let captured = '';
    const execCommand = vi.fn((): boolean => {
      const node = document.querySelector('textarea[data-copy-fallback]') as HTMLTextAreaElement | null;
      captured = node?.value ?? '';
      return true;
    });
    document.execCommand = execCommand as unknown as typeof document.execCommand;
    fetchMock.mockResolvedValue(res({ success: true, envios: ROWS }));

    render(<HistorialNotificaciones ruc="20601234567" razonSocial="HOLOMEDIC S.A.C." />);

    await waitFor(() => {
      expect(screen.getByText('Enviado')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /copiar extracto/i }));
    await act(async () => {});

    expect(captured).toMatch(/^HISTORIAL DE COBRANZA — HOLOMEDIC S\.A\.C\./);
    expect(captured).toContain('por: María Pérez');
  });

  it('shows inline failure text when both clipboard paths fail', async () => {
    const execCommand = vi.fn().mockReturnValue(false);
    document.execCommand = execCommand as unknown as typeof document.execCommand;
    fetchMock.mockResolvedValue(res({ success: true, envios: ROWS }));

    render(<HistorialNotificaciones ruc="20601234567" razonSocial="HOLOMEDIC S.A.C." />);

    await waitFor(() => {
      expect(screen.getByText('Enviado')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /copiar extracto/i }));
    await act(async () => {});

    expect(screen.getByText(/no se pudo copiar/i)).toBeInTheDocument();
    expect(screen.queryByText('¡Extracto copiado!')).not.toBeInTheDocument();
  });
});
