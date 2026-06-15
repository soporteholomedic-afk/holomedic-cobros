import type { FileViewer } from './FileViewer';
import { PdfViewer } from './PdfViewer';
import { TxtViewer } from './TxtViewer';
import { ImageViewer } from './ImageViewer';
import { NoPreviewViewer } from './NoPreviewViewer';

/**
 * Factory: returns the first strategy in the chain that matches the
 * given filename. `NoPreviewViewer` is the last entry — it matches
 * everything, so the factory always returns a viewer.
 *
 * The `viewerFor` factory is the only place where concrete viewer
 * classes are instantiated — the modal never imports them directly.
 *
 * Order matters: concrete strategies come first (most specific), the
 * `NoPreviewViewer` fallback comes last. Adding a new previewable
 * type means adding one line here.
 */
const VIEWERS: readonly FileViewer[] = [
  new PdfViewer(),
  new TxtViewer(),
  new ImageViewer(),
  new NoPreviewViewer(),
];

export function viewerFor(name: string): FileViewer {
  return VIEWERS.find((v) => v.canPreview(name)) ?? new NoPreviewViewer();
}
