import type { ReactElement } from 'react';

/**
 * Arguments passed to a `FileViewer` strategy when building its
 * preview URL or rendering its element. The viewer does NOT need all
 * fields — `textContent` is for the `TxtViewer` only and the rest
 * compose the API URL.
 */
export interface PreviewArgs {
  ruc: string;
  dni: string;
  idAten: string;
  /** The current folder path inside the patient's tree. `''` for root. */
  folderPath: string;
  name: string;
  /** For text viewers, the resolved text body (fetched in-component). */
  textContent?: string;
}

/**
 * Strategy interface for the file-viewer GoF pattern. Each previewable
 * file type (`pdf`, `txt`, image) has its own concrete strategy; the
 * factory (`viewerFor(name)`) picks the right one.
 *
 * The `viewerFor` factory is the only place where concrete viewer
 * classes are instantiated — the modal never imports the concrete
 * strategies directly.
 */
export interface FileViewer {
  /** Lowercased extensions this viewer matches (without the leading dot). */
  readonly supportedExtensions: readonly string[];
  canPreview(name: string): boolean;
  buildPreviewUrl(args: PreviewArgs): string;
  renderPreview(args: PreviewArgs): ReactElement;
}
