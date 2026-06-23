import { NextResponse } from 'next/server';
import * as path from 'node:path';
import { promises as fs, constants as fsConstants } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CLI_EXE_PATH,
  CLI_TIMEOUT_MS,
  MANIFEST_FILENAME,
  buildOutputDir,
  PDFCLI_RETRY_MAX_ATTEMPTS,
  PDFCLI_RETRY_BACKOFF_MS,
  isPdfcliRetryTransientAuthEnabled,
} from '@/features/envio-resultados/infrastructure/informes/constants';
import { parseManifest, countManifest } from '@/features/envio-resultados/infrastructure/informes/parseManifest';
import { isTransientAuthError } from '@/features/envio-resultados/infrastructure/informes/matchTransientAuthError';
import type { GenerarPdfRequest, GenerarPdfResponse, ManifestRow } from '@/types/informe';

const execFileAsync = promisify(execFile);

/**
 * POST /api/informes/[idAten]/generar
 *
 * Body: `GenerarPdfRequest` — see `src/types/informe.ts`. The idAten
 * in the body MUST match the path segment (defensive — the CLI is
 * invoked with the body value to stay consistent with the rest of
 * the payload).
 *
 * Behavior:
 *
 *   1. Validate the request body (400 on validation failure).
 *   2. Pre-flight `fs.stat` on the parent of the OutputDir; on
 *      `ENOENT` / `EACCES` return 502 `UNC_UNREACHABLE` (the CLI is
 *      NOT invoked).
 *   3. Invoke `SIGLA.PdfCli.exe` with the flag block
 *      `[--strict] [--idepme <csv>]` (flags MUST come first) followed
 *      by the positional block `CodEmp CodSed CodTCl NumOrd IdAten
 *      CodCli EmiAfi IncExp [CodDCo] OutputDir User Pass` where
 *      `<csv>` is `idePmeList.join(',')` and `EmiAfi` / `IncExp` are
 *      passed as the literal strings `true` / `false` (the .NET CLI
 *      rejects `0` / `1`).
 *   4. Read `manifest.json` from `OutputDir`; if missing, return
 *      502 with a user-safe error (the CLI ran but the share write
 *      is incomplete).
 *   5. Return `{ manifest, summary: { generated, failed, skipped,
 *      exitCode, retries } }`. Partial CLI exit (code 3) still
 *      returns 200 so the UI can render the failed rows.
 *
 * Transient-auth retry (spec REQ-2 – REQ-4):
 *
 *   The .NET CLI sporadically fails with a Windows domain-controller
 *   auth error ("El sistema no puede ponerse en contacto con un
 *   controlador de dominio ..."). Step-1 verification (#243) proved
 *   the failure is intermittent. When the feature flag
 *   `PDFCLI_RETRY_TRANSIENT_AUTH` is enabled (default ON — set `'0'`
 *   to disable), the route wraps steps 3–4 in a retry loop:
 *
 *   - Up to 3 total attempts (`PDFCLI_RETRY_MAX_ATTEMPTS`).
 *   - Linear backoff: 2 s after attempt 1, 4 s after attempt 2
 *     (`PDFCLI_RETRY_BACKOFF_MS`). The last attempt does NOT sleep.
 *   - A retry is triggered ONLY when a manifest `failed` row's
 *     `reason` matches `isTransientAuthError` (substring on the
 *     stable Spanish clause).
 *   - Before each retry sleep, a `console.warn` is emitted with the
 *     first matching row's `{ idePMe, arcPla, reason }` and the
 *     attempt number.
 *   - `summary.retries` = number of retries performed (0, 1, or 2).
 *
 *   The retry does NOT fire on: `CLI_NOT_FOUND` (spawn ENOENT),
 *   `MANIFEST_MISSING` (readFile throws), non-transient `failed`
 *   rows, or HTTP 4xx validation errors — these are deterministic
 *   failures that return before or exit the loop without continuing.
 *
 * Status codes:
 * - 200: CLI ran (full or partial). `summary.exitCode` carries the truth.
 * - 400: validation error (empty list, unknown `idePMe`, etc.).
 * - 502: UNC parent unreachable, CLI not found, or `manifest.json` missing post-run.
 * - 500: unexpected error.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ idAten: string }> },
): Promise<NextResponse> {
  try {
    const { idAten: pathIdAten } = await params;
    console.log('[api/informes/generar] params:', { pathIdAten });
    console.log('[api/informes/generar] CLI_EXE_PATH:', {
      fromEnv: process.env.PDFCLI_EXE_PATH ?? '(usando default)',
      resolved: CLI_EXE_PATH,
    });

    let body: Partial<GenerarPdfRequest>;
    try {
      body = (await request.json()) as Partial<GenerarPdfRequest>;
      console.log('[api/informes/generar] body recibido:', JSON.stringify(body, null, 2));
    } catch {
      console.error('[api/informes/generar] JSON inválido en body');
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'Cuerpo de la petición inválido.' },
        { status: 400 },
      );
    }

    // ---- Path validation ----
    if (!/^\d+$/.test(pathIdAten)) {
      console.error('[api/informes/generar] idAten no numérico:', { pathIdAten });
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'idAten debe ser numérico.' },
        { status: 400 },
      );
    }
    if (body.idAten !== pathIdAten) {
      console.error('[api/informes/generar] idAten mismatch:', { bodyIdAten: body.idAten, pathIdAten });
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'idAten no coincide con la ruta.' },
        { status: 400 },
      );
    }

    // ---- Field validation ----
    if (!Array.isArray(body.idePmeList) || body.idePmeList.length === 0) {
      console.error('[api/informes/generar] idePmeList vacío o inválido:', { idePmeList: body.idePmeList });
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'Debe seleccionar al menos un examen.' },
        { status: 400 },
      );
    }
    for (const ide of body.idePmeList) {
      if (typeof ide !== 'number' || !Number.isFinite(ide) || !Number.isInteger(ide)) {
        console.error('[api/informes/generar] idePmeList con valor no entero:', { ide });
        return NextResponse.json(
          { code: 'VALIDATION_ERROR', message: 'idePmeList solo admite enteros.' },
          { status: 400 },
        );
      }
    }

    const requiredNumbers: Array<keyof GenerarPdfRequest> = [
      'codEmp',
      'codSed',
      'codTCl',
      'numOrd',
      'codCli',
      'emiAfi',
      'incExp',
    ];
    for (const field of requiredNumbers) {
      const value = body[field];
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        console.error('[api/informes/generar] campo entero inválido:', { field, value });
        return NextResponse.json(
          { code: 'VALIDATION_ERROR', message: `${String(field)} debe ser un entero.` },
          { status: 400 },
        );
      }
    }

    if (body.codDCo !== undefined && body.codDCo !== null) {
      if (typeof body.codDCo !== 'number' || !Number.isInteger(body.codDCo)) {
        console.error('[api/informes/generar] codDCo inválido:', { codDCo: body.codDCo });
        return NextResponse.json(
          { code: 'VALIDATION_ERROR', message: 'codDCo debe ser entero o ausente.' },
          { status: 400 },
        );
      }
    }

    // `ruc` and `dni` are required because `OutputDir` includes them
    // in the path. They are NOT in the spec's body schema but the
    // proposal/design make them mandatory for the UNC write.
    if (typeof body.ruc !== 'string' || body.ruc.length === 0) {
      console.error('[api/informes/generar] ruc inválido:', { ruc: body.ruc });
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'ruc es requerido.' },
        { status: 400 },
      );
    }
    if (typeof body.dni !== 'string' || !/^\d+$/.test(body.dni)) {
      console.error('[api/informes/generar] dni inválido:', { dni: body.dni });
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'dni debe ser numérico.' },
        { status: 400 },
      );
    }
    if (typeof body.user !== 'string' || body.user.length === 0) {
      console.error('[api/informes/generar] user vacío');
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'user es requerido.' },
        { status: 400 },
      );
    }
    if (typeof body.pass !== 'string' || body.pass.length === 0) {
      console.error('[api/informes/generar] pass vacío');
      return NextResponse.json(
        { code: 'VALIDATION_ERROR', message: 'pass es requerido.' },
        { status: 400 },
      );
    }

    // The strict Boolean defaults to false. Only an explicit `true`
    // is treated as strict; any other value (undefined, false, 0,
    // null) is non-strict.
    const strict: boolean = body.strict === true;

    // ---- OutputDir + parent pre-flight ----
    const outputDir = buildOutputDir(body.ruc, body.dni, pathIdAten);
    const parentDir = path.win32.dirname(outputDir);
    console.log('[api/informes/generar] outputDir:', { outputDir, parentDir });

    try {
      await fs.stat(parentDir);
      console.log('[api/informes/generar] parentDir accesible:', { parentDir });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      console.error('[api/informes/generar] parentDir NO accesible:', { parentDir, code });
      if (code === 'ENOENT' || code === 'EACCES') {
        return NextResponse.json(
          {
            code: 'UNC_UNREACHABLE',
            message: `No se puede acceder a ${parentDir}`,
          },
          { status: 502 },
        );
      }
      // Any other stat error is also a 502 — we never want to invoke
      // the CLI when the parent is in an unknown state.
      return NextResponse.json(
        {
          code: 'UNC_UNREACHABLE',
          message: `No se puede acceder a ${parentDir}`,
        },
        { status: 502 },
      );
    }

    // ---- CLI executable pre-flight ----
    // Fail fast with a meaningful `CLI_NOT_FOUND` if the binary is
    // missing, instead of letting `execFile` reject with a generic
    // ENOENT that bubbles up as a misleading `MANIFEST_MISSING`.
    try {
      await fs.access(CLI_EXE_PATH, fsConstants.X_OK);
      console.log('[api/informes/generar] CLI executable accesible:', { exe: CLI_EXE_PATH });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      console.error('[api/informes/generar] CLI executable NO accesible:', {
        code,
        resolved: CLI_EXE_PATH,
        fromEnv: process.env.PDFCLI_EXE_PATH ?? '(default)',
      });
      return NextResponse.json(
        {
          code: 'CLI_NOT_FOUND',
          message: `No se encontró el binario del CLI en ${CLI_EXE_PATH}`,
        },
        { status: 502 },
      );
    }

    // ---- Compose CLI args ----
    // Flags MUST come before positional args per the CLI's help.
    // `--idepme` takes its value as a separate arg (not `--idepme=...`)
    // because the CLI counts `--idepme=...` as an extra positional.
    // `EmiAfi` and `IncExp` are bools in the .NET CLI — its `bool.Parse`
    // only accepts the literal strings "true" / "false", not 0/1.
    const args: string[] = [];
    if (strict) args.push('--strict');
    args.push('--idepme', body.idePmeList.join(','));
    args.push(
      String(body.codEmp),
      String(body.codSed),
      String(body.codTCl),
      String(body.numOrd),
      pathIdAten,
      String(body.codCli),
      body.emiAfi ? 'true' : 'false',
      body.incExp ? 'true' : 'false',
    );
    if (body.codDCo !== undefined && body.codDCo !== null) {
      args.push(String(body.codDCo));
    }
    args.push(outputDir, body.user, body.pass);

    // ---- Invoke the CLI (with transient-auth retry) ----
    // The CLI sporadically fails with a Windows domain-controller auth
    // error. The error is intermittent (step-1 verification #243), so
    // re-running on the same args usually succeeds. The retry loop
    // wraps (execFile → readFile → parseManifest); on a transient-auth
    // `failed` row it sleeps with linear backoff and re-invokes. Early
    // returns (CLI_NOT_FOUND, MANIFEST_MISSING) break out of the
    // function — they are deterministic failures that must NOT retry.
    // The feature flag (default ON) can disable the loop entirely.
    console.log('[api/informes/generar] invocando CLI:', { exe: CLI_EXE_PATH, args, timeout: CLI_TIMEOUT_MS });
    const manifestPath = path.win32.join(outputDir, MANIFEST_FILENAME);
    const retryEnabled = isPdfcliRetryTransientAuthEnabled();
    const maxAttempts = retryEnabled ? PDFCLI_RETRY_MAX_ATTEMPTS : 1;

    let exitCode = 0;
    let manifest: ManifestRow[] = [];
    let attempts = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      exitCode = 0;

      try {
        await execFileAsync(CLI_EXE_PATH, args, {
          timeout: CLI_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 10 * 1024 * 1024,
        });
        console.log('[api/informes/generar] CLI exitoso, exitCode: 0');
      } catch (err) {
        const e = err as NodeJS.ErrnoException & { code?: string | number };
        // ENOENT post-preflight = the .exe disappeared between access
        // and spawn, or a co-located DLL failed to resolve. Surface it
        // as CLI_NOT_FOUND instead of a misleading MANIFEST_MISSING.
        if (e.code === 'ENOENT') {
          console.error('[api/informes/generar] spawn ENOENT post-preflight:', { exe: CLI_EXE_PATH });
          return NextResponse.json(
            {
              code: 'CLI_NOT_FOUND',
              message: `No se pudo iniciar el CLI en ${CLI_EXE_PATH}`,
            },
            { status: 502 },
          );
        }
        // execFile rejects on non-zero exit. We carry the exit code
        // through so the manifest parser can attach it to the summary.
        exitCode = typeof e.code === 'number' ? e.code : 1;
        console.error('[api/informes/generar] CLI falló:', { exitCode, stderr: (e as Error).message });
      }

      // ---- Read manifest.json from OutputDir ----
      console.log('[api/informes/generar] leyendo manifest:', { manifestPath, attempt });
      let manifestRaw = '';
      try {
        manifestRaw = await fs.readFile(manifestPath, 'utf8');
        console.log('[api/informes/generar] manifest leído, length:', manifestRaw.length, 'attempt:', attempt);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        console.error('[api/informes/generar] error al leer manifest:', { code, manifestPath });
        // The CLI ran but the share write is incomplete — the operator
        // should know that the response is partial. We return 502 with
        // the exit code attached so the UI can surface the right copy.
        return NextResponse.json(
          {
            code: 'MANIFEST_MISSING',
            message:
              code === 'ENOENT'
                ? 'El CLI terminó pero no se encontró manifest.json en la carpeta de salida.'
                : 'No se pudo leer manifest.json desde la carpeta de salida.',
            exitCode,
          },
          { status: 502 },
        );
      }

      // ---- Parse manifest ----
      const parsed = parseManifest(manifestRaw, exitCode);
      manifest = parsed.manifest;

      // ---- Check for transient auth error (retry trigger) ----
      if (retryEnabled && attempt < maxAttempts) {
        const transientRow = manifest.find(
          (row) => row.status === 'failed' && isTransientAuthError(row.reason),
        );
        if (transientRow) {
          console.warn('[api/informes/generar] retry transient auth', {
            attempt,
            exitCode,
            transientErrorRow: {
              idePMe: transientRow.idePMe,
              arcPla: transientRow.arcPla,
              reason: transientRow.reason,
            },
          });
          // Non-blocking sleep with linear backoff. The `as const` on
          // PDFCLI_RETRY_BACKOFF_MS makes this tuple-index type-safe.
          await new Promise<void>((resolve) =>
            setTimeout(resolve, PDFCLI_RETRY_BACKOFF_MS[attempt - 1]),
          );
          continue;
        }
      }

      // No transient error, retry disabled, or last attempt — stop.
      break;
    }

    // ---- Tally and respond ----
    const counts = countManifest(manifest);

    const response: GenerarPdfResponse = {
      manifest,
      summary: {
        generated: counts.generated,
        failed: counts.failed + counts.errored,
        skipped: counts.skipped,
        exitCode,
        retries: attempts - 1,
      },
    };

    console.log('[api/informes/generar] respuesta exitosa:', { summary: response.summary });
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected error';
    console.error('[api/informes/generar] error inesperado:', { message, stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json(
      { code: 'INTERNAL_ERROR', message: 'Error al generar los PDFs. Intente nuevamente.' },
      { status: 500 },
    );
  }
}
