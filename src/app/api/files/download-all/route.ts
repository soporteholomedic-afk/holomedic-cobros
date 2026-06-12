import { createReadStream } from 'node:fs';
import * as path from 'node:path';
import { NextResponse } from 'next/server';
import { sanitizeZipName } from '@/lib/sanitize-filename';
import { UncFileRepository } from '@/features/envio-resultados/infrastructure/files/UncFileRepository';
import { getFileRepository } from '@/features/envio-resultados/infrastructure/files/getFileRepository';

const BASE_PATH = process.env.FILE_SERVER_BASE_PATH ?? '';

/**
 * GET /api/files/download-all?ruc&dni&idAten&nombrePaciente&empresa
 *
 * Streams a server-side ZIP of every file in the patient's folder.
 * The archive is produced by `archiver` in STORE mode and piped
 * directly into the response body — nothing is buffered in memory.
 *
 * Status codes:
 * - 200: zip stream (possibly empty folder → still a valid 22-byte empty zip).
 * - 400: missing args or non-digit `dni`.
 * - 502: the UNC share is unreachable at the start of the operation.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const ruc = searchParams.get('ruc')?.trim() ?? '';
  const dni = searchParams.get('dni')?.trim() ?? '';
  const idAten = searchParams.get('idAten')?.trim() ?? '';
  const nombre = searchParams.get('nombrePaciente') ?? '';
  const empresa = searchParams.get('empresa') ?? '';

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

  const repo = getFileRepository();
  const files = await repo.list(ruc, dni, idAten).catch((err: unknown) => {
    console.warn('[api/files/download-all] list error', { ruc, dni, idAten, err });
    return null;
  });
  if (files === null) {
    return NextResponse.json(
      { error: 'No se pudo acceder al servidor de archivos.' },
      { status: 502 },
    );
  }

  // Sanitized filename: '{nombre} - {dni} - {empresa}.zip'.
  const zipName = sanitizeZipName(nombre, dni, empresa) + '.zip';

  // Use the adapter's `zipAll` so path composition is consistent with
  // `list`/`stream`. Falls back to a local UncFileRepository instance
  // if the test seam injected a mock that does not expose `zipAll`.
  const archive =
    typeof (repo as UncFileRepository).zipAll === 'function'
      ? (repo as UncFileRepository).zipAll(ruc, dni, idAten).archive
      : new UncFileRepository().zipAll(ruc, dni, idAten).archive;

  const folder = path.win32.join(BASE_PATH, ruc, dni, idAten);
  for (const f of files) {
    archive.append(createReadStream(path.win32.join(folder, f.name)), {
      name: f.name,
    });
  }
  // Best-effort finalize; per-file errors are logged but the response
  // is already streaming and headers cannot be mutated mid-flight.
  void archive.finalize().catch((err: unknown) => {
    console.warn('[api/files/download-all] finalize error', { err });
  });

  return new Response(archive as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
