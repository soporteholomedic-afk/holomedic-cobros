import type { ReactElement } from 'react';
import { X } from 'lucide-react';
import type { FileViewer, PreviewArgs } from './FileViewer';

/**
 * Fallback strategy. Always matches (its `canPreview` returns `true`
 * for every input). The factory MUST place it last in the chain so
 * it's only used when no concrete strategy matches.
 *
 * Renders a "no preview available" message in Spanish plus a
 * "Descargar" link that targets `/api/files/download` for the
 * same file.
 */
export class NoPreviewViewer implements FileViewer {
  readonly supportedExtensions: readonly string[] = [];

  canPreview(_name: string): boolean {
    return true;
  }

  buildPreviewUrl(_args: PreviewArgs): string {
    // No preview URL — the no-preview strategy does not load anything
    // from the server. Returning the empty string keeps the type
    // contract satisfied; renderers MUST NOT use it for an iframe/img.
    return '';
  }

  renderPreview(args: PreviewArgs): ReactElement {
    const href =
      `/api/files/download?ruc=${encodeURIComponent(args.ruc)}` +
      `&dni=${encodeURIComponent(args.dni)}` +
      `&idAten=${encodeURIComponent(args.idAten)}` +
      (args.folderPath === '' ? '' : `&path=${encodeURIComponent(args.folderPath)}`) +
      `&filename=${encodeURIComponent(args.name)}`;
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
        <X className="w-10 h-10 text-slate-300" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No hay vista previa disponible para este tipo de archivo
        </p>
        <a
          href={href}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100"
          download
        >
          Descargar
        </a>
      </div>
    );
  }
}
