import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoPreviewViewer } from '../NoPreviewViewer';
import type { PreviewArgs } from '../FileViewer';

const baseArgs: PreviewArgs = {
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-001',
  folderPath: '',
  name: 'planilla.xlsx',
};

describe('NoPreviewViewer', () => {
  const viewer = new NoPreviewViewer();

  describe('canPreview (fallback strategy)', () => {
    it('returns true for any filename — it is the fallback', () => {
      expect(viewer.canPreview('foo.pdf')).toBe(true);
      expect(viewer.canPreview('bar.txt')).toBe(true);
      expect(viewer.canPreview('baz.png')).toBe(true);
      expect(viewer.canPreview('planilla.xlsx')).toBe(true);
      expect(viewer.canPreview('archivo.docx')).toBe(true);
    });

    it('returns true even for filenames with no extension', () => {
      expect(viewer.canPreview('README')).toBe(true);
    });

    it('returns true even for the empty string', () => {
      expect(viewer.canPreview('')).toBe(true);
    });
  });

  describe('supportedExtensions', () => {
    it('is an empty array (the fallback does not "own" any extension)', () => {
      expect(viewer.supportedExtensions).toEqual([]);
    });
  });

  describe('buildPreviewUrl', () => {
    it('returns the empty string — the fallback does not load anything from the server', () => {
      expect(viewer.buildPreviewUrl(baseArgs)).toBe('');
    });
  });

  describe('renderPreview', () => {
    it('renders the Spanish "no preview" message', () => {
      const element = viewer.renderPreview(baseArgs);
      const { container } = render(element);
      expect(container.textContent).toContain('No hay vista previa disponible para este tipo de archivo');
    });

    it('renders a "Descargar" link with the correct href (root folder)', () => {
      const element = viewer.renderPreview(baseArgs);
      const { container } = render(element);
      const link = container.querySelector('a');
      expect(link).not.toBeNull();
      expect(link?.textContent?.trim()).toBe('Descargar');
      expect(link?.getAttribute('href')).toBe(
        '/api/files/download?ruc=20123456789&dni=12345678&idAten=AT-001&filename=planilla.xlsx',
      );
    });

    it('renders a "Descargar" link with the correct href (subfolder)', () => {
      const element = viewer.renderPreview({ ...baseArgs, folderPath: 'subfolder/inner' });
      const { container } = render(element);
      const link = container.querySelector('a');
      expect(link?.getAttribute('href')).toBe(
        '/api/files/download?ruc=20123456789&dni=12345678&idAten=AT-001&path=subfolder%2Finner&filename=planilla.xlsx',
      );
    });

    it('the Descargar link targets the /api/files/download route (NOT /preview)', () => {
      const element = viewer.renderPreview(baseArgs);
      const { container } = render(element);
      const link = container.querySelector('a');
      const href = link?.getAttribute('href') ?? '';
      expect(href.startsWith('/api/files/download?')).toBe(true);
      expect(href.startsWith('/api/files/preview?')).toBe(false);
    });

    it('the Descargar link has the `download` attribute (browser will save, not navigate)', () => {
      const element = viewer.renderPreview(baseArgs);
      const { container } = render(element);
      const link = container.querySelector('a');
      expect(link?.hasAttribute('download')).toBe(true);
    });
  });
});
