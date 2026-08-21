import React, { useEffect, useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sonner toasts
const mockToast = vi.hoisted(() => ({
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
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


// Mock LocalFileDropZone
vi.mock('../LocalFileDropZone', () => ({
  LocalFileDropZone: vi.fn().mockImplementation(
    ({ files, onAdd }: { files: File[]; onAdd?: (files: File[]) => void }) => {
      // PR4 — the mock exposes `onAdd` through a test button so the
      // reenvío suite can simulate re-attaching a local file.
      return React.createElement('div', {
        'data-testid': 'local-file-drop-zone',
        'data-file-count': files.length,
      }, React.createElement('button', {
        type: 'button',
        'data-testid': 'local-file-add-mock',
        onClick: () => onAdd?.([new File(['bytes'], 'reenviado.pdf', { type: 'application/pdf' })]),
      }, `${files.length} archivos locales`));
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

// usuarios-nombre-firma — mock useAuth so the session-seeded
// signature is driven by a deterministic user. The holder is mutable
// so individual tests can simulate late-auth (null → user).
const mockAuthUser = vi.hoisted(() => ({
  user: null as
    | null
    | { idUsuario: string; usuario: string; nombre: string; area: string; permisos: string[]; activo: boolean },
}));
vi.mock('@/features/auth/presentation/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockAuthUser.user,
    loading: mockAuthUser.user === null,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const sessionUser = {
  idUsuario: 'u-1',
  usuario: 'mperez',
  nombre: 'María Pérez',
  area: 'consolidados',
  permisos: ['consolidados'],
  activo: true,
};

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
import type { Patient, SelectedFileRef } from '../../../domain/entities';
import { buildSignatureHtml, DEFAULT_SIGNATURE_DATA } from '../../helpers/signatureData';

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
  // Default session: María Pérez is logged in (signature seeding).
  mockAuthUser.user = sessionUser;
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
      // default signature is resolved by default — seeded from the
      // mocked session user (usuarios-nombre-firma).
      expect(preview.textContent).toContain('María Pérez');
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

  it('seeds to/cc/subject/body from initialEmail; the signature is re-appended exactly once (no duplication)', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    // The persisted row was sent by the mocked session user — the
    // fixture signature carries her name (no hardcoded default).
    const persistedBody =
      '<p>Cuerpo del envío original</p>' +
      buildSignatureHtml({ ...DEFAULT_SIGNATURE_DATA, name: 'María Pérez' });

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

    // Preview = seeded body (stripped) + signature re-appended by the
    // htmlBody memo — the persisted signature must NOT appear twice.
    const preview = screen.getByTestId('email-preview');
    expect(preview.textContent).toContain('Cuerpo del envío original');
    expect(preview.textContent?.match(/María Pérez/g)).toHaveLength(1);
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
  // usuarios-nombre-firma — session-seeded editable signature:
  // the editor seeds the signature name from useAuth(), stays
  // editable before sending, re-seeds when auth resolves late, and
  // re-seeds on a fresh spitch selection.
  // ================================================================

  it('seeds the signature name from the authenticated user (María Pérez)', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    const preview = await screen.findByTestId('email-preview');
    expect(preview.textContent).toContain('María Pérez');
    expect(preview.textContent).not.toContain('Blanca Chirinos');
  });

  it('keeps the signature editable — changing the name field updates only the outgoing email', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    // Open the body/signature editor.
    fireEvent.click(screen.getByText('Editar'));

    // The signature "Nombre" input is seeded with the session name.
    const nameInput = screen.getByDisplayValue('María Pérez');
    fireEvent.change(nameInput, { target: { value: 'María E. Pérez' } });

    // The rebuilt signature (preview) carries the edited name.
    await waitFor(() => {
      expect(screen.getByTestId('email-preview').textContent).toContain('María E. Pérez');
    });
  });

  it('re-seeds from the session user when auth resolves after mount (late auth, pristine signature)', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    // Session still loading at mount → default-name signature first.
    mockAuthUser.user = null;
    const { rerender } = render(<EmailEditor {...defaultProps} />);

    const previewBefore = await screen.findByTestId('email-preview');
    expect(previewBefore.textContent).toContain('Blanca Chirinos');

    // Auth resolves → pristine-ref effect re-seeds.
    mockAuthUser.user = sessionUser;
    rerender(<EmailEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('email-preview').textContent).toContain('María Pérez');
    });
    expect(screen.getByTestId('email-preview').textContent).not.toContain('Blanca Chirinos');
  });

  it('does NOT clobber a manually edited signature when auth resolves late (pristine latch)', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    mockAuthUser.user = null;
    const { rerender } = render(<EmailEditor {...defaultProps} />);

    // Operator edits the signature name while auth is loading.
    fireEvent.click(screen.getByText('Editar'));
    const nameInput = screen.getByDisplayValue(DEFAULT_SIGNATURE_DATA.name);
    fireEvent.change(nameInput, { target: { value: 'Firma Manual' } });
    await waitFor(() => {
      expect(screen.getByTestId('email-preview').textContent).toContain('Firma Manual');
    });

    // Auth resolves — the manual edit must survive.
    mockAuthUser.user = sessionUser;
    rerender(<EmailEditor {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('email-preview').textContent).toContain('Firma Manual');
    });
    expect(screen.getByTestId('email-preview').textContent).not.toContain('María Pérez');
  });

  it('re-seeds the signature from the session user when a new spitch is selected', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);
    fireEvent.click(screen.getByText('Editar'));

    // Manual edit (non-pristine from now on).
    const nameInput = screen.getByDisplayValue('María Pérez');
    fireEvent.change(nameInput, { target: { value: 'Nombre Editado' } });
    await waitFor(() => {
      expect(screen.getByTestId('email-preview').textContent).toContain('Nombre Editado');
    });

    // A fresh spitch selection resets the signature to the session user.
    fireEvent.change(screen.getByTestId('spitch-selector'), { target: { value: 'spitch-002' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('María Pérez')).toBeInTheDocument();
    });
    expect(screen.getByTestId('email-preview').textContent).toContain('María Pérez');
  });
});
