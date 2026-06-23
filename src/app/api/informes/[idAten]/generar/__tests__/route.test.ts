import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Mock setup: node:fs.promises + child_process.execFile ----

const mockStat = vi.hoisted(() => vi.fn());
const mockReadFile = vi.hoisted(() => vi.fn());
const mockAccess = vi.hoisted(() => vi.fn());

/**
 * Queue of pending `execFile` responses. Each entry is a callback
 * that fires the appropriate (err, result) pair. The mock shifts one
 * entry per `execFile` invocation; when the queue is empty, the mock
 * fires a default success (exit 0, empty stdout). Tests push responses
 * via `queueExecError` / `queueExecSuccess` BEFORE calling `POST`.
 */
type ExecCallback = (
  err: (Error & { code?: number; stdout?: string }) | null,
  result: { stdout: string; stderr: string },
) => void;

const pendingExecResponses = vi.hoisted<Array<(cb: ExecCallback) => void>>(() => []);

const mockExecFile = vi.hoisted(() =>
  vi.fn(
    (
      _file: string,
      _args: readonly string[],
      _options: unknown,
      callback: ExecCallback,
    ) => {
      const respond = pendingExecResponses.shift();
      if (respond) {
        // Defer the callback to mimic real async behaviour of execFile.
        queueMicrotask(() => respond(callback));
      } else {
        // Default: success with empty stdout.
        queueMicrotask(() => callback(null, { stdout: '', stderr: '' }));
      }
    },
  ),
);

function queueExecError(exitCode: number, stdout = ''): void {
  pendingExecResponses.push((cb) => {
    const err = Object.assign(new Error('exit ' + exitCode), { code: exitCode, stdout });
    cb(err, { stdout, stderr: '' });
  });
}

vi.mock('node:fs', () => {
  const promises = { stat: mockStat, readFile: mockReadFile, access: mockAccess };
  const constants = { X_OK: 1 };
  return {
    promises,
    constants,
    default: { promises, constants },
  };
});

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
  default: { execFile: mockExecFile },
}));

// Set the CLI path + UNC root deterministically for every test.
vi.hoisted(() => {
  process.env.FILE_SERVER_BASE_PATH = '\\\\172.16.10.12\\sigla';
  process.env.PDFCLI_EXE_PATH = 'C:\\fake\\SIGLA.PdfCli.exe';
});

beforeEach(() => {
  vi.clearAllMocks();
  pendingExecResponses.length = 0;
  // Default: parent dir is reachable, CLI exe is accessible, the
  // manifest is well-formed, and the CLI exits 0. Tests that exercise
  // the partial-exit path call `queueExecError(3)` BEFORE `POST` to
  // override the next invocation.
  mockStat.mockResolvedValue({} as never);
  mockAccess.mockResolvedValue(undefined as never);
  mockReadFile.mockResolvedValue(
    JSON.stringify({
      exitCode: 0,
      rows: [
        { idePMe: 39053, arcPla: 'exa_lab', file: '012110021_39053_exa_lab.pdf', status: 'success' },
        { idePMe: 39056, arcPla: 'exa_aud', file: '012110021_39056_exa_aud.pdf', status: 'success' },
      ],
    }) as never,
  );
});

// Restore fake timers and env stubs after each test to avoid bleeding
// into subsequent tests (gotcha #251: setTimeout must be mocked or tests
// blow the 30s timeout; gotcha #252: process.env mutations need restore).
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/informes/012110021/generar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idAten: '012110021',
    codEmp: 1,
    codSed: 1,
    codTCl: 2,
    numOrd: 100200,
    codCli: 3331,
    emiAfi: 1,
    incExp: 0,
    ruc: '20123456789',
    dni: '12345678',
    user: 'soporte',
    pass: 'soporte',
    idePmeList: [39053, 39056],
    ...overrides,
  };
}

// ---- Manifest fixtures for transient-auth retry tests ----

const TRANSIENT_REASON =
  'El sistema no puede ponerse en contacto con un controlador de dominio para que atienda la solicitud de autenticación. Inténtelo de nuevo más tarde.';

/** A manifest with one failed row whose reason matches the transient-auth clause. */
function transientManifestJson(): string {
  return JSON.stringify({
    exitCode: 0,
    rows: [
      {
        idePMe: 390417,
        arcPla: 'CERTIFICADO APTITUD - METRO LIMA 2',
        status: 'failed',
        reason: TRANSIENT_REASON,
      },
    ],
  });
}

