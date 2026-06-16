import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import archiver from 'archiver';
import { GeneratePdfsRequest } from '@/types/generate-pdfs';

const execFileAsync = promisify(execFile);

const EXE_PATH = 'C:\\Users\\soporte\\Desktop\\SIGLA\\SIGLA.PdfCli\\bin\\Debug\\SIGLA.PdfCli.exe';
const DEFAULT_TIMEOUT_MS = 120_000;

function sanitizeIdAten(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('idAten must be a string');
  }
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('idAten must contain only digits');
  }
  return trimmed;
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  throw new Error(`Cannot parse boolean: ${JSON.stringify(value)}`);
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  throw new Error(`Cannot parse integer: ${JSON.stringify(value)}`);
}

function cleanupDirectory(dir: string): void {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup; do not fail the request.
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const runId = randomUUID();
  const outputDir = path.join(os.tmpdir(), 'sigla-pdf-batch', runId);

  try {
    const body = (await req.json()) as GeneratePdfsRequest;

    const idAten = sanitizeIdAten(body.idAten);
    const args: string[] = [
      String(toInt(body.codEmp)),
      String(toInt(body.codSed)),
      String(toInt(body.codTCl)),
      String(toInt(body.numOrd)),
      idAten,
      String(toInt(body.codCli)),
      String(toBool(body.emiAfi)),
      String(toBool(body.incExp)),
      body.codDCo == null ? '' : String(toInt(body.codDCo)),
      outputDir,
      body.user,
      body.pass,
    ];

    if (body.strict) {
      args.unshift('--strict');
    }

    fs.mkdirSync(outputDir, { recursive: true });

    let exitCode = 0;
    let stderr = '';
    try {
      const result = await execFileAsync(EXE_PATH, args, {
        timeout: DEFAULT_TIMEOUT_MS,
        windowsHide: true,
      });
      stderr = result.stderr;
    } catch (execError: unknown) {
      const err = execError as { code?: number; stderr?: string; message: string };
      exitCode = err.code ?? 2;
      stderr = err.stderr ?? err.message;

      // 3 = partial success (some curated reports failed). We still try to return any PDFs.
      // 2 = fatal error. We still try to return any PDFs + manifest for diagnostics.
      if (exitCode !== 0 && exitCode !== 2 && exitCode !== 3) {
        return NextResponse.json(
          { error: 'Failed to execute PDF generator', details: stderr, exitCode },
          { status: 500 }
        );
      }
    }

    const files = fs.readdirSync(outputDir);
    const pdfFiles = files.filter((file) => file.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      return NextResponse.json(
        {
          error: 'No PDFs were generated',
          exitCode,
          stderr,
        },
        { status: 500 }
      );
    }

    const zipPath = path.join(outputDir, `${idAten}_pdfs.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = fs.createWriteStream(zipPath);

    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));
      archive.pipe(output);

      for (const file of pdfFiles) {
        const filePath = path.join(outputDir, file);
        archive.file(filePath, { name: file });
      }

      archive.finalize();
    });

    const zipBuffer = fs.readFileSync(zipPath);

    // Fire-and-forget cleanup after the response is sent.
    setTimeout(() => cleanupDirectory(outputDir), 30_000);

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${idAten}_pdfs.zip"`,
        'X-Pdf-Exit-Code': String(exitCode),
        'X-Pdf-Generated-Count': String(pdfFiles.length),
      },
    });
  } catch (error: unknown) {
    cleanupDirectory(outputDir);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
