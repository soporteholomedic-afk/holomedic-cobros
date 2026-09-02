import React, { useEffect, useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sonner toasts — `warning` backs the WU-5 auto-auto duplicate
// dismissible amber warning (design D6).
const mockToast = vi.hoisted(() => ({
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: mockToast,
  Toaster: vi.fn().mockReturnValue(null),
}));

// ---- Mock dependencies ----

// Bug-fix wiring: the mock factory reads its bodyHtml / subject from a
// hoisted store so individual tests can override the emitted spitch
// without re-mocking the module (re-mocking during render trips a
// React 19 internal warning). Tests mutate `mockSpitchOverride` in
// their setup block and the mock picks it up on its next render.
const mockSpitchOverride = vi.hoisted(() => ({
  bodyHtml: '<p>Contenido de prueba</p>',
  subject: 'Asunto de prueba',
  name: 'Test Spitch',
}));

const mockEditorHandle = vi.hoisted(() => ({
  loadHtml: vi.fn(),
  getHtml: vi.fn(() => '<p>mock html</p>'),
  focus: vi.fn(),
  onChange: null as ((html: string) => void) | null,
}));

// Mock SpitchSelector
vi.mock('../SpitchSelector', () => ({
  SpitchSelector: vi.fn().mockImplementation(
    ({ target, onSelect, selectedId, area }: { target: string; onSelect: (s: SpitchLike) => void; selectedId?: string; area: string }) => {
      const [loaded] = useState(true);
      // The mock intentionally omits `onSelect` from the deps because
      // the real component owns the callback identity; this mock
      // stabilises on the first call. The real component rebuilds the
      // callback via useCallback upstream. Disable the
      // exhaustive-deps rule for the entire effect block (it's the
      // documented mock seam).
      /* eslint-disable react-hooks/exhaustive-deps */
      useEffect(() => {
        if (loaded) {
          onSelect({
            id: selectedId || 'spitch-001',
            area: area,
            type: target,
            name: mockSpitchOverride.name,
            subject: mockSpitchOverride.subject,
            bodyHtml: mockSpitchOverride.bodyHtml,
          });
        }
      }, [loaded, area, target, selectedId]);
      /* eslint-enable react-hooks/exhaustive-deps */
      return React.createElement('select', {
        'data-testid': 'spitch-selector',
        'data-target': target,
        'data-selectedid': selectedId ?? '',
        value: selectedId || 'spitch-001',
        onChange: () => onSelect({
          id: 'spitch-001',
          area: area,
          type: target,
          name: mockSpitchOverride.name,
          subject: mockSpitchOverride.subject,
          bodyHtml: mockSpitchOverride.bodyHtml,
        }),
      }, React.createElement('option', { value: 'spitch-001' }, 'Test Spitch'));
    },
  ),
}));

// Bug-fix wiring: the SpitchSelector mock above is the default. The
// token-resolution test overrides the bodyHtml via `vi.mocked`
// (see the test body) and waits for the deferred onSelect to land.


// WU-6 — hoisted store with the local rename value the seam "types".
// Tests mutate `mockLocalRenameValue.value` before clicking a seam
// button to simulate different operator inputs (same pattern as
// `mockRenameValue` for the LAN rename seam below).
const mockLocalRenameValue = vi.hoisted(() => ({ value: 'scan_cliente' }));

// Mock LocalFileDropZone
vi.mock('../LocalFileDropZone', () => ({
  LocalFileDropZone: vi.fn().mockImplementation(
    ({ files, onAdd, onRemove, onRename }: {
      files: File[];
      onAdd?: (files: File[]) => void;
      onRemove?: (index: number) => void;
      onRename?: (index: number, next: string) => void;
    }) => {
      // PR4 — the mock exposes `onAdd` through a test button so the
      // reenvío suite can simulate re-attaching a local file.
      // WU-6 — per-row rename/remove seams: `local-file-rename-mock-<i>`
      // calls `onRename(i, mockLocalRenameValue.value)` (wired only when
      // EmailEditor opts in), `local-file-remove-mock-<i>` calls
      // `onRemove(i)`.
      const rows = files.map((file, i) => React.createElement(
        'div',
        { key: `${file.name}-${i}` },
        React.createElement('button', {
          type: 'button',
          'data-testid': `local-file-rename-mock-${i}`,
          onClick: () => onRename?.(i, mockLocalRenameValue.value),
        }, `rename-local-${i}`),
        React.createElement('button', {
          type: 'button',
          'data-testid': `local-file-remove-mock-${i}`,
          onClick: () => onRemove?.(i),
        }, `remove-local-${i}`),
      ));
      return React.createElement('div', {
        'data-testid': 'local-file-drop-zone',
        'data-file-count': files.length,
      }, React.createElement('button', {
        type: 'button',
        'data-testid': 'local-file-add-mock',
        onClick: () => onAdd?.([new File(['bytes'], 'reenviado.pdf', { type: 'application/pdf' })]),
      }, `${files.length} archivos locales`), ...rows);
    },
  ),
}));

// WU-5 — hoisted store with the override value the rename seam "types".
// Tests mutate `mockRenameValue.value` before clicking the seam button so
// each scenario simulates a different operator input without re-mocking.
const mockRenameValue = vi.hoisted(() => ({ value: 'Informe Juan' }));

// Mock AttachmentList. WU-5 — the mock also exposes the rename contract:
// one button per rename item (`attachment-rename-mock-<i>`); clicking it
// calls `onRename(item.refKey, mockRenameValue.value)`, simulating the
// operator committing an inline rename on that row. Rows with a `null`
// refKey (unmatched) render the button too but never call `onRename`,
// mirroring the real component's non-editable contract.
vi.mock('../AttachmentList', () => ({
  AttachmentList: vi.fn().mockImplementation(
    ({ selectedPatients, renameItems, onRename }: {
      selectedPatients: Record<string, unknown>;
      renameItems?: ReadonlyArray<{ refKey: string | null }>;
      onRename?: (refKey: string, next: string) => void;
    }) => {
      const patientIds = Object.keys(selectedPatients || {});
      const renameButtons = (renameItems ?? []).map((item, i) =>
        React.createElement(
          'button',
          {
            key: i,
            type: 'button',
            'data-testid': `attachment-rename-mock-${i}`,
            onClick: () => {
              if (item.refKey !== null) onRename?.(item.refKey, mockRenameValue.value);
            },
          },
          `rename-${i}`,
        ),
      );
      return React.createElement('div', {
        'data-testid': 'attachment-list',
      }, `${patientIds.length} pacientes seleccionados`, ...renameButtons);
    },
  ),
}));

// Mock EmailBodyEditor (forwardRef — same pattern as BlockNoteEditorView in
// TemplateEditor.test.tsx: export the forwardRef component directly, NOT
// wrapped in vi.fn() + mockImplementation).
vi.mock('../EmailBodyEditor', () => {
  const MockEmailBodyEditor = React.forwardRef(
    ({ onChange }: { onChange?: (html: string) => void }, ref) => {
      React.useImperativeHandle(ref, () => mockEditorHandle);
      React.useEffect(() => {
        mockEditorHandle.onChange = onChange ?? null;
      });
      return React.createElement('div', {
        'data-testid': 'email-body-editor',
      });
    },
  );
  MockEmailBodyEditor.displayName = 'MockEmailBodyEditor';
  return { EmailBodyEditor: MockEmailBodyEditor };
});

// Minimal structural type for the mock's `onSelect` callback.
interface SpitchLike {
  id: string;
  area: string;
  type: string;
  name: string;
  subject: string;
  bodyHtml: string;
}

// Mock fetch for useFirmaCorreo (firma-correo) — EmailEditor no longer
// reads the session user; the signature arrives composed from the API.
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

// PR #3 — capture the args useSendResults is called with so we can
// assert the EmailEditor forwards `fileRefs` correctly. The mock
// returns a stable object so the rest of the EmailEditor render path
// (send button disabled state, toast result/error display)
// keeps working without us having to satisfy the real hook contract.
const mockUseSendResults = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useSendResults', () => ({
  useSendResults: mockUseSendResults,
}));

