import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { AttachmentList } from '../AttachmentList';
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
});
