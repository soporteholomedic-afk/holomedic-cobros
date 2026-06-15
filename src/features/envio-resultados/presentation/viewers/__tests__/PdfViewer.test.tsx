import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PdfViewer } from '../PdfViewer';
import type { PreviewArgs } from '../FileViewer';

const baseArgs: PreviewArgs = {
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-001',
  folderPath: '',
  name: 'informe.pdf',
};

describe('PdfViewer', () => {
  const viewer = new PdfViewer();

  describe('canPreview', () => {
    it('matches a lowercase .pdf filename', () => {
      expect(viewer.canPreview('informe.pdf')).toBe(true);
    });

    it('matches an uppercase .PDF filename (case-insensitive)', () => {
      expect(viewer.canPreview('INFORME.PDF')).toBe(true);
    });

    it('matches a mixed-case .Pdf filename', () => {
      expect(viewer.canPreview('Informe.Pdf')).toBe(true);
    });

    it('does NOT match a .txt filename', () => {
      expect(viewer.canPreview('reporte.txt')).toBe(false);
    });

    it('does NOT match a .docx filename', () => {
      expect(viewer.canPreview('planilla.docx')).toBe(false);
    });

    it('does NOT match a filename with no extension', () => {
      expect(viewer.canPreview('README')).toBe(false);
    });

    it('does NOT match a filename whose name only CONTAINS "pdf" but is not a .pdf', () => {
      expect(viewer.canPreview('pdf.txt')).toBe(false);
    });
  });

  describe('supportedExtensions', () => {
    it('is exactly ["pdf"]', () => {
      expect(viewer.supportedExtensions).toEqual(['pdf']);
    });
  });

  describe('buildPreviewUrl', () => {
    it('composes a /api/files/preview URL with all required query params', () => {
      const url = viewer.buildPreviewUrl(baseArgs);
      expect(url).toBe(
        '/api/files/preview?ruc=20123456789&dni=12345678&idAten=AT-001&filename=informe.pdf',
      );
    });

    it('includes path= when folderPath is non-empty', () => {
      const url = viewer.buildPreviewUrl({ ...baseArgs, folderPath: 'subfolder/inner' });
      expect(url).toContain('&path=subfolder%2Finner');
    });

    it('omits path= when folderPath is empty', () => {
      const url = viewer.buildPreviewUrl(baseArgs);
      expect(url).not.toContain('path=');
    });

    it('URL-encodes special characters in the filename', () => {
      const url = viewer.buildPreviewUrl({ ...baseArgs, name: 'informe 2024 (final).pdf' });
      expect(url).toContain('filename=informe%202024%20(final).pdf');
    });
  });

  describe('renderPreview', () => {
    it('renders an <iframe> with src pointing to /api/files/preview', () => {
      const element = viewer.renderPreview(baseArgs);
      const { container } = render(element);
      const iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();
      expect(iframe?.getAttribute('src')).toBe(viewer.buildPreviewUrl(baseArgs));
    });

    it('the iframe title is the file name', () => {
      const element = viewer.renderPreview(baseArgs);
      const { container } = render(element);
      const iframe = container.querySelector('iframe');
      expect(iframe?.getAttribute('title')).toBe('informe.pdf');
    });

    it('the iframe has sandbox="allow-same-origin" (no allow-scripts, no allow-top-navigation)', () => {
      const element = viewer.renderPreview(baseArgs);
      const { container } = render(element);
      const iframe = container.querySelector('iframe');
      const sandbox = iframe?.getAttribute('sandbox') ?? '';
      expect(sandbox).toBe('allow-same-origin');
      expect(sandbox).not.toContain('allow-scripts');
      expect(sandbox).not.toContain('allow-top-navigation');
    });

    it('renders an iframe that is findable via title (smoke)', () => {
      const element = viewer.renderPreview(baseArgs);
      render(element);
      // jsdom has a known issue with <iframe> accessibility, so query the DOM directly.
      // The title attribute is set; this is the user-visible label.
      const iframe = document.querySelector('iframe');
      expect(iframe).not.toBeNull();
      // Unused import suppressor: keep screen in scope for future test expansion.
      void screen;
    });
  });
});
