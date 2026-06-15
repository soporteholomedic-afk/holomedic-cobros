import type { ReactElement } from 'react';
import type { FileViewer, PreviewArgs } from './FileViewer';

/**
 * Strategy: image files. Supports the five common browser-renderable
 * extensions: `jpg`, `jpeg`, `png`, `gif`, `webp`. `.svg` is
 * intentionally excluded because SVG can host inline scripts and
 * would require a sanitization step we don't want in v1.
 *
 * The image is rendered with `object-contain` so it scales to fit
 * the preview pane without distortion or overflow.
 */
export class ImageViewer implements FileViewer {
  readonly supportedExtensions: readonly string[] = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

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
      // `<img>` is intentional: the src is a dynamic UNC-served file
      // URL that `next/image` cannot optimize (no known width/height,
      // no remotePatterns whitelist). The browser-native renderer is
      // exactly what we want here — see REQ-FE-13.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={this.buildPreviewUrl(args)}
        alt={args.name}
        className="object-contain max-h-full max-w-full"
      />
    );
  }
}