/** A manifest with TWO failed transient rows (to test "log the first match"). */
function twoTransientRowsManifestJson(): string {
  return JSON.stringify({
    exitCode: 0,
    rows: [
      {
        idePMe: 390417,
        arcPla: 'CERTIFICADO APTITUD - METRO LIMA 2',
        status: 'failed',
        reason: TRANSIENT_REASON,
      },
      {
        idePMe: 390423,
        arcPla: 'EVAL AUDIOMETRIA CCM2L',
        status: 'failed',
        reason: TRANSIENT_REASON,
      },
    ],
  });
}

/** A clean manifest with one success row and zero failed rows. */
function cleanManifestJson(): string {
  return JSON.stringify({
    exitCode: 0,
    rows: [
      {
        idePMe: 390417,
        arcPla: 'CERTIFICADO APTITUD - METRO LIMA 2',
        file: '012110149_390417_CERTIFICADO APTITUD - METRO LIMA 2.pdf',
        status: 'success',
      },
    ],
  });
}

describe('POST /api/informes/[idAten]/generar', () => {
  // ---- Happy path ----

  it('should return 200 with a manifest and summary when the CLI exits 0', async () => {
    const { POST } = await import('../route');
    const res = await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual({ generated: 2, failed: 0, skipped: 0, exitCode: 0, retries: 0 });
    expect(body.manifest).toHaveLength(2);
    expect(body.manifest[0]).toMatchObject({ idePMe: 39053, status: 'success' });
  });

  // ---- CLI argv: positional block + --idepme=csv ----

  it('should invoke the CLI with the positional block followed by --idepme=<csv>', async () => {
    const { POST } = await import('../route');
    await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const call = mockExecFile.mock.calls[0] as unknown as [string, string[], { windowsHide: boolean; timeout: number }];
    const [exe, args, opts] = call;
    expect(exe).toBe('C:\\fake\\SIGLA.PdfCli.exe');
    // Positional block: codEmp codSed codTCl numOrd idAten codCli emiAfi incExp
    //                  outputDir user pass
    expect(args.slice(0, 8)).toEqual([
      '1', // codEmp
      '1', // codSed
      '2', // codTCl
      '100200', // numOrd
      '012110021', // idAten (from path)
      '3331', // codCli
      '1', // emiAfi
      '0', // incExp
    ]);
    // No codDCo in this body, so the next slot is outputDir
    expect(args[8]).toBe('\\\\172.16.10.12\\sigla\\20123456789\\12345678\\012110021\\LEGAJOS');
    expect(args[9]).toBe('soporte'); // user
    expect(args[10]).toBe('soporte'); // pass
    // CSV flag at the tail
    expect(args[11]).toBe('--idepme=39053,39056');
    expect(opts.windowsHide).toBe(true);
    expect(opts.timeout).toBe(120_000);
  });

  it('should pass codDCo as a positional arg when it is provided', async () => {
    const { POST } = await import('../route');
    await POST(
      buildRequest(validBody({ codDCo: 76 })),
      { params: Promise.resolve({ idAten: '012110021' }) },
    );

    const args = (mockExecFile.mock.calls[0] as unknown as [string, string[], unknown])[1] as string[];
    // After the 8 mandatory ints, codDCo lands at slot 8, outputDir at 9.
    expect(args[8]).toBe('76');
    expect(args[9]).toBe('\\\\172.16.10.12\\sigla\\20123456789\\12345678\\012110021\\LEGAJOS');
  });

  it('should prepend --strict when strict=true', async () => {
    const { POST } = await import('../route');
    await POST(buildRequest(validBody({ strict: true })), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    const args = (mockExecFile.mock.calls[0] as unknown as [string, string[], unknown])[1] as string[];
    expect(args[0]).toBe('--strict');
  });

  // ---- Validation 400s ----

  it('should return 400 when idePmeList is empty', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      buildRequest(validBody({ idePmeList: [] })),
      { params: Promise.resolve({ idAten: '012110021' }) },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toMatch(/al menos un examen/);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('should return 400 when idePmeList contains a non-integer', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      buildRequest(validBody({ idePmeList: [39053, 'abc' as unknown as number] })),
      { params: Promise.resolve({ idAten: '012110021' }) },
    );
    expect(res.status).toBe(400);
  });

  it('should return 400 when idAten in the body does not match the path', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      buildRequest(validBody({ idAten: '012110099' })),
      { params: Promise.resolve({ idAten: '012110021' }) },
    );
    expect(res.status).toBe(400);
  });

  it('should return 400 when ruc or dni are missing or malformed', async () => {
    const { POST } = await import('../route');
    const r1 = await POST(
      buildRequest(validBody({ ruc: '' })),
      { params: Promise.resolve({ idAten: '012110021' }) },
    );
    expect(r1.status).toBe(400);

    const r2 = await POST(
      buildRequest(validBody({ dni: 'abc' })),
      { params: Promise.resolve({ idAten: '012110021' }) },
    );
    expect(r2.status).toBe(400);
  });

  it('should return 400 when codCli is not an integer', async () => {
    const { POST } = await import('../route');
    const res = await POST(
      buildRequest(validBody({ codCli: 3.5 })),
      { params: Promise.resolve({ idAten: '012110021' }) },
    );
    expect(res.status).toBe(400);
  });

  it('should return 400 when the body is not valid JSON', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/informes/012110021/generar', {
      method: 'POST',
      body: 'not json',
    });
    const res = await POST(req, { params: Promise.resolve({ idAten: '012110021' }) });
    expect(res.status).toBe(400);
  });

  // ---- Pre-flight 502 ----

  it('should return 502 UNC_UNREACHABLE when fs.stat throws ENOENT on the parent dir', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockStat.mockRejectedValueOnce(err);

    const { POST } = await import('../route');
    const res = await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('UNC_UNREACHABLE');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('should return 502 UNC_UNREACHABLE when fs.stat throws EACCES on the parent dir', async () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    mockStat.mockRejectedValueOnce(err);

    const { POST } = await import('../route');
    const res = await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    expect(res.status).toBe(502);
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('should pre-flight the parent of OutputDir, NOT OutputDir itself', async () => {
    const { POST } = await import('../route');
    await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    const statArg = (mockStat.mock.calls[0] as [string])[0];
    // Parent = one segment above LEGAJOS
    expect(statArg).toBe('\\\\172.16.10.12\\sigla\\20123456789\\12345678\\012110021');
  });

  // ---- Partial exit (code 3) ----

  it('should return 200 with exitCode=3 and failed >= 1 when the CLI exits partially', async () => {
    // The CLI exits with code 3 and writes a manifest with one
    // success and one failed row.
    queueExecError(3);
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        exitCode: 3,
        rows: [
          { idePMe: 39053, arcPla: 'exa_lab', file: '012110021_39053_exa_lab.pdf', status: 'success' },
          { idePMe: 39056, arcPla: 'exa_aud', status: 'failed', reason: 'Crystal Reports timeout' },
        ],
      }) as never,
    );

    const { POST } = await import('../route');
    const res = await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.exitCode).toBe(3);
    expect(body.summary.generated).toBe(1);
    expect(body.summary.failed).toBe(1);
    expect(body.summary.retries).toBe(0);
    expect(body.manifest).toHaveLength(2);
    expect(body.manifest[1].status).toBe('failed');
    expect(body.manifest[1].reason).toBe('Crystal Reports timeout');
  });

  // ---- Missing manifest.json after run ----

  it('should return 502 MANIFEST_MISSING when manifest.json is not written to OutputDir', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValueOnce(err);

    const { POST } = await import('../route');
    const res = await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('MANIFEST_MISSING');
    expect(body.exitCode).toBe(0);
  });

  // ---- Non-ENOENT read failure ----

  it('should return 502 MANIFEST_MISSING when readFile fails with a non-ENOENT error', async () => {
    // A non-ENOENT error (e.g. EBUSY, EIO) is still a "manifest
    // missing / unreadable" outcome for the operator — the share
    // write is incomplete — so the route returns 502 with a generic
    // message that does not leak the raw OS code.
    const err = Object.assign(new Error('disk on fire'), { code: 'EIO' });
    mockReadFile.mockRejectedValueOnce(err);

    const { POST } = await import('../route');
    const res = await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('MANIFEST_MISSING');
    expect(body.message).not.toContain('disk on fire');
    expect(body.message).not.toContain('EIO');
  });

  // ---- Unknown fs.stat error (non-ENOENT / non-EACCES) is still UNC unreachable ----

  it('should return 502 UNC_UNREACHABLE for any fs.stat failure (not just ENOENT/EACCES)', async () => {
    const err = Object.assign(new Error('weird'), { code: 'ELOOP' });
    mockStat.mockRejectedValueOnce(err);

    const { POST } = await import('../route');
    const res = await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('UNC_UNREACHABLE');
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  // ---- Transient-auth retry tests (T5–T10) ----

  it('T5: retries once and succeeds when attempt 1 has a transient auth error', async () => {
    vi.useFakeTimers();
    mockReadFile
      .mockResolvedValueOnce(transientManifestJson())
      .mockResolvedValueOnce(cleanManifestJson());

    const { POST } = await import('../route');
    const routePromise = POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    // Skip the 2s backoff sleep between attempt 1 and 2 (gotcha #251).
    await vi.advanceTimersByTimeAsync(2000);

    const res = await routePromise;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.retries).toBe(1);
    expect(body.summary.generated).toBe(1);
    expect(body.summary.failed).toBe(0);
    // The final manifest is from attempt 2 (clean).
    expect(body.manifest).toHaveLength(1);
    expect(body.manifest[0].status).toBe('success');
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });

  it('T6: retries twice and preserves the last manifest when all 3 attempts have transient auth errors', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockReadFile
      .mockResolvedValueOnce(transientManifestJson())
      .mockResolvedValueOnce(transientManifestJson())
      .mockResolvedValueOnce(transientManifestJson());

    const { POST } = await import('../route');
    const routePromise = POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    // Skip the 2s backoff between attempt 1 and 2, then the 4s backoff
    // between attempt 2 and 3 (gotcha #251).
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    const res = await routePromise;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.retries).toBe(2);
    // The final manifest is from attempt 3, with the failed row preserved.
    expect(body.manifest).toHaveLength(1);
    expect(body.manifest[0].status).toBe('failed');
    expect(body.manifest[0].reason).toContain('controlador de dominio');
    expect(mockExecFile).toHaveBeenCalledTimes(3);
    // Exactly 2 warn calls (before each of the 2 sleeps; no warn on
    // the last attempt per REQ-4).
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('T7: does not retry on MANIFEST_MISSING and the 502 body has no retries field', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValueOnce(err);

    const { POST } = await import('../route');
    const res = await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('MANIFEST_MISSING');
    // The 502 body is { code, message, exitCode } — NOT { manifest, summary }.
    expect(body).not.toHaveProperty('retries');
    expect(body).not.toHaveProperty('summary');
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('T8: does not retry when PDFCLI_RETRY_TRANSIENT_AUTH=0 even if the manifest has a transient auth error', async () => {
    vi.stubEnv('PDFCLI_RETRY_TRANSIENT_AUTH', '0');
    mockReadFile.mockResolvedValueOnce(transientManifestJson());

    const { POST } = await import('../route');
    const res = await POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.retries).toBe(0);
    expect(body.summary.failed).toBe(1);
    // The manifest with the transient error is preserved (no retry).
    expect(body.manifest[0].status).toBe('failed');
    expect(body.manifest[0].reason).toContain('controlador de dominio');
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('T9: retries when PDFCLI_RETRY_TRANSIENT_AUTH=1 (explicit enable)', async () => {
    vi.stubEnv('PDFCLI_RETRY_TRANSIENT_AUTH', '1');
    vi.useFakeTimers();
    mockReadFile
      .mockResolvedValueOnce(transientManifestJson())
      .mockResolvedValueOnce(cleanManifestJson());

    const { POST } = await import('../route');
    const routePromise = POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    await vi.advanceTimersByTimeAsync(2000);

    const res = await routePromise;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.retries).toBe(1);
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });

  it('T10: logs the first transient row with idePMe/arcPla/reason before each retry sleep', async () => {
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Manifest with TWO transient rows — the log must use the FIRST one.
    mockReadFile
      .mockResolvedValueOnce(twoTransientRowsManifestJson())
      .mockResolvedValueOnce(cleanManifestJson());

    const { POST } = await import('../route');
    const routePromise = POST(buildRequest(validBody()), {
      params: Promise.resolve({ idAten: '012110021' }),
    });

    await vi.advanceTimersByTimeAsync(2000);
    await routePromise;

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [label, payload] = warnSpy.mock.calls[0] as [
      string,
      { attempt: number; exitCode: number; transientErrorRow: { idePMe: number; arcPla: string; reason: string } },
    ];
    expect(label).toBe('[api/informes/generar] retry transient auth');
    expect(payload.attempt).toBe(1);
    expect(payload.transientErrorRow.idePMe).toBe(390417);
    expect(payload.transientErrorRow.arcPla).toBe('CERTIFICADO APTITUD - METRO LIMA 2');
    expect(payload.transientErrorRow.reason).toContain('controlador de dominio');
    warnSpy.mockRestore();
  });
});