// ---- Import under test ----
import { EmailEditor } from '../EmailEditor';
// Mocked module import — used to assert the props EmailEditor forwards.
import { AttachmentList } from '../AttachmentList';
import type { Patient, SelectedFileRef } from '../../../domain/entities';
// Real domain fn (browser-safe since D3) — byte-equal auto-name oracle,
// same approach as the WU-4 matcher suite.
import { renameReadyFile } from '../../../domain/ready-files/renameReadyFile';

const mockPatients: Patient[] = [
  {
    id: 'pat-001',
    companyId: 'comp-001',
    name: 'María Elena García López',
    dni: '12345678',
    files: [
      { id: 'file-001', patientId: 'pat-001', name: 'CAMO.pdf', type: 'application/pdf', size: 245760 },
      { id: 'file-002', patientId: 'pat-001', name: 'EMO.pdf', type: 'application/pdf', size: 184320 },
    ],
  },
  {
    id: 'pat-002',
    companyId: 'comp-001',
    name: 'Carlos Alberto Mendoza Rivas',
    dni: '23456789',
    files: [
      { id: 'file-003', patientId: 'pat-002', name: 'Legajo.pdf', type: 'application/pdf', size: 512000 },
    ],
  },
];

const defaultProps = {
  companyId: 'comp-001',
  companyName: 'Holomedic S.A.C.',
  selectedPatients: {
    'pat-001': { patientName: 'María Elena García López', files: ['file-001', 'file-002'] },
  },
  patients: mockPatients,
  // PR #1 — EmailEditor accepts a fileRefs prop so the bridge can
  // hand the location triple + path to the email pipeline. PR #3
  // wires it to useSendResults; PR #1 only carries it.
  fileRefs: [] as SelectedFileRef[],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
  // Default return — a stable object so the EmailEditor render path
  // stays green. PR #3 tests override this per-test to assert hook args.
  mockUseSendResults.mockReturnValue({
    send: vi.fn(),
    isSending: false,
    result: null,
    error: null,
  });
});

