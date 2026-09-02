import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { AttachmentList } from '../AttachmentList';
import type { AttachmentRenameItemView } from '../AttachmentList';
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
  {
    id: 'pat-003',
    companyId: 'comp-001',
    name: 'Rosa Isabel Torres Paredes',
    dni: '34567890',
    files: [
      { id: 'file-006', patientId: 'pat-003', name: 'CAMO.pdf', type: 'application/pdf', size: 221184 },
    ],
  },
];

describe('AttachmentList', () => {
  it('should render a summary of file and patient counts', () => {
    const selectedPatients = {
      'pat-001': { patientName: 'María Elena García López', files: ['file-001', 'file-002'] },
      'pat-002': { patientName: 'Carlos Alberto Mendoza Rivas', files: ['file-003'] },
    };

    render(<AttachmentList selectedPatients={selectedPatients} patients={mockPatients} />);

    expect(screen.getByText(/3 archivos adjuntos/i)).toBeInTheDocument();
    expect(screen.getByText(/2 pacientes/i)).toBeInTheDocument();
  });

  it('should list patient names with their selected files', () => {
    const selectedPatients = {
      'pat-001': { patientName: 'María Elena García López', files: ['file-001'] },
    };

    render(<AttachmentList selectedPatients={selectedPatients} patients={mockPatients} />);

    expect(screen.getByText('María Elena García López')).toBeInTheDocument();
    expect(screen.getByText(/CAMO\.pdf/)).toBeInTheDocument();
    // EMO.pdf was not selected
    expect(screen.queryByText(/EMO\.pdf/)).not.toBeInTheDocument();
  });

  it('should show all files when all are selected', () => {
    const selectedPatients = {
      'pat-001': { patientName: 'María Elena García López', files: ['file-001', 'file-002'] },
    };

    render(<AttachmentList selectedPatients={selectedPatients} patients={mockPatients} />);

    expect(screen.getByText(/CAMO\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/EMO\.pdf/)).toBeInTheDocument();
  });

  it('should render empty state when no patients are selected', () => {
    render(<AttachmentList selectedPatients={{}} patients={mockPatients} />);

    expect(screen.getByText(/No hay archivos seleccionados/i)).toBeInTheDocument();
  });

  it('should handle empty patients array gracefully', () => {
    render(<AttachmentList selectedPatients={{}} patients={[]} />);

    expect(screen.getByText(/No hay archivos seleccionados/i)).toBeInTheDocument();
  });

  it('should show file type badges with appropriate colors', () => {
    const selectedPatients = {
      'pat-001': { patientName: 'María Elena García López', files: ['file-001', 'file-002'] },
    };

    render(<AttachmentList selectedPatients={selectedPatients} patients={mockPatients} />);

    // CAMO badge
    const camoBadge = screen.getByText(/CAMO\.pdf/).closest('span');
    expect(camoBadge?.className).toContain('bg-');

    // Should show that files come from 1 patient
    expect(screen.getByText(/1 paciente/i)).toBeInTheDocument();
  });

  // ================================================================
  // WU-5 — rename chips (REQ-01/REQ-03, design §Presentation).
  // AttachmentList stays presentational: items come in via props, the
  // edit affordance exists only when `onRename` is provided, and rows
  // the matcher could not bind (refKey: null) are never editable.
  // ================================================================
  describe('WU-5 — rename chips', () => {
    const REFKEY = '20123456789::12345678::AT-001::LEGAJOS::123CERT.pdf';
    const AUTO = 'CAMO-María García-Proyecto.pdf';

    const baseItem = (over: Partial<AttachmentRenameItemView> = {}): AttachmentRenameItemView => ({
      refKey: REFKEY,
      displayName: '123CERT.pdf',
      storedName: '123CERT.pdf',
      effectiveName: AUTO,
      overridden: false,
      issue: null,
      autoName: AUTO,
      ...over,
    });

    const selection = {
      '12345678': {
        patientName: 'María Elena García López',
        files: ['LEGAJOS::123CERT.pdf'],
      },
    };

    // dni-keyed patient fixture mirroring the real flows
    // (buildReenvioViewData): `Patient.id === dni` and
    // `PatientFile.id === ${path}::${name}`.
    const renamePatients: Patient[] = [
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

    it('renders no rename affordance when renameItems is absent (legacy callers unchanged)', () => {
      render(<AttachmentList selectedPatients={selection} patients={renamePatients} onRename={vi.fn()} />);

      expect(screen.getByText('123CERT.pdf')).toBeInTheDocument();
      expect(screen.queryByLabelText(/Renombrar/)).not.toBeInTheDocument();
    });

    it('shows the effective name as the chip label and the auto name as secondary text when overridden', () => {
      render(
        <AttachmentList
          selectedPatients={selection}
          patients={mockPatients}
          onRename={vi.fn()}
          renameItems={[baseItem({
            effectiveName: 'Informe Juan.pdf',
            overridden: true,
            autoName: AUTO,
          })]}
        />,
      );

      expect(screen.getByText('Informe Juan.pdf')).toBeInTheDocument();
      // Auto name stays visible as secondary/placeholder text (REQ-01).
      expect(screen.getByText(AUTO)).toBeInTheDocument();
    });

    it('opens the inline input with the auto name as placeholder and commits on Enter', () => {
      const onRename = vi.fn();
      render(
        <AttachmentList
          selectedPatients={selection}
          patients={mockPatients}
          onRename={onRename}
          renameItems={[baseItem()]}
        />,
      );

      fireEvent.click(screen.getByLabelText('Renombrar 123CERT.pdf'));

      const input = screen.getByLabelText('Renombrar 123CERT.pdf') as HTMLInputElement;
      expect(input.tagName).toBe('INPUT');
      expect(input).toHaveAttribute('placeholder', AUTO);
      expect(input.value).toBe('');

      fireEvent.change(input, { target: { value: 'Informe Juan' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRename).toHaveBeenCalledTimes(1);
      expect(onRename).toHaveBeenCalledWith(REFKEY, 'Informe Juan');
    });

    it('seeds the inline input with the effective name when the item is already overridden', () => {
      render(
        <AttachmentList
          selectedPatients={selection}
          patients={mockPatients}
          onRename={vi.fn()}
          renameItems={[baseItem({ effectiveName: 'Informe Juan.pdf', overridden: true })]}
        />,
      );

      fireEvent.click(screen.getByLabelText('Renombrar 123CERT.pdf'));
      const input = screen.getByLabelText('Renombrar 123CERT.pdf') as HTMLInputElement;
      expect(input.value).toBe('Informe Juan.pdf');
    });

    it('Escape cancels the edit without committing', () => {
      const onRename = vi.fn();
      render(
        <AttachmentList
          selectedPatients={selection}
          patients={mockPatients}
          onRename={onRename}
          renameItems={[baseItem()]}
        />,
      );

      fireEvent.click(screen.getByLabelText('Renombrar 123CERT.pdf'));
      const input = screen.getByLabelText('Renombrar 123CERT.pdf');
      fireEvent.change(input, { target: { value: 'Borrador no confirmado' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      // Cancel: no commit, back to the chip.
      expect(onRename).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('committing an empty input clears the override (onRename with an empty string)', () => {
      const onRename = vi.fn();
      render(
        <AttachmentList
          selectedPatients={selection}
          patients={mockPatients}
          onRename={onRename}
          renameItems={[baseItem()]}
        />,
      );

      fireEvent.click(screen.getByLabelText('Renombrar 123CERT.pdf'));
      const input = screen.getByLabelText('Renombrar 123CERT.pdf') as HTMLInputElement;
      expect(input.value).toBe('');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onRename).toHaveBeenCalledWith(REFKEY, '');
    });

    it('rows without a matching ref (refKey null) are not editable', () => {
      render(
        <AttachmentList
          selectedPatients={selection}
          patients={mockPatients}
          onRename={vi.fn()}
          renameItems={[baseItem({ refKey: null, effectiveName: '123CERT.pdf' })]}
        />,
      );

      expect(screen.getByText('123CERT.pdf')).toBeInTheDocument();
      expect(screen.queryByLabelText(/Renombrar/)).not.toBeInTheDocument();
    });

    it('invalid override rows render the blocking red chip naming the file and the reason', () => {
      render(
        <AttachmentList
          selectedPatients={selection}
          patients={mockPatients}
          onRename={vi.fn()}
          renameItems={[baseItem({
            issue: { code: 'TRAVERSAL' },
            overridden: false,
          })]}
        />,
      );

      // The chip is identifiable and carries the operator-facing reason.
      const chip = screen.getByTitle(/123CERT\.pdf/);
      expect(chip.className).toContain('red');
      // The edit affordance stays available so the operator can fix it.
      expect(screen.getByLabelText('Renombrar 123CERT.pdf')).toBeInTheDocument();
    });
  });
});
