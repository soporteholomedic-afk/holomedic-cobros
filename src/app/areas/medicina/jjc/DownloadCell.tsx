'use client';

import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';

interface DownloadCellProps {
  idAten: string;
  paciente: string;
  /** Override the PDF endpoint. Defaults to the medicina JJC route. */
  apiPath?: string;
}

const MEDICINA_PDF_API = (idAten: string) =>
  `/api/areas/medicina/jjc/${idAten}/pdf`;

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build the download filename for an API path.
 *
 * - Without `apiPath` (medicina default) the legacy `jjc-{idAten}.pdf`
 *   filename is preserved byte-for-byte.
 * - With a custom `apiPath` the area segment is extracted and sanitized:
 *   `/api/areas/<area>/jjc/<idAten>/pdf` → `<area>-jjc-<idAten>.pdf`.
 */
export function buildDownloadFileName(
  apiPath: string | undefined,
  idAten: string,
): string {
  if (!apiPath) return `jjc-${idAten}.pdf`;
  const match = apiPath.match(/\/api\/areas\/([^/]+)\/jjc\//);
  const area = match ? sanitizeSegment(match[1]) : 'descarga';
  const safeId = sanitizeSegment(idAten) || 'atencion';
  return `${area}-jjc-${safeId}.pdf`;
}

export function DownloadCell({ idAten, paciente, apiPath }: DownloadCellProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const res = await fetch(apiPath ?? MEDICINA_PDF_API(idAten));

      if (!res.ok) {
        if (res.status === 404) {
          toast.error('Atención no encontrada', {
            description: 'No se pudo generar el PDF para esta atención.',
          });
        } else if (res.status === 502) {
          toast.error('No se pudo conectar a la base de datos, reintentá', {
            description:
              'Ocurrió un error de conexión al generar el PDF. Intentalo de nuevo más tarde.',
          });
        } else {
          toast.error('Error al generar el PDF', {
            description:
              'Ocurrió un error inesperado al generar el PDF. Intentalo de nuevo.',
          });
        }
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = buildDownloadFileName(apiPath, idAten);
      anchor.click();

      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error('Error al generar el PDF', {
        description:
          'Ocurrió un error inesperado al generar el PDF. Intentalo de nuevo.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isLoading}
      aria-busy={isLoading}
      aria-label={`Descargar PDF de ${paciente}`}
      title="Descargar PDF"
      className="inline-flex items-center justify-center p-2 rounded-md text-slate-500 hover:text-sky-700 hover:bg-sky-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FileDown className="w-4 h-4" />
    </button>
  );
}