describe('EmailEditor', () => {
  it('should render the split layout with both panels', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    // Left panel heading
    expect(screen.getByText('Cómo va el resultado')).toBeInTheDocument();
    // Right panel heading
    expect(screen.getByText('Controles')).toBeInTheDocument();
  });

  it('should render the toggle switch for company/patient', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const toggle = screen.getByRole('switch');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false'); // default: company
    expect(screen.getByText('Enviar a empresa')).toBeInTheDocument();
  });

  it('should toggle target when switch is clicked', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const toggle = screen.getByRole('switch');

    // Click to switch to patient
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Enviar a paciente')).toBeInTheDocument();

    // Click again to switch back
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Enviar a empresa')).toBeInTheDocument();
  });

  it('remounts SpitchSelector on toggle (key={target}) so stale data is dropped', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const toggle = screen.getByRole('switch');

    // Initial: company
    expect(screen.getByTestId('spitch-selector')).toHaveAttribute('data-target', 'company');
    expect(screen.getByTestId('email-preview')).toBeInTheDocument();

    // Toggle to patient — SpitchSelector remounts (new key=patient)
    fireEvent.click(toggle);
    expect(screen.getByTestId('spitch-selector')).toHaveAttribute('data-target', 'patient');
    await waitFor(() => {
      expect(screen.getByTestId('email-preview')).toBeInTheDocument();
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Toggle back to company — remounts again
    fireEvent.click(toggle);
    expect(screen.getByTestId('spitch-selector')).toHaveAttribute('data-target', 'company');
    await waitFor(() => {
      expect(screen.getByTestId('email-preview')).toBeInTheDocument();
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('should render subject input and body preview with editar button', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    expect(screen.getByLabelText('Asunto')).toBeInTheDocument();
    // Right panel shows body preview + "Editar" button (spitch auto-selected)
    expect(screen.getByText('Editar')).toBeInTheDocument();
    // Click "Editar" to open the BlockNote editor (lazy-loaded, needs await)
    fireEvent.click(screen.getByText('Editar'));
    expect(await screen.findByTestId('email-body-editor')).toBeInTheDocument();
  });

  it('should show live preview of the email body', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    // The preview div should contain the rendered HTML
    const previewArea = screen.getByTestId('email-preview');
    expect(previewArea).toHaveTextContent('Contenido de prueba');
  });

  it('should call loadHtml on the editor when a spitch is selected while editing', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    // Editor is not mounted on mount (preview mode), so loadHtml was NOT called
    expect(mockEditorHandle.loadHtml).not.toHaveBeenCalled();

    // Open the editor
    fireEvent.click(screen.getByText('Editar'));

    // The editor mounts via initialHtml prop (not loadHtml), so still not called
    expect(mockEditorHandle.loadHtml).not.toHaveBeenCalled();

    // Now change the spitch — triggers handleSpitchSelect → loadHtml
    const spitchSelect = screen.getByTestId('spitch-selector');
    fireEvent.change(spitchSelect, { target: { value: 'spitch-002' } });

    expect(mockEditorHandle.loadHtml).toHaveBeenCalledTimes(1);
    const htmlArg = mockEditorHandle.loadHtml.mock.calls[0]?.[0];
    expect(htmlArg).toContain('Contenido de prueba');
    expect(htmlArg).not.toContain('{{');
  });

  it('should update the preview when the editor emits onChange', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    // Initial preview from spitch selection
    expect(screen.getByTestId('email-preview')).toHaveTextContent('Contenido de prueba');

    // Open the editor first
    fireEvent.click(screen.getByText('Editar'));

    // Simulate user editing in BlockNote — onChange is stored in the mock
    mockEditorHandle.onChange?.('<p>Texto editado por el operador</p>');

    // findByText waits for the state update to flush and the preview to re-render
    expect(await screen.findByText('Texto editado por el operador')).toBeInTheDocument();
  });

  it('should render the AttachmentList in the left panel', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    expect(screen.getByTestId('attachment-list')).toBeInTheDocument();
  });

  it('should render the SpitchSelector in the right panel', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    expect(screen.getByTestId('spitch-selector')).toBeInTheDocument();
  });

  it('should call send directly when Enviar is clicked (no confirmation modal)', async () => {
    const mockSend = vi.fn();
    mockUseSendResults.mockReturnValue({
      send: mockSend,
      isSending: false,
      result: null,
      error: null,
    });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const sendButton = screen.getByText('Enviar');
    expect(sendButton).toBeInTheDocument();

    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  it('should render Destinatario input empty by default', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const toInput = screen.getByLabelText('Destinatario');
    expect(toInput).toBeInTheDocument();
    // The prefill was removed deliberately (b33497b); the input starts empty.
    expect(toInput).toHaveValue('');
  });

  it('should render CC input empty by default', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const ccInput = screen.getByLabelText('CC');
    expect(ccInput).toBeInTheDocument();
    expect(ccInput).toHaveValue('');
  });

  it('should allow editing Destinatario field', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const toInput = screen.getByLabelText('Destinatario');
    fireEvent.change(toInput, { target: { value: 'doctor@clinica.com, admin@clinica.com' } });
    expect(toInput).toHaveValue('doctor@clinica.com, admin@clinica.com');
  });

  it('should allow editing CC field', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const ccInput = screen.getByLabelText('CC');
    fireEvent.change(ccInput, { target: { value: 'copia@clinica.com' } });
    expect(ccInput).toHaveValue('copia@clinica.com');
  });

  // ================================================================
  // PR #1 — fileRefs prop carried (no behavior change yet)
  // Spec REQ-1: the prop is accepted and threaded through. PR #3
  // will forward it to useSendResults; this PR only adds the
  // signature so the bridge can land in PR #2 without a TypeScript
  // ripple.
  // ================================================================

  it('should accept a non-empty fileRefs prop without throwing or breaking the layout', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const fileRefs: SelectedFileRef[] = [
      { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: 'cert.pdf' },
      { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: '', name: 'emo.pdf' },
    ];

    expect(() => render(<EmailEditor {...defaultProps} fileRefs={fileRefs} />)).not.toThrow();

    // Layout still renders the split panels.
    expect(screen.getByText('Cómo va el resultado')).toBeInTheDocument();
    expect(screen.getByText('Controles')).toBeInTheDocument();
    // AttachmentList still receives its prop (proves the bridging
    // surface is intact).
    expect(screen.getByTestId('attachment-list')).toBeInTheDocument();
  });

  it('should default to an empty fileRefs array when the prop is omitted', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    // Destructure to omit fileRefs — mirrors the WorkerDetailTable
    // call site in PR #3 (fileRefs is forwarded from
    // emailViewData.fileRefs).
    const { fileRefs: _omitted, ...propsWithoutFileRefs } = defaultProps;
    void _omitted;

    expect(() => render(<EmailEditor {...propsWithoutFileRefs} />)).not.toThrow();
    // No envíar available until user fills the recipient — render is enough.
    expect(screen.getByText('Cómo va el resultado')).toBeInTheDocument();
  });

  // ================================================================
  // PR #3 — Spec REQ-1: EmailEditor forwards `fileRefs` to the hook.
  // The hook call is the only place the wire payload originates on
  // the client, so this assertion is the contract.
  // ================================================================

  it('should forward the fileRefs prop to useSendResults (same array, verbatim)', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const fileRefs: SelectedFileRef[] = [
      { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: 'cert.pdf' },
      { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: '', name: 'emo.pdf' },
    ];

    render(<EmailEditor {...defaultProps} fileRefs={fileRefs} />);

    expect(mockUseSendResults).toHaveBeenCalled();
    const lastCall = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1]?.[0] as {
      fileRefs: SelectedFileRef[];
    };
    expect(lastCall.fileRefs).toEqual(fileRefs);
  });

  it('should pass an empty fileRefs array to useSendResults when the prop is omitted', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const { fileRefs: _omitted, ...propsWithoutFileRefs } = defaultProps;
    void _omitted;

    render(<EmailEditor {...propsWithoutFileRefs} />);

    const lastCall = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1]?.[0] as {
      fileRefs: SelectedFileRef[];
    };
    expect(lastCall.fileRefs).toEqual([]);
  });

  it('should NOT pass a `files` array to useSendResults (legacy field removed)', () => {
    // Regression guard — the prior hook signature accepted
    // `files: PatientFile[]`. PR #3 removes that argument and the
    // EmailEditor MUST NOT keep threading it through.
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const lastCall = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1]?.[0] as Record<string, unknown>;
    expect('files' in lastCall).toBe(false);
  });

  it('should preserve the explorer-pane folder path in the fileRefs forwarded to the hook', () => {
    // Triangulation: a fileRef with a non-empty folder path must
    // survive end-to-end. The bridge (PR #1) preserves it; the
    // EmailEditor must not strip it.
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const fileRefs: SelectedFileRef[] = [
      { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'EXAMENES/2024', name: 'emo.pdf' },
    ];

    render(<EmailEditor {...defaultProps} fileRefs={fileRefs} />);

    const lastCall = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1]?.[0] as {
      fileRefs: SelectedFileRef[];
    };
    expect(lastCall.fileRefs[0]?.path).toBe('EXAMENES/2024');
    expect(lastCall.fileRefs[0]?.name).toBe('emo.pdf');
  });

  // ================================================================
  // historial-envios-consolidados PR1 — company context threading:
  // the editor forwards its existing companyId/companyName props to
  // useSendResults so the route can persist them on the history row.
  // ================================================================

  it('should forward companyId and companyName to useSendResults', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    expect(mockUseSendResults).toHaveBeenCalled();
    const lastCall = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1]?.[0] as {
      companyId?: string;
      companyName?: string;
    };
    expect(lastCall.companyId).toBe('comp-001');
    expect(lastCall.companyName).toBe('Holomedic S.A.C.');
  });

  // ================================================================
  // Local files (drag-and-drop from OS)
  // ================================================================

  it('renders the LocalFileDropZone in the left panel', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    expect(screen.getByTestId('local-file-drop-zone')).toBeInTheDocument();
  });

  it('forwards empty localFiles to useSendResults when no files are dropped', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    expect(mockUseSendResults).toHaveBeenCalled();
    const lastCall = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1]?.[0] as {
      localFiles: File[];
    };
    expect(lastCall.localFiles).toEqual([]);
  });

  it('shows the no-files warning when both LAN and local files are absent', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    // selectedPatients has an entry but with no files — button enabled, no fileRefs
    render(<EmailEditor
      {...defaultProps}
      selectedPatients={{
        'pat-001': { patientName: 'Test', files: [] },
      }}
    />);

    const sendButton = screen.getByText('Enviar');
    expect(sendButton).not.toBeDisabled();
    fireEvent.click(sendButton);

    expect(screen.getByText('No hay archivos adjuntos')).toBeInTheDocument();
  });

  // ================================================================
  // Bug-fix wiring — {{dni}}, {{nombrePaciente}} and {{firma}} must
  // resolve in the live preview from the `patients` prop forwarded
  // to interpolateSpitch (EmailEditor.tsx:91-104).
  // ================================================================

  it('should resolve {{dni}} and {{nombrePaciente}} in the live preview from the patients prop', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    // Override the spitch the mock emits by mutating the hoisted store
    // BEFORE render. The mock reads `mockSpitchOverride` on each
    // render so the change is picked up on the very first effect run.
    // We restore the defaults in the finally block so subsequent tests
    // keep the original mock body.
    const previous = { ...mockSpitchOverride };
    mockSpitchOverride.bodyHtml =
      '<p>DNI: {{dni}}</p><p>Paciente: {{nombrePaciente}}</p><div>{{firma}}</div>';
    mockSpitchOverride.subject = 'Resultados de {{nombrePaciente}}';
    mockSpitchOverride.name = 'Plantilla con tokens';

    try {
      render(<EmailEditor {...defaultProps} />);
      const preview = await screen.findByTestId('email-preview');
      // defaultProps.patients[0] = María Elena García López / dni=12345678
      expect(preview.textContent).toContain('12345678');
      expect(preview.textContent).toContain('María Elena García López');
    } finally {
      Object.assign(mockSpitchOverride, previous);
    }
  });

  // ================================================================
  // PR #3 — Spec REQ-008: `EmailEditor.backContext` + `onBack`.
  // The back button renders inside `EmailEditor` (it moved out of
  // the `WorkerDetailTable` overlay wrapper in PR3 — see WU-3.5b).
  // The button is conditional on `onBack` being provided:
  //   - `onBack` provided + `backContext='wizard'`  → "Volver al paso 4"
  //   - `onBack` provided + `backContext='table'`   → "Volver a la tabla"
  //   - `onBack` omitted (default `page.tsx` caller) → no button
  // ================================================================

  it('renders the back button with label "Volver a la tabla" when backContext="table" and onBack is provided', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const onBack = vi.fn();
    render(<EmailEditor {...defaultProps} backContext="table" onBack={onBack} />);

    const back = screen.getByTestId('email-editor-back');
    expect(back).toBeInTheDocument();
    expect(back).toHaveTextContent('Volver a la tabla');
  });

  it('renders the back button with label "Volver al paso 4" when backContext="wizard" and onBack is provided', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const onBack = vi.fn();
    render(<EmailEditor {...defaultProps} backContext="wizard" onBack={onBack} />);

    const back = screen.getByTestId('email-editor-back');
    expect(back).toBeInTheDocument();
    expect(back).toHaveTextContent('Volver al paso 4');
  });

  it('clicking the back button calls onBack', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const onBack = vi.fn();
    render(<EmailEditor {...defaultProps} backContext="wizard" onBack={onBack} />);

    fireEvent.click(screen.getByTestId('email-editor-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  // ================================================================
  // Proyecto / Destino — the `destino` prop must reach
  // interpolateSpitch so {{destino}} resolves in the live preview.
  // The stale-closure guard: a NEW destino value after a rerender must
  // be used, not the value captured when handleSpitchSelect was first
  // created. Without `destino` in that useCallback dep array the
  // callback keeps the OLD value (stale closure) and this test fails.
  // ================================================================

  it('should interpolate {{destino}} with the current destino prop (stale-closure guard)', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const previous = { ...mockSpitchOverride };
    mockSpitchOverride.bodyHtml = '<p>Destino: {{destino}}</p>';
    mockSpitchOverride.subject = 'Proyecto: {{destino}}';
    mockSpitchOverride.name = 'Plantilla destino';

    try {
      const { rerender } = render(
        <EmailEditor {...defaultProps} destino="Proyecto Uno" />,
      );
      const preview = await screen.findByTestId('email-preview');
      expect(preview.textContent).toContain('Destino: Proyecto Uno');
      expect(screen.getByLabelText('Asunto')).toHaveValue('Proyecto: Proyecto Uno');

      // Rerender with a NEW destino — the callback must not be stale.
      rerender(<EmailEditor {...defaultProps} destino="Proyecto Dos" />);
      const spitchSelect = screen.getByTestId('spitch-selector');
      fireEvent.change(spitchSelect, { target: { value: 'spitch-002' } });

      await waitFor(() => {
        expect(screen.getByTestId('email-preview').textContent).toContain(
          'Destino: Proyecto Dos',
        );
      });
      expect(screen.getByLabelText('Asunto')).toHaveValue('Proyecto: Proyecto Dos');
    } finally {
      Object.assign(mockSpitchOverride, previous);
    }
  });

  it('should not render the back button when onBack is undefined (R5 mitigation for page.tsx)', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    // backContext default is 'table', but the absence of onBack must
    // suppress the button entirely — `page.tsx` does not pass onBack
    // and it has its own wrapper back button.
    render(<EmailEditor {...defaultProps} />);

    expect(screen.queryByTestId('email-editor-back')).not.toBeInTheDocument();
  });

  it('does NOT render the back button when backContext="wizard" but onBack is undefined', () => {
    // Triangulation: backContext alone is not enough — the absence of
    // onBack must suppress the button even when backContext is set.
    // Defensive: a caller setting backContext without onBack would
    // otherwise render a dead button.
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} backContext="wizard" />);

    expect(screen.queryByTestId('email-editor-back')).not.toBeInTheDocument();
  });

  it('backContext defaults to "table" — passing only onBack yields the table label', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const onBack = vi.fn();
    render(<EmailEditor {...defaultProps} onBack={onBack} />);

    // Default `backContext` is 'table' — the label is "Volver a la tabla".
    expect(screen.getByTestId('email-editor-back')).toHaveTextContent('Volver a la tabla');
  });

  // ================================================================
  // historial-envios-consolidados PR4 — reenvío seeding (OQ5):
  // initialEmail seeds the existing useState initializers; the
  // SpitchSelector auto-select must NOT clobber the seeded values;
  // unavailableAttachments render reference-only (BR11); the Send
  // disable relaxes to "selectedPatients AND fileRefs empty".
  // ================================================================

  it('seeds to/cc/subject/body from initialEmail; the legacy appended signature is stripped and never re-appended', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    // Historical row: the body was persisted WITH the legacy appended
    // signature (sentinel-wrapped). The editor seeds through
    // stripSignatureHtml; the signature itself now comes only from the
    // composed API — it must never re-appear client-side.
    const persistedBody =
      '<p>Cuerpo del envío original</p>' +
      '<!--holomedic-firma--><table><tr><td>Firma histórica</td></tr></table><!--holomedic-firma-->';

    render(
      <EmailEditor
        {...defaultProps}
        initialEmail={{
          to: 'destino@empresa.com, segundo@empresa.com',
          cc: 'copia@empresa.com',
          subject: 'Resultados consolidados (reenvío)',
          bodyHtml: persistedBody,
        }}
      />,
    );

    expect(screen.getByLabelText('Destinatario')).toHaveValue('destino@empresa.com, segundo@empresa.com');
    expect(screen.getByLabelText('CC')).toHaveValue('copia@empresa.com');
    expect(screen.getByLabelText('Asunto')).toHaveValue('Resultados consolidados (reenvío)');

    // Preview = seeded body verbatim (legacy block stripped once).
    const preview = screen.getByTestId('email-preview');
    expect(preview.textContent).toContain('Cuerpo del envío original');
    expect(preview.textContent).not.toContain('Firma histórica');

    // The dispatched html carries no legacy signature either.
    const lastCall = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1]?.[0] as {
      html: string;
    };
    expect(lastCall.html).not.toContain('Firma histórica');
    expect(lastCall.html).not.toContain('<!--holomedic-firma-->');
  });

  it('applies a manual spitch change after a seeded mount (the swallow latch releases)', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(
      <EmailEditor
        {...defaultProps}
        initialEmail={{ to: 'a@b.com', subject: 'Asunto original', bodyHtml: '<p>Original</p>' }}
      />,
    );

    // Seeded mount: the mock's auto-select was swallowed.
    expect(screen.getByLabelText('Asunto')).toHaveValue('Asunto original');

    // An explicit user selection replaces the seeded content.
    fireEvent.change(screen.getByTestId('spitch-selector'), { target: { value: 'spitch-002' } });

    expect(screen.getByLabelText('Asunto')).toHaveValue('Asunto de prueba');
  });

  it('renders unavailableAttachments as a grey reference-only list with the "ya no disponible" badge', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(
      <EmailEditor
        {...defaultProps}
        unavailableAttachments={[
          { filename: 'informe-local.pdf', contentType: 'application/pdf', sizeBytes: 2048 },
        ]}
      />,
    );

    const list = screen.getByTestId('unavailable-attachments');
    expect(list).toHaveTextContent('informe-local.pdf');
    expect(screen.getAllByText('ya no disponible').length).toBeGreaterThanOrEqual(1);

    // Reference-only (BR11): the metadata never enters the send pipeline.
    const lastCall = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1]?.[0] as {
      localFiles: File[];
    };
    expect(lastCall.localFiles).toEqual([]);
  });

  it('keeps Enviar enabled when selectedPatients is empty but fileRefs are present (relaxed disable)', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(
      <EmailEditor
        {...defaultProps}
        selectedPatients={{}}
        patients={[]}
        fileRefs={[
          { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: 'cert.pdf' },
        ]}
      />,
    );

    expect(screen.getByText('Enviar')).not.toBeDisabled();
  });

  it('still disables Enviar when both selectedPatients and fileRefs are empty', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} selectedPatients={{}} patients={[]} fileRefs={[]} />);

    expect(screen.getByText('Enviar')).toBeDisabled();
  });

  it('lets a local-only reenvío send after re-adding files (relaxed disable)', async () => {
    const mockSend = vi.fn();
    mockUseSendResults.mockReturnValue({
      send: mockSend,
      isSending: false,
      result: null,
      error: null,
    });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    // A local-only history row reconstructs to empty selectedPatients
    // AND empty fileRefs — nothing is sendable until files are
    // re-attached (the original local bytes were never persisted, BR11).
    render(
      <EmailEditor
        {...defaultProps}
        selectedPatients={{}}
        patients={[]}
        fileRefs={[]}
        unavailableAttachments={[{ filename: 'informe-local.pdf' }]}
      />,
    );

    // Disabled while there is no context at all.
    expect(screen.getByText('Enviar')).toBeDisabled();

    // Re-attach the file through the drop zone.
    fireEvent.click(screen.getByTestId('local-file-add-mock'));
    expect(await screen.findByTestId('local-file-drop-zone')).toHaveAttribute('data-file-count', '1');

    // The relaxed disable now allows the re-send — and the local file
    // flows into the send pipeline (no no-files warning needed).
    const sendButton = screen.getByText('Enviar');
    expect(sendButton).not.toBeDisabled();
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
    const lastCall = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1]?.[0] as {
      localFiles: File[];
    };
    expect(lastCall.localFiles).toHaveLength(1);
  });

  // ================================================================
  // editor-firmas PR4 — send-path signature contract: the composed
  // firmaHtml is fetched from GET /api/plantillas/firma and inlined at
  // {{firma}} by the UNTOUCHED token resolver (verbatim non-empty /
  // `[Falta configurar firma]` fallback when empty). The legacy inline
  // signature editor and client-side signature append are gone.
  // ================================================================

  function firmaFetchResponse(firmaHtml: string) {
    return {
      ok: true,
      json: () => Promise.resolve({ success: true, firma: null, firmaHtml }),
    };
  }

  it('inlines the fetched firmaHtml at {{firma}} when a spitch is selected after the fetch resolves', async () => {
    // Deferred fetch — deterministic control over resolution order.
    let resolveFirma!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { resolveFirma = resolve; }),
    );

    const previous = { ...mockSpitchOverride };
    mockSpitchOverride.bodyHtml = '<p>Contenido de prueba</p><div>{{firma}}</div>';
    mockSpitchOverride.name = 'Plantilla con firma';

    try {
      render(<EmailEditor {...defaultProps} />);
      const preview = await screen.findByTestId('email-preview');

      // Mount-time auto-select ran BEFORE the firma fetch resolved:
      // the fallback placeholder is baked into the body...
      expect(preview.textContent).toContain('[Falta configurar firma]');

      // ...the fetch resolves — the marker-replacement recovery effect
      // swaps the placeholder for the composed firma; the explicit
      // reselect below re-interpolates with the firma already at hand.
      await act(async () => {
        resolveFirma(firmaFetchResponse('<table><tr><td>Dra. Firma Guardada</td></tr></table>'));
      });
      fireEvent.change(screen.getByTestId('spitch-selector'), { target: { value: 'spitch-002' } });

      await waitFor(() => {
        expect(screen.getByTestId('email-preview').textContent).toContain('Dra. Firma Guardada');
      });
      expect(screen.getByTestId('email-preview').innerHTML).not.toContain('{{firma}}');
    } finally {
      Object.assign(mockSpitchOverride, previous);
    }
  });

  it('recovers the baked firma marker automatically when the deferred firma fetch resolves (no reselect)', async () => {
    // Deferred fetch — the mount-time auto-select bakes the fallback
    // marker; resolving the fetch must swap it in place.
    let resolveFirma!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { resolveFirma = resolve; }),
    );

    const previous = { ...mockSpitchOverride };
    mockSpitchOverride.bodyHtml = '<p>Contenido de prueba</p><div>{{firma}}</div>';
    mockSpitchOverride.name = 'Plantilla con firma';

    try {
      render(<EmailEditor {...defaultProps} />);
      const preview = await screen.findByTestId('email-preview');
      expect(preview.textContent).toContain('[Falta configurar firma]');

      // Operator has the editor open when the firma lands — the visual
      // editor must be synced with the recovered html (loadHtml seam).
      fireEvent.click(screen.getByText('Editar'));
      expect(await screen.findByTestId('email-body-editor')).toBeInTheDocument();
      mockEditorHandle.loadHtml.mockClear();

      await act(async () => {
        resolveFirma(firmaFetchResponse('<table><tr><td>Dra. Firma Guardada</td></tr></table>'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('email-preview').textContent).toContain('Dra. Firma Guardada');
      });
      expect(screen.getByTestId('email-preview').innerHTML).not.toContain('[Falta configurar firma]');
      expect(mockEditorHandle.loadHtml).toHaveBeenCalledTimes(1);
      const htmlArg = mockEditorHandle.loadHtml.mock.calls[0]?.[0] ?? '';
      expect(htmlArg).toContain('Contenido de prueba');
      expect(htmlArg).toContain('Dra. Firma Guardada');
      expect(htmlArg).not.toContain('[Falta configurar firma]');
    } finally {
      Object.assign(mockSpitchOverride, previous);
    }
  });

  it('leaves the body untouched when the deferred firma resolves after the operator edited the marker away', async () => {
    let resolveFirma!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { resolveFirma = resolve; }),
    );

    const previous = { ...mockSpitchOverride };
    mockSpitchOverride.bodyHtml = '<p>Contenido de prueba</p><div>{{firma}}</div>';
    mockSpitchOverride.name = 'Plantilla con firma';

    try {
      render(<EmailEditor {...defaultProps} />);
      await screen.findByTestId('email-preview');
      expect(screen.getByTestId('email-preview').textContent).toContain('[Falta configurar firma]');

      // Operator edits the body and removes the marker.
      fireEvent.click(screen.getByText('Editar'));
      expect(await screen.findByTestId('email-body-editor')).toBeInTheDocument();
      mockEditorHandle.onChange?.('<p>Cuerpo editado por el operador</p>');
      expect(await screen.findByText('Cuerpo editado por el operador')).toBeInTheDocument();
      mockEditorHandle.loadHtml.mockClear();

      await act(async () => {
        resolveFirma(firmaFetchResponse('<table><tr><td>Dra. Firma Guardada</td></tr></table>'));
      });

      // Body untouched: no marker → no replacement, no editor reload.
      expect(screen.getByTestId('email-preview').textContent).toContain('Cuerpo editado por el operador');
      expect(screen.getByTestId('email-preview').textContent).not.toContain('Dra. Firma Guardada');
      expect(mockEditorHandle.loadHtml).not.toHaveBeenCalled();
    } finally {
      Object.assign(mockSpitchOverride, previous);
    }
  });

  it('keeps the [Falta configurar firma] marker when the deferred firma fetch resolves empty', async () => {
    let resolveFirma!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { resolveFirma = resolve; }),
    );

    const previous = { ...mockSpitchOverride };
    mockSpitchOverride.bodyHtml = '<p>Contenido de prueba</p><div>{{firma}}</div>';
    mockSpitchOverride.name = 'Plantilla con firma';

    try {
      render(<EmailEditor {...defaultProps} />);
      await screen.findByTestId('email-preview');
      expect(screen.getByTestId('email-preview').textContent).toContain('[Falta configurar firma]');

      // No saved signature (firmaHtml: '') → the spec fallback stays.
      await act(async () => {
        resolveFirma(firmaFetchResponse(''));
      });

      expect(screen.getByTestId('email-preview').textContent).toContain('[Falta configurar firma]');
      expect(screen.getByTestId('email-preview').textContent).not.toContain('Dra. Firma Guardada');
    } finally {
      Object.assign(mockSpitchOverride, previous);
    }
  });

  it('inlines the [Falta configurar firma] fallback when the user has no saved signature', async () => {
    mockFetch.mockResolvedValue(firmaFetchResponse(''));

    const previous = { ...mockSpitchOverride };
    mockSpitchOverride.bodyHtml = '<p>Contenido de prueba</p><div>{{firma}}</div>';
    mockSpitchOverride.name = 'Plantilla con firma';

    try {
      render(<EmailEditor {...defaultProps} />);

      const preview = await screen.findByTestId('email-preview');
      expect(preview.textContent).toContain('Contenido de prueba');
      expect(preview.textContent).toContain('[Falta configurar firma]');
      expect(preview.innerHTML).not.toContain('{{firma}}');
    } finally {
      Object.assign(mockSpitchOverride, previous);
    }
  });

  it('no longer renders an inline signature editor nor per-email signature inputs', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);
    await screen.findByTestId('email-preview');

    // Legacy editor gone: open the body editor — only the WYSIWYG is there.
    fireEvent.click(screen.getByText('Editar'));
    expect(await screen.findByTestId('email-body-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('signature-editor')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('María Pérez')).not.toBeInTheDocument();
  });

  it('dispatches bodyHtml verbatim to useSendResults — no appended signature block', async () => {
    // Deferred fetch + explicit reselect so the composed firma is
    // resolved before the interpolation under assertion.
    let resolveFirma!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { resolveFirma = resolve; }),
    );

    const previous = { ...mockSpitchOverride };
    mockSpitchOverride.bodyHtml = '<p>Contenido de prueba</p><div>{{firma}}</div>';
    mockSpitchOverride.name = 'Plantilla con firma';

    try {
      render(<EmailEditor {...defaultProps} />);
      await screen.findByTestId('email-preview');

      await act(async () => {
        resolveFirma(firmaFetchResponse('<table><tr><td>Dra. Firma Guardada</td></tr></table>'));
      });
      fireEvent.change(screen.getByTestId('spitch-selector'), { target: { value: 'spitch-002' } });
      await screen.findAllByText('Dra. Firma Guardada');

      const lastCall = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1]?.[0] as {
        html: string;
      };
      expect(lastCall.html).toContain('Contenido de prueba');
      expect(lastCall.html).toContain('Dra. Firma Guardada');
      expect(lastCall.html).not.toContain('<!--holomedic-firma-->');
      expect(lastCall.html).not.toContain('{{firma}}');
    } finally {
      Object.assign(mockSpitchOverride, previous);
    }
  });

  // ================================================================
  // WU-5 — Composer UI (REQ-01 / REQ-03): inline attachment rename.
  //
  // Fixtures follow the real flows' shape (buildReenvioViewData /
  // FilesModal): `selectedPatients` keyed by DNI, display file ids are
  // the `path::name` composites (PatientFile.id convention), and
  // `patients[].id === dni` so both `EmailEditor.selectedFiles` and the
  // WU-4 matcher resolve the same rows.
  //
  // The auto-name oracle is the REAL domain fn (byte-equal preview
  // contract pinned by WU-4); no hard-coded expectations.
  // ================================================================

  describe('WU-5 — inline attachment rename (REQ-01/REQ-03)', () => {
    // Composite ref key — the `splitFileRef` convention the WU-4 helper
    // addresses overrides by.
    const refKeyOf = (r: SelectedFileRef): string =>
      [r.ruc, r.dni, r.idAten, r.path, r.name].join('::');

    const renamePatients: Patient[] = [
      {
        id: '12345678',
        companyId: 'comp-001',
        name: 'María Elena García López',
        dni: '12345678',
        files: [
          { id: 'LEGAJOS::123CERT.pdf', patientId: '12345678', name: '123CERT.pdf', type: 'application/pdf', size: 100 },
          { id: 'LEGAJOS::456CERT.pdf', patientId: '12345678', name: '456CERT.pdf', type: 'application/pdf', size: 100 },
        ],
      },
    ];

    const renameFileRefs: SelectedFileRef[] = [
      { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: '123CERT.pdf' },
      { ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: '456CERT.pdf' },
    ];

    const renameSelection = {
      '12345678': {
        patientName: 'María Elena García López',
        files: ['LEGAJOS::123CERT.pdf', 'LEGAJOS::456CERT.pdf'],
      },
    };

    // Single-file base: one selected ready file — no duplicate noise.
    const singleProps = {
      ...defaultProps,
      selectedPatients: {
        '12345678': {
          patientName: 'María Elena García López',
          files: ['LEGAJOS::123CERT.pdf'],
        },
      },
      patients: renamePatients,
      fileRefs: [renameFileRefs[0]!],
      nombreCompleto: 'María Elena García López',
      destino: 'Proyecto Uno',
    };

    // Two ready files of the same patient: both auto-rename to the SAME
    // delivery name (CAMO-María...-Proyecto Uno.pdf) — the natural
    // auto-auto duplicate for the D6 warning scenario.
    const dupProps = {
      ...defaultProps,
      selectedPatients: renameSelection,
      patients: renamePatients,
      fileRefs: renameFileRefs,
      nombreCompleto: 'María Elena García López',
      destino: 'Proyecto Uno',
    };

    const auto123 = renameReadyFile({
      rawName: '123CERT.pdf',
      nombreCompleto: 'María Elena García López',
      destino: 'Proyecto Uno',
    });

    const listMock = vi.mocked(AttachmentList);

    interface CapturedRenameProps {
      renameItems?: Array<Record<string, unknown>>;
      onRename?: (refKey: string, next: string) => void;
    }

    const lastListProps = (): CapturedRenameProps => {
      const last = listMock.mock.calls[listMock.mock.calls.length - 1];
      return (last?.[0] ?? {}) as unknown as CapturedRenameProps;
    };

    interface LastHookArgs {
      fileRefs: Array<SelectedFileRef & { deliveryName?: string }>;
    }

    const lastHookArgs = (): LastHookArgs => {
      const last = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1];
      return (last?.[0] ?? {}) as LastHookArgs;
    };

    const renderSending = (props: typeof singleProps) => {
      const mockSend = vi.fn();
      mockUseSendResults.mockReturnValue({
        send: mockSend,
        isSending: false,
        result: null,
        error: null,
      });
      render(<EmailEditor {...props} />);
      return mockSend;
    };

    it('derives rename items from the selection and forwards them to AttachmentList with the auto preview', () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
      render(<EmailEditor {...singleProps} />);

      const props = lastListProps();
      expect(props.renameItems).toHaveLength(1);
      const item = props.renameItems![0] as Record<string, unknown>;
      expect(item.refKey).toBe(refKeyOf(renameFileRefs[0]!));
      expect(item.displayName).toBe('123CERT.pdf');
      expect(item.storedName).toBe('123CERT.pdf');
      // Byte-equal auto preview (ready file → CAMO-María...-Proyecto Uno.pdf).
      expect(item.effectiveName).toBe(auto123);
      // The view carries the auto name separately (input placeholder / secondary text).
      expect(item.autoName).toBe(auto123);
      expect(item.overridden).toBe(false);
      expect(item.issue).toBeNull();
      expect(typeof props.onRename).toBe('function');
    });

    it('typing an override shows the validated effective name and merges deliveryName into the refs for useSendResults', () => {
      renderSending(singleProps);

      // Operator types "Informe Juan" on the ready file — forcePdf (D5)
      // validates it to "Informe Juan.pdf".
      fireEvent.click(screen.getByTestId('attachment-rename-mock-0'));

      const props = lastListProps();
      const item = props.renameItems![0] as Record<string, unknown>;
      expect(item.effectiveName).toBe('Informe Juan.pdf');
      expect(item.overridden).toBe(true);
      expect(item.issue).toBeNull();

      // FormData `fileRefs` JSON carries the override (hook receives the
      // merged refs — REQ-04 client side of the contract).
      const args = lastHookArgs();
      expect(args.fileRefs[0]!.deliveryName).toBe('Informe Juan.pdf');
    });

    it('clearing the override reverts the chip to the auto name and sends NO deliveryName', () => {
      renderSending(singleProps);

      fireEvent.click(screen.getByTestId('attachment-rename-mock-0'));
      expect(lastHookArgs().fileRefs[0]!.deliveryName).toBe('Informe Juan.pdf');

      // Operator clears the field — REQ-01 fallback, no override travels.
      mockRenameValue.value = '';
      fireEvent.click(screen.getByTestId('attachment-rename-mock-0'));

      const props = lastListProps();
      const item = props.renameItems![0] as Record<string, unknown>;
      expect(item.overridden).toBe(false);
      expect(item.effectiveName).toBe(auto123);

      const args = lastHookArgs();
      expect('deliveryName' in args.fileRefs[0]!).toBe(false);
    });

    it('blocks send and names the STORED file when an override fails validation (traversal)', () => {
      const mockSend = renderSending(singleProps);

      mockRenameValue.value = '../../evil.pdf';
      fireEvent.click(screen.getByTestId('attachment-rename-mock-0'));

      // Blocking red error naming the stored (disk) name — REQ-03.
      const errorBox = screen.getByTestId('delivery-name-error');
      expect(errorBox.textContent).toContain('123CERT.pdf');

      fireEvent.click(screen.getByText('Enviar'));
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('blocks send on an override-involved duplicate, naming the colliding effective name', () => {
      const mockSend = renderSending(dupProps);

      // Both files overridden to the same delivery name → blocking (D6:
      // the server would 400 anyway).
      mockRenameValue.value = 'Informe Final';
      fireEvent.click(screen.getByTestId('attachment-rename-mock-0'));
      fireEvent.click(screen.getByTestId('attachment-rename-mock-1'));

      const errorBox = screen.getByTestId('delivery-name-error');
      expect(errorBox.textContent).toContain('Informe Final.pdf');

      fireEvent.click(screen.getByText('Enviar'));
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('warns dismissibly and still sends on an auto-auto duplicate', () => {
      const mockSend = renderSending(dupProps);

      // No overrides: both ready files auto-rename to the same name.
      // D6 — auto-auto duplicates are ALLOWED; the client only warns.
      fireEvent.click(screen.getByText('Enviar'));

      expect(screen.queryByTestId('delivery-name-error')).not.toBeInTheDocument();
      expect(mockToast.warning).toHaveBeenCalledTimes(1);
      expect(String(mockToast.warning.mock.calls[0]?.[0])).toContain(auto123);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('merges the override into the addressed ref only (refKey addressing, no index bleed)', () => {
      renderSending(dupProps);

      mockRenameValue.value = 'Solo Segundo';
      fireEvent.click(screen.getByTestId('attachment-rename-mock-1'));

      const args = lastHookArgs();
      expect('deliveryName' in args.fileRefs[0]!).toBe(false);
      expect(args.fileRefs[1]!.deliveryName).toBe('Solo Segundo.pdf');
    });
  });

  // ================================================================
  // WU-6 — Local attachment rename (REQ-02).
  //
  // The rename applies `new File([f], next, f)` (content/type/size
  // preserved) through the SAME override/validation flow as the LAN
  // rows: raw input in state, validated at render via the shared
  // validator with `forcePdf: false` (D5 — locals are sanitize-only,
  // no `.pdf` forcing), invalid values block send through the same
  // red box naming the stored file.
  // ================================================================
  describe('WU-6 — local file rename (REQ-02)', () => {
    const localOnlyProps = { ...defaultProps, selectedPatients: {}, patients: [] };

    // LAN fixture for the collision test: one ready file whose auto
    // delivery name comes from the REAL domain fn (byte-equal oracle,
    // same approach as WU-5).
    const lanPatients: Patient[] = [
      {
        id: '12345678',
        companyId: 'comp-001',
        name: 'María Elena García López',
        dni: '12345678',
        files: [
          { id: 'LEGAJOS::123CERT.pdf', patientId: '12345678', name: '123CERT.pdf', type: 'application/pdf', size: 100 },
        ],
      },
    ];
    const lanAutoName = renameReadyFile({
      rawName: '123CERT.pdf',
      nombreCompleto: 'María Elena García López',
      destino: 'Proyecto Uno',
    });

    const lastLocalFiles = (): File[] => {
      const last = mockUseSendResults.mock.calls[mockUseSendResults.mock.calls.length - 1];
      return ((last?.[0] ?? {}) as { localFiles: File[] }).localFiles;
    };

    const renderLocalEditor = () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
      return render(<EmailEditor {...localOnlyProps} />);
    };

    const addLocalFile = async (count: number) => {
      for (let i = 0; i < count; i += 1) {
        fireEvent.click(screen.getByTestId('local-file-add-mock'));
      }
      await waitFor(() => {
        expect(screen.getByTestId('local-file-drop-zone')).toHaveAttribute('data-file-count', String(count));
      });
    };

    it('renaming a local file creates a new File preserving content, type and size (new File([f], next, f))', async () => {
      renderLocalEditor();
      await addLocalFile(1);

      mockLocalRenameValue.value = 'scan_cliente';
      fireEvent.click(screen.getByTestId('local-file-rename-mock-0'));

      const files = lastLocalFiles();
      expect(files).toHaveLength(1);
      expect(files[0]!.name).toBe('scan_cliente');
      expect(files[0]!.type).toBe('application/pdf');
      expect(files[0]!.size).toBe(5);
      const content = await files[0]!.text();
      expect(content).toBe('bytes');
    });

    it('locals are sanitize-only — an extension-less name applies verbatim with NO .pdf forcing (D5)', async () => {
      renderLocalEditor();
      await addLocalFile(1);

      mockLocalRenameValue.value = 'Informe';
      fireEvent.click(screen.getByTestId('local-file-rename-mock-0'));

      expect(lastLocalFiles()[0]!.name).toBe('Informe');
    });

    it('rejects traversal overrides: file keeps its name and send is blocked naming the stored file (REQ-03)', async () => {
      const mockSend = vi.fn();
      mockUseSendResults.mockReturnValue({ send: mockSend, isSending: false, result: null, error: null });
      renderLocalEditor();
      await addLocalFile(1);

      mockLocalRenameValue.value = '../../evil.pdf';
      fireEvent.click(screen.getByTestId('local-file-rename-mock-0'));

      // The File is NOT renamed (invalid raw input never applies)...
      expect(lastLocalFiles()[0]!.name).toBe('reenviado.pdf');
      // ...and the shared blocking error names the stored file.
      expect(screen.getByTestId('delivery-name-error').textContent).toContain('reenviado.pdf');

      fireEvent.click(screen.getByText('Enviar'));
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('clearing the override reverts the file to its original name', async () => {
      renderLocalEditor();
      await addLocalFile(1);

      mockLocalRenameValue.value = 'informe';
      fireEvent.click(screen.getByTestId('local-file-rename-mock-0'));
      expect(lastLocalFiles()[0]!.name).toBe('informe');

      mockLocalRenameValue.value = '';
      fireEvent.click(screen.getByTestId('local-file-rename-mock-0'));
      expect(lastLocalFiles()[0]!.name).toBe('reenviado.pdf');
      expect(screen.queryByTestId('delivery-name-error')).not.toBeInTheDocument();
    });

    it('removing an earlier local file keeps overrides aligned to the surviving rows', async () => {
      renderLocalEditor();
      await addLocalFile(2);

      // Rename the SECOND file, then remove the first.
      mockLocalRenameValue.value = 'segundo';
      fireEvent.click(screen.getByTestId('local-file-rename-mock-1'));
      expect(lastLocalFiles()[1]!.name).toBe('segundo');

      fireEvent.click(screen.getByTestId('local-file-remove-mock-0'));

      const files = lastLocalFiles();
      expect(files).toHaveLength(1);
      // The surviving file kept ITS rename (no off-by-one bleed).
      expect(files[0]!.name).toBe('segundo');
    });

    it('blocks send when a local override collides with a LAN effective delivery name (D6)', async () => {
      const mockSend = vi.fn();
      mockUseSendResults.mockReturnValue({ send: mockSend, isSending: false, result: null, error: null });
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

      render(
        <EmailEditor
          {...defaultProps}
          selectedPatients={{
            '12345678': { patientName: 'María Elena García López', files: ['LEGAJOS::123CERT.pdf'] },
          }}
          patients={lanPatients}
          fileRefs={[{ ruc: '20123456789', dni: '12345678', idAten: 'AT-001', path: 'LEGAJOS', name: '123CERT.pdf' }]}
          nombreCompleto="María Elena García López"
          destino="Proyecto Uno"
        />,
      );
      await addLocalFile(1);

      mockLocalRenameValue.value = lanAutoName;
      fireEvent.click(screen.getByTestId('local-file-rename-mock-0'));

      const errorBox = screen.getByTestId('delivery-name-error');
      expect(errorBox.textContent).toContain('duplicados');
      expect(errorBox.textContent).toContain(lanAutoName);

      fireEvent.click(screen.getByText('Enviar'));
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
