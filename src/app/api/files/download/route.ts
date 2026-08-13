import { NextResponse } from 'next/server';
import { getFileRepository } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import { sanitizeDownloadName, sanitizeFolderPath } from '@/lib/sanitize-filename';
import { renameReadyFile } from '@/features/envio-resultados/domain/ready-files/renameReadyFile';
import { renameGeneratedCertificate } from '@/features/envio-resultados/domain/generated-files/renameGeneratedCertificate';
import { normalizeTipoExamen } from '@/features/envio-resultados/domain/ready-files/normalizeTipoExamen';

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
 * GET /api/files/download?ruc&dni&idAten&path&filename
 *
 * Streams a single file from the patient's archive folder on the LAN
 * share. The path composition and `fs` calls live inside the
 * `IFileRepository.read` adapter so this route stays a thin shell.
 *
 * The optional `?path=` parameter (added in PR-B1) targets a
 * subfolder within the patient's archive; when missing, the file is
 * fetched from the root (the `idAten` folder).
 *
 * Path-traversal defense is two-layer:
 *
 * 1. `sanitizeFolderPath` rejects `..`, leading `/`, or leading `\\`
 *    in `?path=` after URL-decoding.
 * 2. `sanitizeDownloadName` rejects any value containing `..`, `/`,
 *    or `\\` in `?filename=` after URL-decoding.
 * 3. The adapter's `read` re-asserts containment under the patient
 *    root before issuing the `createReadStream` call.
 *
 * Status codes:
 * - 200: streams the file with `Content-Disposition: attachment`.
 * - 400: missing args, non-digit `dni`, path traversal attempt, or a
 *   `tipoExamen` value outside `{CAMO, EMO, ADICIONAL}`.
 * - 404: file does not exist on the share.
 * - 502: share unreachable / I/O error.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const ruc = searchParams.get('ruc')?.trim() ?? '';
  const dni = searchParams.get('dni')?.trim() ?? '';
  const idAten = searchParams.get('idAten')?.trim() ?? '';
  const rawPath = searchParams.get('path') ?? '';
  const rawName = searchParams.get('filename') ?? '';
  const nombreCompleto = searchParams.get('nombreCompleto') ?? '';
  const destino = searchParams.get('destino') ?? '';
  const rawTipoExamen = searchParams.get('tipoExamen') ?? undefined;
  const tipoExamen = normalizeTipoExamen(rawTipoExamen);

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
  if (rawTipoExamen !== undefined && rawTipoExamen.trim() !== '' && tipoExamen === undefined) {
    return NextResponse.json(
      { error: 'tipoExamen inválido. Debe ser CAMO, EMO o ADICIONAL.' },
      { status: 400 },
    );
  }

  let safePath: string;
  try {
    safePath = sanitizeFolderPath(rawPath);
  } catch (err) {
    console.warn('[api/files/download] invalid path', { rawPath, err });
    return NextResponse.json({ error: 'path inválido.' }, { status: 400 });
  }

  let safe: string;
  try {
    safe = sanitizeDownloadName(rawName);
  } catch (err) {
    console.warn('[api/files/download] invalid filename', { rawName, err });
    return NextResponse.json({ error: 'filename inválido.' }, { status: 400 });
  }

  const readyName = renameReadyFile({ rawName: safe, nombreCompleto, destino, tipoExamen });
  const deliveryName =
    readyName === safe
      ? renameGeneratedCertificate({ rawName: safe, nombreCompleto, tipoExamen })
      : readyName;

  try {
    const stream = await getFileRepository().read(ruc, dni, idAten, safePath, safe);
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': mimeFromExt(deliveryName),
        'Content-Disposition': `attachment; filename="${deliveryName.replace(/"/g, '')}"`,
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
    console.warn('[api/files/download] read error', { ruc, dni, idAten, path: safePath, name: safe, err });
    return NextResponse.json(
      { error: 'No se pudo acceder al servidor de archivos.' },
      { status: 502 },
    );
  }
}
