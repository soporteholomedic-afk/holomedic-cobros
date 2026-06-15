import type { ReactElement } from 'react';
import type { FileViewer, PreviewArgs } from './FileViewer';

/**
 * Strategy: PDF files. Renders a browser-native PDF viewer inside an
 * `<iframe>`. We intentionally do NOT use `react-pdf` / `pdfjs-dist` in
 * v1 (deferred to a follow-up change) — the iframe lets the browser
 * handle rendering, scrolling, and download.
 *
 * We do NOT apply the `sandbox` attribute to the `<iframe>` because
 * Chromium-based browsers (Chrome, Brave, Edge) completely disable
 * built-in PDF viewer plugins inside sandboxed iframes, resulting
 * in a blocked content error.
 */
export class PdfViewer implements FileViewer {
  readonly supportedExtensions: readonly string[] = ['pdf'];

  canPreview(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    return this.supportedExtensions.includes(ext);
  }

  buildPreviewUrl(args: PreviewArgs): string {
    return (
      `/api/files/preview?ruc=${encodeURIComponent(args.ruc)}` +
      `&dni=${encodeURIComponent(args.dni)}` +
      `&idAten=${encodeURIComponent(args.idAten)}` +
      (args.folderPath === '' ? '' : `&path=${encodeURIComponent(args.folderPath)}`) +
      `&filename=${encodeURIComponent(args.name)}`
    );
  }

  renderPreview(args: PreviewArgs): ReactElement {
    return (
      <iframe
        src={this.buildPreviewUrl(args)}
        title={args.name}
        className="w-full h-full"
      />
    );
  }
}
