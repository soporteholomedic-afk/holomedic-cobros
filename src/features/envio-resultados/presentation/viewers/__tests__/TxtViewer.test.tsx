import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TxtViewer } from '../TxtViewer';
import type { PreviewArgs } from '../FileViewer';

const baseArgs: PreviewArgs = {
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-001',
  folderPath: '',
  name: 'reporte.txt',
};

describe('TxtViewer', () => {
  const viewer = new TxtViewer();

  describe('canPreview', () => {
    it('matches a lowercase .txt filename', () => {
      expect(viewer.canPreview('reporte.txt')).toBe(true);
    });

    it('matches an uppercase .TXT filename (case-insensitive)', () => {
      expect(viewer.canPreview('REPORTE.TXT')).toBe(true);
    });

    it('does NOT match a .pdf filename', () => {
      expect(viewer.canPreview('informe.pdf')).toBe(false);
    });

    it('does NOT match a .csv filename (csv is NOT txt in v1)', () => {
      expect(viewer.canPreview('datos.csv')).toBe(false);
    });
  });

  describe('supportedExtensions', () => {
    it('is exactly ["txt"]', () => {
      expect(viewer.supportedExtensions).toEqual(['txt']);
    });
  });

  describe('buildPreviewUrl', () => {
    it('composes a /api/files/preview URL pointing at the txt file', () => {
      const url = viewer.buildPreviewUrl(baseArgs);
      expect(url).toBe(
        '/api/files/preview?ruc=20123456789&dni=12345678&idAten=AT-001&filename=reporte.txt',
      );
    });

    it('includes path= when folderPath is non-empty', () => {
      const url = viewer.buildPreviewUrl({ ...baseArgs, folderPath: 'subfolder/inner' });
      expect(url).toContain('&path=subfolder%2Finner');
    });
  });

  describe('renderPreview (async fetch in component)', () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('renders a "Cargando…" placeholder inside the <pre> slot on mount', () => {
      // Never-resolving fetch to keep the loading state visible.
      globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
      const element = viewer.renderPreview(baseArgs);
      render(element);
      const pre = document.querySelector('pre');
      expect(pre).not.toBeNull();
      expect(pre?.textContent).toBe('Cargando…');
    });

    it('renders the resolved text inside <pre class="whitespace-pre-wrap max-h-96 overflow-y-auto"> after fetch resolves', async () => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        text: async () => 'Línea uno\nLínea dos con espacios',
      })) as unknown as typeof fetch;
      const element = viewer.renderPreview(baseArgs);
      render(element);
      const pre = document.querySelector('pre');
      await waitFor(() => {
        expect(pre?.textContent).toBe('Línea uno\nLínea dos con espacios');
      });
      expect(pre?.className).toContain('whitespace-pre-wrap');
      expect(pre?.className).toContain('max-h-96');
      expect(pre?.className).toContain('overflow-y-auto');
    });

    it('calls fetch() with the buildPreviewUrl result', async () => {
      const fetchSpy = vi.fn(async () => ({
        ok: true,
        text: async () => 'x',
      })) as unknown as typeof fetch;
      globalThis.fetch = fetchSpy;
      const element = viewer.renderPreview(baseArgs);
      render(element);
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(viewer.buildPreviewUrl(baseArgs));
      });
    });

    it('renders an error message and a "Reintentar" button when fetch fails', async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch;
      const element = viewer.renderPreview(baseArgs);
      render(element);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
      });
    });

    it('clicking "Reintentar" re-issues the fetch', async () => {
      // Mount fresh with a failing fetch first, then a successful one on retry.
      const fetchSpy = vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({
          ok: true,
          text: async () => 'after retry',
        } as Response) as unknown as typeof fetch;
      globalThis.fetch = fetchSpy;
      const element = viewer.renderPreview({ ...baseArgs, name: 'retry-target.txt' });
      const { container } = render(element);
      const retryBtn = await screen.findByRole('button', { name: 'Reintentar' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const user = userEvent.setup();
      await act(async () => {
        await user.click(retryBtn);
      });
      await waitFor(() => {
        expect(container.querySelector('pre')?.textContent).toBe('after retry');
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
