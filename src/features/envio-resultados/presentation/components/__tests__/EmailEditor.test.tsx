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
import type { Patient } from '../../../domain/entities';

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
  selectedPatients: {
    'pat-001': { patientName: 'María Elena García López', files: ['file-001', 'file-002'] },
  },
  patients: mockPatients,
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
});
