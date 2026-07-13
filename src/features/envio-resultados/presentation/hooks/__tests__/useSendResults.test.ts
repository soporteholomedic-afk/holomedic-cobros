import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---- Import under test ----
import { useSendResults } from '../useSendResults';
import type { SelectedFileRef } from '../../../domain/entities';

/**
 * PR #3 — payload contract:
 * The hook MUST send `fileRefs` as a single JSON field on the
 * FormData. It MUST NOT construct any `Blob` from a placeholder
 * string and MUST NOT append a `files` `File`-part. The route
 * (PR #2) consumes only the JSON `fileRefs` field; legacy
 * `files` parts are rejected with `VALIDATION_ERROR`.
 */
const defaultFileRefs: SelectedFileRef[] = [
  { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: 'cert.pdf' },
  { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: '', name: 'emo.pdf' },
];

const defaultArgs = {
  to: ['test@example.com'],
  subject: 'Test Subject',
  html: '<p>Test</p>',
  fileRefs: defaultFileRefs,
  nombreCompleto: '',
  destino: '',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useSendResults', () => {
  it('should initialize with idle state', () => {
    const { result } = renderHook(() => useSendResults(defaultArgs));

    expect(result.current.isSending).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should set isSending to true when send is called', async () => {
    // Mock fetch to return a pending promise so we can check the loading state
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(() => useSendResults(defaultArgs));

    act(() => {
      result.current.send();
    });

    expect(result.current.isSending).toBe(true);

    mockFetch.mockRestore();
  });

  it('should set result on successful send', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, messageId: 'msg-001' }),
    } as Response);

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    expect(result.current.isSending).toBe(false);
    expect(result.current.result).toEqual({ success: true, messageId: 'msg-001' });
    expect(result.current.error).toBeNull();
  });

  it('should set error when API returns failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ success: false, error: 'SMTP error' }),
    } as Response);

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    expect(result.current.isSending).toBe(false);
    expect(result.current.error).toBe('SMTP error');
  });

  it('should set error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    expect(result.current.isSending).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('Network error');
  });

  it('should append CC to FormData when provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, messageId: 'msg-cc' }),
    } as Response);

    const argsWithCc = { ...defaultArgs, cc: ['cc1@example.com', 'cc2@example.com'] };
    const { result } = renderHook(() => useSendResults(argsWithCc));

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(formData.get('cc')).toBe('cc1@example.com,cc2@example.com');
  });

  // ================================================================
  // PR #3 — Spec REQ-1: fileRefs JSON payload replaces the fake Blob.
  // The route consumes only the JSON `fileRefs` field; the legacy
  // `files` File-part is rejected with 400 VALIDATION_ERROR.
  // ================================================================

  it('should append fileRefs as a JSON string to FormData', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, messageId: 'msg-refs' }),
    } as Response);

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    const raw = formData.get('fileRefs');
    expect(typeof raw).toBe('string');
    const parsed = JSON.parse(raw as string) as SelectedFileRef[];
    expect(parsed).toEqual(defaultFileRefs);
  });

  it('should serialize each fileRef with ruc/dni/idAten/path/name verbatim', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    const parsed = JSON.parse(formData.get('fileRefs') as string) as SelectedFileRef[];

    expect(parsed[0]).toEqual<SelectedFileRef>({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      name: 'cert.pdf',
    });
    expect(parsed[1]).toEqual<SelectedFileRef>({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: '',
      name: 'emo.pdf',
    });
  });

  it('should NOT append any "files" File-part to the FormData', async () => {
    // The PR #2 route rejects any `files` File-part with 400
    // VALIDATION_ERROR. The hook must not produce one.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(formData.getAll('files')).toEqual([]);
  });

  it('should NEVER include the "Contenido mock" placeholder string in any FormData value', async () => {
    // The bug fix — PR #3 erases the placeholder text the corrupted
    // PDFs were stuffed with. This is the literal regression test.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    for (const [, value] of formData.entries()) {
      const asString = typeof value === 'string' ? value : '';
      // Both substrings must be absent — the placeholder and its family.
      expect(asString).not.toContain('Contenido mock');
      expect(asString).not.toContain('Contenido');
    }
  });

  it('should send an empty fileRefs JSON array when no files are selected', async () => {
    // Triangulation: empty selection — `fileRefs: []` round-trips as
    // `"[]"`. The route still receives the JSON field (never a Blob).
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const { result } = renderHook(() => useSendResults({ ...defaultArgs, fileRefs: [] }));

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    const parsed = JSON.parse(formData.get('fileRefs') as string) as SelectedFileRef[];
    expect(parsed).toEqual([]);
    expect(formData.getAll('files')).toEqual([]);
  });

  it('should preserve nested explorer-pane folder paths in the fileRefs JSON', async () => {
    // Triangulation: nested paths must survive the JSON
    // round-trip. The bridge preserves them (PR #1); the hook
    // must not strip them.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const nestedRefs: SelectedFileRef[] = [
      { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'EXAMENES/2024', name: 'emo.pdf' },
    ];
    const { result } = renderHook(() => useSendResults({ ...defaultArgs, fileRefs: nestedRefs }));

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    const parsed = JSON.parse(formData.get('fileRefs') as string) as SelectedFileRef[];
    expect(parsed[0]?.path).toBe('EXAMENES/2024');
    expect(parsed[0]?.name).toBe('emo.pdf');
  });

  // ================================================================
  // Local files (drag-and-drop from OS)
  // ================================================================

  it('should append localFiles as multipart File parts to FormData', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const localFiles = [
      new File(['PNG data'], 'foto.png', { type: 'image/png' }),
      new File(['DOCX content'], 'report.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    ];

    const { result } = renderHook(() =>
      useSendResults({ ...defaultArgs, localFiles }),
    );

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    const parts = formData.getAll('localFiles');
    expect(parts).toHaveLength(2);
    expect((parts[0] as File).name).toBe('foto.png');
    expect((parts[1] as File).name).toBe('report.docx');
  });

  it('should NOT append localFiles when the array is empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const { result } = renderHook(() =>
      useSendResults({ ...defaultArgs, localFiles: [] }),
    );

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(formData.getAll('localFiles')).toEqual([]);
  });

  it('should NOT append localFiles when the prop is undefined', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(formData.getAll('localFiles')).toEqual([]);
    // Existing fileRefs still present
    expect(formData.get('fileRefs')).toBeTruthy();
  });

  it('should send localFiles AND fileRefs together in the same request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const localFiles = [new File(['extra'], 'extra.pdf', { type: 'application/pdf' })];
    const { result } = renderHook(() =>
      useSendResults({ ...defaultArgs, localFiles }),
    );

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(formData.get('fileRefs')).toBeTruthy();
    const localParts = formData.getAll('localFiles');
    expect(localParts).toHaveLength(1);
  });

  it('should send the request as a POST to the send-results endpoint', async () => {
    // Triangulation: the wire URL and method are unchanged. PR #3
    // only swaps the payload shape — the call site is the same.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const { result } = renderHook(() => useSendResults(defaultArgs));

    await act(async () => {
      await result.current.send();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('/api/consolidados/send-results');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
  });

  // ================================================================
  // PR #3 (WU-3.4) — Spec REQ-010a: `useSendResults` SHALL serialize
  // `tipoExamen` within each `SelectedFileRef` in the `fileRefs`
  // JSON (verbatim — no new FormData field).
  //
  // The hook uses `JSON.stringify(args.fileRefs)` to build the
  // `fileRefs` FormData field. Once `SelectedFileRef` gains the
  // optional `tipoExamen` field (PR1), the JSON output includes it
  // automatically. This test pins the contract end-to-end.
  // ================================================================

  it('should serialize tipoExamen verbatim in the fileRefs JSON when present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const refsWithTipo: SelectedFileRef[] = [
      {
        ruc: '20123456789',
        dni: '12345678',
        idAten: 'AT-001',
        path: 'LEGAJOS',
        name: '75618561CERT.pdf',
        tipoExamen: 'CAMO',
      },
    ];

    const { result } = renderHook(() =>
      useSendResults({ ...defaultArgs, fileRefs: refsWithTipo }),
    );

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    const parsed = JSON.parse(formData.get('fileRefs') as string) as SelectedFileRef[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.tipoExamen).toBe('CAMO');
    // Sanity: the rest of the ref is preserved (the hook must not
    // accidentally strip the new field at the cost of the others).
    expect(parsed[0]).toEqual({
      ruc: '20123456789',
      dni: '12345678',
      idAten: 'AT-001',
      path: 'LEGAJOS',
      name: '75618561CERT.pdf',
      tipoExamen: 'CAMO',
    });
  });

  it('should omit tipoExamen from the fileRefs JSON when absent (backward compat)', async () => {
    // Triangulation: legacy callers that pre-date PR1 (download
    // routes, the per-row `Ver Archivos` path) do not stamp
    // `tipoExamen`. The JSON output MUST stay the same shape — the
    // route's `isFileRefShape` guard would reject unknown fields
    // only if the `isFileRefShape` is tightened in the future, so
    // omitting the field entirely is the safe contract.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const refsNoTipo: SelectedFileRef[] = [
      {
        ruc: '20123456789',
        dni: '12345678',
        idAten: 'AT-001',
        path: 'LEGAJOS',
        name: '75618561CERT.pdf',
        // tipoExamen intentionally absent
      },
    ];

    const { result } = renderHook(() =>
      useSendResults({ ...defaultArgs, fileRefs: refsNoTipo }),
    );

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    const raw = formData.get('fileRefs') as string;
    const parsed = JSON.parse(raw) as SelectedFileRef[];
    // JSON.stringify drops `undefined` properties — the field is
    // not present on the parsed object.
    expect(parsed[0]?.tipoExamen).toBeUndefined();
    // The literal JSON MUST NOT contain `"tipoExamen"` for a ref
    // that did not set it.
    expect(raw).not.toContain('"tipoExamen"');
  });

  it('should serialize tipoExamen="EMO" verbatim in the fileRefs JSON when present', async () => {
    // Triangulation: the EMO mirror. PR1 added the optional
    // `'CAMO' | 'EMO'` literal; the JSON round-trip must preserve
    // both values (the route forwards them to the use case, which
    // passes them to `renameReadyFile` — see WU-3.3).
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    const refsEmo: SelectedFileRef[] = [
      {
        ruc: '20123456789',
        dni: '12345678',
        idAten: 'AT-001',
        path: 'LEGAJOS',
        name: '75618561EXPED.pdf',
        tipoExamen: 'EMO',
      },
    ];

    const { result } = renderHook(() =>
      useSendResults({ ...defaultArgs, fileRefs: refsEmo }),
    );

    await act(async () => {
      await result.current.send();
    });

    const formData = fetchSpy.mock.calls[0][1]?.body as FormData;
    const parsed = JSON.parse(formData.get('fileRefs') as string) as SelectedFileRef[];
    expect(parsed[0]?.tipoExamen).toBe('EMO');
  });
});
