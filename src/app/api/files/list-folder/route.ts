import { NextResponse } from 'next/server';
import { getFileRepository } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import { sanitizeFolderPath } from '@/lib/sanitize-filename';

/**
 * GET /api/files/list-folder?ruc&dni&idAten&path
 *
 * Returns the folder listing (folders + files) for the requested
 * folder on the LAN share (`\\172.16.10.12\sigla\{ruc}\{dni}\{idAten}\{path}`).
 *
 * The repository owns the actual `fs` calls; the route only validates
 * inputs, translates I/O failures into a 502, and serializes the
 * response.
 *
 * Path-traversal defense is two-layer:
 *
 * 1. `sanitizeFolderPath` rejects `..`, URL-encoded variants, and
 *    leading separators after URL-decoding.
 * 2. The repository's `listFolder` re-asserts containment under the
 *    patient root via `path.win32.resolve`.
 *
 * Status codes:
 * - 200: `{ nodes: FileSystemNode[] }` (possibly empty — empty folder
 *   or missing folder returns `{ nodes: [] }`, NOT 404)
 * - 400: missing `ruc` / `dni` / `idAten`, non-digit `dni`, or
 *   path-traversal attempt
 * - 502: UNC share unreachable (the OS returned an I/O error)
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const ruc = searchParams.get('ruc')?.trim() ?? '';
  const dni = searchParams.get('dni')?.trim() ?? '';
  const idAten = searchParams.get('idAten')?.trim() ?? '';
  const rawPath = searchParams.get('path') ?? '';

  if (!ruc || !dni || !idAten) {
    return NextResponse.json(
      { error: 'Faltan parámetros requeridos (ruc, dni, idAten).' },
      { status: 400 },
    );
  }
  if (!/^\d+$/.test(dni)) {
    return NextResponse.json(
      { error: 'dni debe ser numérico.' },
      { status: 400 },
    );
  }

  let safePath: string;
  try {
    safePath = sanitizeFolderPath(rawPath);
  } catch (err) {
    console.warn('[api/files/list-folder] path traversal attempt', { rawPath, err });
    return NextResponse.json({ error: 'path inválido.' }, { status: 400 });
  }

  try {
    const nodes = await getFileRepository().listFolder(ruc, dni, idAten, safePath);
    return NextResponse.json({ nodes });
  } catch (err) {
    console.warn('[api/files/list-folder] UNC error', { ruc, dni, idAten, safePath, err });
    return NextResponse.json(
      { error: 'No se pudo acceder al servidor de archivos.' },
      { status: 502 },
    );
  }
}
