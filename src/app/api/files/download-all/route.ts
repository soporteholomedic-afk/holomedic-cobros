import { createReadStream } from 'node:fs';
import { NextResponse } from 'next/server';
import { sanitizeZipName } from '@/lib/sanitize-filename';
import { UncFileRepository } from '@/features/envio-resultados/infrastructure/files/UncFileRepository';
import { getFileRepository } from '@/features/envio-resultados/infrastructure/files/getFileRepository';
import { renameReadyFile } from '@/features/envio-resultados/domain/ready-files/renameReadyFile';
import { renameGeneratedCertificate } from '@/features/envio-resultados/domain/generated-files/renameGeneratedCertificate';
import type { SelectedFileRef } from '@/features/envio-resultados/domain/entities';
import type { Archiver } from 'archiver';

const BASE_PATH = process.env.FILE_SERVER_BASE_PATH ?? '';

function buildFileSource(ruc: string, dni: string, idAten: string, path: string, name: string): string {
  const parts = [BASE_PATH, ruc, dni, idAten];
  if (path) parts.push(path);
  parts.push(name);
  return parts.join('\\');
}

function buildArchive(ruc: string, dni: string, idAten: string, files: Array<{ sourcePath: string; entryName: string }>): Archiver {
  const repo = getFileRepository();
  const archive =
    typeof (repo as UncFileRepository).zipAll === 'function'
      ? (repo as UncFileRepository).zipAll(ruc, dni, idAten).archive
      : new UncFileRepository().zipAll(ruc, dni, idAten).archive;

  for (const { sourcePath, entryName } of files) {
    archive.append(createReadStream(sourcePath), { name: entryName });
  }

  void archive.finalize().catch((err: unknown) => {
    console.warn('[api/files/download-all] finalize error', { err });
  });

  return archive;
}

function isFileRefShape(v: unknown): v is SelectedFileRef {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.ruc === 'string' &&
    typeof obj.dni === 'string' &&
    typeof obj.idAten === 'string' &&
    typeof obj.path === 'string' &&
    typeof obj.name === 'string'
  );
}

const LEGAJOS_SUBFOLDER = 'LEGAJOS';

/**
 * GET /api/files/download-all?ruc&dni&idAten&nombrePaciente&empresa&destino
 *
 * Backward-compat: lists files from the patient root AND LEGAJOS/, renames
 * ready files, and streams the zip.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const ruc = searchParams.get('ruc')?.trim() ?? '';
  const dni = searchParams.get('dni')?.trim() ?? '';
  const idAten = searchParams.get('idAten')?.trim() ?? '';
  const nombre = searchParams.get('nombrePaciente') ?? '';
  const empresa = searchParams.get('empresa') ?? '';
  const destino = searchParams.get('destino') ?? '';

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
  const listRoot = repo.listFolder(ruc, dni, idAten, '').catch((err: unknown) => {
    console.warn('[api/files/download-all] root listFolder error', { ruc, dni, idAten, err });
    return null;
  });
  const listLegajos = repo.listFolder(ruc, dni, idAten, LEGAJOS_SUBFOLDER).catch((err: unknown) => {
    console.warn('[api/files/download-all] legajos listFolder error', { ruc, dni, idAten, err });
    return null;
  });
  const [rootNodes, legajosNodes] = await Promise.all([listRoot, listLegajos]);

  if (rootNodes === null && legajosNodes === null) {
    return NextResponse.json(
      { error: 'No se pudo acceder al servidor de archivos.' },
      { status: 502 },
    );
  }

  const files: Array<{ sourcePath: string; entryName: string }> = [];
  const addFile = (name: string, subPath: string): void => {
    const sourcePath = buildFileSource(ruc, dni, idAten, subPath, name);
    const readyName = renameReadyFile({ rawName: name, nombreCompleto: nombre, destino });
    const entryName =
      readyName === name
        ? renameGeneratedCertificate({ rawName: name, nombreCompleto: nombre })
        : readyName;
    files.push({ sourcePath, entryName });
  };

  for (const n of rootNodes ?? []) {
    if (n.kind === 'file') addFile(n.name, '');
  }
  for (const n of legajosNodes ?? []) {
    if (n.kind === 'file') addFile(n.name, LEGAJOS_SUBFOLDER);
  }

  const zipName = sanitizeZipName(nombre, dni, empresa) + '.zip';
  const archive = buildArchive(ruc, dni, idAten, files);

  return new Response(archive as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * POST /api/files/download-all
 *
 * Accepts fileRefs in FormData — zips only the selected files.
 * Mirrors the pattern of /api/consolidados/send-results.
 *
 * FormData fields:
 * - ruc (string, required)
 * - dni (string, required)
 * - idAten (string, required)
 * - nombrePaciente (string, optional)
 * - empresa (string, optional)
 * - destino (string, optional)
 * - fileRefs (JSON string of SelectedFileRef[], required)
 */
export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const ruc = ((formData.get('ruc') as string | null) ?? '').trim();
  const dni = ((formData.get('dni') as string | null) ?? '').trim();
  const idAten = ((formData.get('idAten') as string | null) ?? '').trim();
  const nombre = (formData.get('nombrePaciente') as string | null) ?? '';
  const empresa = (formData.get('empresa') as string | null) ?? '';
  const destino = (formData.get('destino') as string | null) ?? '';
  const fileRefsRaw = formData.get('fileRefs') as string | null;

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
  if (!fileRefsRaw) {
    return NextResponse.json({ error: '"fileRefs" is required' }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileRefsRaw);
  } catch {
    return NextResponse.json({ error: '"fileRefs" must be valid JSON' }, { status: 400 });
  }
  if (!Array.isArray(parsed)) {
    return NextResponse.json({ error: '"fileRefs" must be an array' }, { status: 400 });
  }

  const files: Array<{ sourcePath: string; entryName: string }> = [];
  for (const ref of parsed) {
    if (!isFileRefShape(ref)) {
      return NextResponse.json(
        { error: 'Each fileRef must have ruc, dni, idAten, path, name as strings' },
        { status: 400 },
      );
    }
    if (!/^\d+$/.test(ref.dni)) {
      return NextResponse.json({ error: `"dni" must be numeric: ${ref.dni}` }, { status: 400 });
    }
    if (ref.ruc !== ruc || ref.dni !== dni || ref.idAten !== idAten) {
      return NextResponse.json(
        { error: 'All fileRefs must share the same ruc, dni, idAten' },
        { status: 400 },
      );
    }
    const sourcePath = buildFileSource(ruc, dni, idAten, ref.path, ref.name);
    const readyName = renameReadyFile({ rawName: ref.name, nombreCompleto: nombre, destino });
    const entryName =
      readyName === ref.name
        ? renameGeneratedCertificate({ rawName: ref.name, nombreCompleto: nombre })
        : readyName;
    files.push({ sourcePath, entryName });
  }

  const zipName = sanitizeZipName(nombre, dni, empresa) + '.zip';

  const archive = buildArchive(ruc, dni, idAten, files);

  return new Response(archive as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
