import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImageViewer } from '../ImageViewer';
import type { PreviewArgs } from '../FileViewer';

const baseArgs: PreviewArgs = {
  ruc: '20123456789',
  dni: '12345678',
  idAten: 'AT-001',
  folderPath: '',
  name: 'foto.jpg',
};

describe('ImageViewer', () => {
  const viewer = new ImageViewer();

  describe('canPreview', () => {
    it('matches .jpg', () => {
      expect(viewer.canPreview('foto.jpg')).toBe(true);
    });

    it('matches .jpeg', () => {
      expect(viewer.canPreview('foto.jpeg')).toBe(true);
    });

    it('matches .png', () => {
      expect(viewer.canPreview('logo.png')).toBe(true);
    });

    it('matches .gif', () => {
      expect(viewer.canPreview('anim.gif')).toBe(true);
    });

    it('matches .webp', () => {
      expect(viewer.canPreview('modern.webp')).toBe(true);
    });

    it('matches uppercase extensions (.JPG, .PNG)', () => {
      expect(viewer.canPreview('FOTO.JPG')).toBe(true);
      expect(viewer.canPreview('FOTO.PNG')).toBe(true);
    });

    it('does NOT match .pdf', () => {
      expect(viewer.canPreview('informe.pdf')).toBe(false);
    });

    it('does NOT match .bmp (not in v1 supported set)', () => {
      expect(viewer.canPreview('old.bmp')).toBe(false);
    });

    it('does NOT match .svg (intentionally excluded — could host scripts)', () => {
      expect(viewer.canPreview('icon.svg')).toBe(false);
    });

    it('does NOT match .tiff', () => {
      expect(viewer.canPreview('scan.tiff')).toBe(false);
    });
  });

  describe('supportedExtensions', () => {
    it('contains the five supported extensions', () => {
      expect(viewer.supportedExtensions).toEqual(
        expect.arrayContaining(['jpg', 'jpeg', 'png', 'gif', 'webp']),
      );
      expect(viewer.supportedExtensions).toHaveLength(5);
    });
  });

  describe('buildPreviewUrl', () => {
    it('composes a /api/files/preview URL with the filename', () => {
      const url = viewer.buildPreviewUrl(baseArgs);
      expect(url).toBe(
        '/api/files/preview?ruc=20123456789&dni=12345678&idAten=AT-001&filename=foto.jpg',
      );
    });

    it('includes path= when folderPath is non-empty', () => {
      const url = viewer.buildPreviewUrl({ ...baseArgs, folderPath: 'subfolder' });
      expect(url).toContain('&path=subfolder');
    });
  });

  describe('renderPreview', () => {
    it('renders an <img> with src pointing to /api/files/preview', () => {
      const element = viewer.renderPreview(baseArgs);
      const { container } = render(element);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe(viewer.buildPreviewUrl(baseArgs));
    });

    it('the <img> alt is the file name', () => {
      const element = viewer.renderPreview(baseArgs);
      const { container } = render(element);
      const img = container.querySelector('img');
      expect(img?.getAttribute('alt')).toBe('foto.jpg');
    });

    it('the <img> has className for object-contain + max sizing', () => {
      const element = viewer.renderPreview(baseArgs);
      const { container } = render(element);
      const img = container.querySelector('img');
      // React sets the JSX `className` prop as the DOM `class` attribute.
      const className = img?.getAttribute('class') ?? '';
      expect(className).toContain('object-contain');
      expect(className).toContain('max-h-full');
      expect(className).toContain('max-w-full');
    });
  });
});
