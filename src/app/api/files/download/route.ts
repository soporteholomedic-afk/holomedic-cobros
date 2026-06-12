import { createReadStream, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import { sanitizeDownloadName } from '@/lib/sanitize-filename';

/** Files larger than this emit a structured `console.warn`. Not surfaced. */
const SIZE_WARN_BYTES = 50 * 1024 * 1024;

const BASE_PATH = process.env.FILE_SERVER_BASE_PATH ?? '';

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
 * share. Two layers of path-traversal defense:
 *
 * 1. `sanitizeDownloadName` rejects any value containing `..`, `/`,
 *    or `\\` after URL-decoding.
 * 2. The composed path is `path.resolve`-d and asserted to remain
 *    under the folder — defense in depth in case a future code path
 *    forgets to sanitize.
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

  const folder = path.win32.join(BASE_PATH, ruc, dni, idAten);
  const full = path.win32.resolve(folder, safe);
  const resolvedFolder = path.win32.resolve(folder);
  if (
    full !== resolvedFolder &&
    !full.startsWith(resolvedFolder + path.win32.sep)
  ) {
    console.warn('[api/files/download] path traversal attempt', { rawName, full });
    return NextResponse.json({ error: 'filename inválido.' }, { status: 400 });
  }

  let stat;
  try {
    stat = await fs.stat(full);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        { error: 'Archivo no encontrado.' },
        { status: 404 },
      );
    }
    console.warn('[api/files/download] stat error', { full, err });
    return NextResponse.json(
      { error: 'No se pudo acceder al servidor de archivos.' },
      { status: 502 },
    );
  }

  if (stat.size > SIZE_WARN_BYTES) {
    console.warn('[api/files/download] large file', { name: safe, size: stat.size });
  }

  const stream = createReadStream(full);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': mimeFromExt(safe),
      'Content-Disposition': `attachment; filename="${safe.replace(/"/g, '')}"`,
      'Content-Length': String(stat.size),
    },
  });
}
