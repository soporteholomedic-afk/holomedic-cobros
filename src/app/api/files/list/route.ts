import { NextResponse } from 'next/server';
import { getFileRepository } from '@/features/envio-resultados/infrastructure/files/getFileRepository';

/**
 * GET /api/files/list?ruc&dni&idAten
 *
 * Returns the file listing for a single patient archive folder on the
 * LAN share (`\\172.16.10.12\sigla\{ruc}\{dni}\{idAten}`). The
 * repository is responsible for the actual `fs` call; the route only
 * validates inputs, translates I/O failures into a 502, and serializes
 * the response.
 *
 * Status codes:
 * - 200: `{ files: FileEntry[] }` (possibly empty)
 * - 400: missing or empty `ruc`/`dni`/`idAten`, or `dni` not digit-only
 * - 502: UNC share unreachable (the OS returned an I/O error)
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const ruc = searchParams.get('ruc')?.trim() ?? '';
  const dni = searchParams.get('dni')?.trim() ?? '';
  const idAten = searchParams.get('idAten')?.trim() ?? '';

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

  try {
    const files = await getFileRepository().list(ruc, dni, idAten);
    return NextResponse.json({ files });
  } catch (err) {
    console.warn('[api/files/list] UNC error', { ruc, dni, idAten, err });
    return NextResponse.json(
      { error: 'No se pudo acceder al servidor de archivos.' },
      { status: 502 },
    );
  }
}
