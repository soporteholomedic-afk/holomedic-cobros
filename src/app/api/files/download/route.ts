import { NextResponse } from 'next/server';
import { getFileRepository } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import { sanitizeDownloadName } from '@/lib/sanitize-filename';

/** Minimal content-type lookup by extension. */
function mimeFromExt(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'txt' || ext === 'csv') return 'text/plain; charset=utf-8';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'doc') return 'application/msword';
  if (ext === 'docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'zip') return 'application/zip';
  if (ext === 'rar') return 'application/vnd.rar';
  if (ext === '7z') return 'application/x-7z-compressed';
  return 'application/octet-stream';
}

/**
 * GET /api/files/download?ruc&dni&idAten&filename
 *
 * Streams a single file from the patient's archive folder on the LAN
 * share. The path composition and `fs` calls live inside the
 * `IFileRepository.read` adapter so this route stays a thin shell.
 *
 * Path-traversal defense is two-layer:
 *
 * 1. `sanitizeDownloadName` rejects any value containing `..`, `/`,
 *    or `\\` after URL-decoding.
 * 2. The adapter's `read` re-asserts containment under the patient
 *    root before issuing the `createReadStream` call.
 *
 * The `?path=` subfolder parameter is added in PR-B1 (the preview
 * data layer).
 *
 * Status codes:
 * - 200: streams the file with `Content-Disposition: attachment`.
 * - 400: missing args, non-digit `dni`, or path traversal attempt.
 * - 404: file does not exist on the share.
 * - 502: share unreachable / I/O error.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const ruc = searchParams.get('ruc')?.trim() ?? '';
  const dni = searchParams.get('dni')?.trim() ?? '';
  const idAten = searchParams.get('idAten')?.trim() ?? '';
  const rawName = searchParams.get('filename') ?? '';

  if (!ruc || !dni || !idAten || !rawName) {
    return NextResponse.json(
      { error: 'Faltan parámetros requeridos (ruc, dni, idAten, filename).' },
      { status: 400 },
    );
  }
  if (!/^\d+$/.test(dni)) {
    return NextResponse.json(
      { error: 'dni debe ser numérico.' },
      { status: 400 },
    );
  }

  let safe: string;
  try {
    safe = sanitizeDownloadName(rawName);
  } catch (err) {
    console.warn('[api/files/download] invalid filename', { rawName, err });
    return NextResponse.json({ error: 'filename inválido.' }, { status: 400 });
  }

  try {
    const stream = await getFileRepository().read(ruc, dni, idAten, '', safe);
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': mimeFromExt(safe),
        'Content-Disposition': `attachment; filename="${safe.replace(/"/g, '')}"`,
      },
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return NextResponse.json(
        { error: 'Archivo no encontrado.' },
        { status: 404 },
      );
    }
    console.warn('[api/files/download] read error', { ruc, dni, idAten, name: safe, err });
    return NextResponse.json(
      { error: 'No se pudo acceder al servidor de archivos.' },
      { status: 502 },
    );
  }
}
