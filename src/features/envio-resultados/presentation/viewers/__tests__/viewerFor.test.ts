import { describe, expect, it } from 'vitest';
import { viewerFor } from '../viewerFor';
import { PdfViewer } from '../PdfViewer';
import { TxtViewer } from '../TxtViewer';
import { ImageViewer } from '../ImageViewer';
import { NoPreviewViewer } from '../NoPreviewViewer';

describe('viewerFor (Factory)', () => {
  describe('truth table — first matching strategy wins', () => {
    it('returns a PdfViewer for foo.pdf', () => {
      expect(viewerFor('foo.pdf')).toBeInstanceOf(PdfViewer);
    });

    it('returns a PdfViewer for FOO.PDF (case-insensitive)', () => {
      expect(viewerFor('FOO.PDF')).toBeInstanceOf(PdfViewer);
    });

    it('returns a TxtViewer for foo.txt', () => {
      expect(viewerFor('foo.txt')).toBeInstanceOf(TxtViewer);
    });

    it('returns a TxtViewer for FOO.TXT (case-insensitive)', () => {
      expect(viewerFor('FOO.TXT')).toBeInstanceOf(TxtViewer);
    });

    it('returns an ImageViewer for foo.jpg', () => {
      expect(viewerFor('foo.jpg')).toBeInstanceOf(ImageViewer);
    });

    it('returns an ImageViewer for foo.jpeg', () => {
      expect(viewerFor('foo.jpeg')).toBeInstanceOf(ImageViewer);
    });

    it('returns an ImageViewer for foo.png', () => {
      expect(viewerFor('foo.png')).toBeInstanceOf(ImageViewer);
    });

    it('returns an ImageViewer for foo.gif', () => {
      expect(viewerFor('foo.gif')).toBeInstanceOf(ImageViewer);
    });

    it('returns an ImageViewer for foo.webp', () => {
      expect(viewerFor('foo.webp')).toBeInstanceOf(ImageViewer);
    });

    it('returns an ImageViewer for FOO.JPG (case-insensitive)', () => {
      expect(viewerFor('FOO.JPG')).toBeInstanceOf(ImageViewer);
    });

    it('returns a NoPreviewViewer for foo.xlsx (Office — not previewable in v1)', () => {
      expect(viewerFor('foo.xlsx')).toBeInstanceOf(NoPreviewViewer);
    });

    it('returns a NoPreviewViewer for foo.docx (Office — not previewable in v1)', () => {
      expect(viewerFor('foo.docx')).toBeInstanceOf(NoPreviewViewer);
    });

    it('returns a NoPreviewViewer for foo.csv (intentionally NOT text in v1)', () => {
      expect(viewerFor('foo.csv')).toBeInstanceOf(NoPreviewViewer);
    });

    it('returns a NoPreviewViewer for a filename with no extension', () => {
      expect(viewerFor('README')).toBeInstanceOf(NoPreviewViewer);
    });

    it('returns a NoPreviewViewer for the empty string', () => {
      expect(viewerFor('')).toBeInstanceOf(NoPreviewViewer);
    });
  });

  describe('factory contract', () => {
    it('always returns an instance of FileViewer — never undefined or null', () => {
      const v = viewerFor('whatever.xyz');
      expect(v).toBeDefined();
      expect(v).not.toBeNull();
      expect(typeof v.canPreview).toBe('function');
      expect(typeof v.buildPreviewUrl).toBe('function');
      expect(typeof v.renderPreview).toBe('function');
    });
  });
});
