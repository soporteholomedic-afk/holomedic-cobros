import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mock dependencies ----

// Mock SpitchSelector
vi.mock('../SpitchSelector', () => ({
  SpitchSelector: vi.fn().mockImplementation(
    ({ target, onSelect, selectedId }: { target: string; onSelect: (s: any) => void; selectedId?: string }) => {
      const React_1 = require('react');
      const [loaded] = React_1.useState(true);
      React_1.useEffect(() => {
        if (loaded) {
          onSelect({
            id: selectedId || 'spitch-001',
            type: target,
            name: 'Test Spitch',
            subject: 'Asunto de prueba',
            bodyHtml: '<p>Contenido de prueba</p>',
          });
        }
      }, [loaded]);
      return React_1.createElement('select', {
        'data-testid': 'spitch-selector',
        'data-target': target,
        value: selectedId || 'spitch-001',
        onChange: () => onSelect({
          id: 'spitch-001',
          type: target,
          name: 'Test Spitch',
          subject: 'Asunto de prueba',
          bodyHtml: '<p>Contenido de prueba</p>',
        }),
      }, React_1.createElement('option', { value: 'spitch-001' }, 'Test Spitch'));
    },
  ),
}));

// Mock AttachmentList
vi.mock('../AttachmentList', () => ({
  AttachmentList: vi.fn().mockImplementation(
    ({ selectedPatients }: { selectedPatients: any }) => {
      const React_1 = require('react');
      const patientIds = Object.keys(selectedPatients || {});
      return React_1.createElement('div', {
        'data-testid': 'attachment-list',
      }, `${patientIds.length} pacientes seleccionados`);
    },
  ),
}));

// Mock fetch for useSendResults
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

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

  it('should render subject input and body textarea', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    expect(screen.getByLabelText('Asunto')).toBeInTheDocument();
    expect(screen.getByLabelText('Contenido del correo')).toBeInTheDocument();
  });

  it('should show live preview of the email body', () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    render(<EmailEditor {...defaultProps} />);

    // The preview div should contain the rendered HTML
    const previewArea = screen.getByTestId('email-preview');
    expect(previewArea).toHaveTextContent('Contenido de prueba');
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
});
