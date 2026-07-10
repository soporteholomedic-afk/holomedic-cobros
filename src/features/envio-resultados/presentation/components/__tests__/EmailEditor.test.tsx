import React, { useEffect, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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


// Mock LocalFileDropZone
vi.mock('../LocalFileDropZone', () => ({
  LocalFileDropZone: vi.fn().mockImplementation(
    ({ files, onAdd, onRemove }: { files: File[]; onAdd: (f: File[]) => void; onRemove: (i: number) => void }) => {
      return React.createElement('div', {
        'data-testid': 'local-file-drop-zone',
        'data-file-count': files.length,
      }, `${files.length} archivos locales`);
    },
  ),
}));

// Mock AttachmentList
vi.mock('../AttachmentList', () => ({
  AttachmentList: vi.fn().mockImplementation(
    ({ selectedPatients }: { selectedPatients: Record<string, unknown> }) => {
      const patientIds = Object.keys(selectedPatients || {});
      return React.createElement('div', {
        'data-testid': 'attachment-list',
      }, `${patientIds.length} pacientes seleccionados`);
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

// Mock fetch for useSendResults
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

// PR #3 — capture the args useSendResults is called with so we can
// assert the EmailEditor forwards `fileRefs` correctly. The mock
// returns a stable object so the rest of the EmailEditor render path
// (send button disabled state, SendConfirmation result/error display)
// keeps working without us having to satisfy the real hook contract.
const mockUseSendResults = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useSendResults', () => ({
  useSendResults: mockUseSendResults,
}));

// ---- Import under test ----
import { EmailEditor } from '../EmailEditor';
import type { Patient, SelectedFileRef } from '../../../domain/entities';

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

  it('should open confirmation modal when Enviar is clicked', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    // Confirmation modal should not be visible initially
    expect(screen.queryByText(/¿Enviar resultados/)).not.toBeInTheDocument();

    const sendButton = screen.getByText('Enviar');
    expect(sendButton).toBeInTheDocument();

    fireEvent.click(sendButton);

    // Confirmation modal should be visible
    expect(screen.getByText(/¿Enviar resultados/)).toBeInTheDocument();
  });

  it('should render Destinatario input pre-filled with patient names', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const toInput = screen.getByLabelText('Destinatario');
    expect(toInput).toBeInTheDocument();
    expect(toInput).toHaveValue('María Elena García López');
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
      // default signature is resolved by default
      expect(preview.textContent).toContain('Blanca Chirinos');
    } finally {
      Object.assign(mockSpitchOverride, previous);
    }
  });
});
