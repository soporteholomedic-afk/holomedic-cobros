import type { FileViewer } from './FileViewer';
import { NoPreviewViewer } from './NoPreviewViewer';

/**
 * Factory: returns the first strategy in the chain that matches the
 * given filename. `NoPreviewViewer` is the last entry — it matches
 * everything, so the factory always returns a viewer.
 *
 * Concrete strategies (`PdfViewer`, `TxtViewer`, `ImageViewer`) are
 * added by PR-B1; until then only the `NoPreviewViewer` exists, so
 * every file renders the fallback. The chain order is preserved so
 * the B1 PRs just prepend their strategies.
 */
const VIEWERS: readonly FileViewer[] = [new NoPreviewViewer()];

export function viewerFor(name: string): FileViewer {
  return VIEWERS.find((v) => v.canPreview(name)) ?? new NoPreviewViewer();
}
