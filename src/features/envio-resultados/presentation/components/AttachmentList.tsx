'use client';

import type { Patient } from '../../domain/entities';

interface AttachmentListProps {
  selectedPatients: {
    [patientId: string]: {
      patientName: string;
      files: string[];
    };
  };
  patients: Patient[];
}

const FILE_BADGE_COLORS: Record<string, string> = {
  'CAMO.pdf': 'bg-emerald-100 text-emerald-700',
  'EMO.pdf': 'bg-violet-100 text-violet-700',
  'Legajo.pdf': 'bg-amber-100 text-amber-700',
};

const DEFAULT_BADGE_COLOR = 'bg-slate-100 text-slate-600';

function getBadgeColor(fileName: string): string {
  return FILE_BADGE_COLORS[fileName] || DEFAULT_BADGE_COLOR;
}

export function AttachmentList({ selectedPatients, patients }: AttachmentListProps) {
  const patientIds = Object.keys(selectedPatients);

  if (patientIds.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-400 text-sm">No hay archivos seleccionados</p>
      </div>
    );
  }

  // Build a lookup for patient file names
  const patientFileLookup: Record<string, Record<string, string>> = {};
  for (const patient of patients) {
    patientFileLookup[patient.id] = {};
    for (const file of patient.files) {
      patientFileLookup[patient.id][file.id] = file.name;
    }
  }

  // Count total selected files
  let totalFiles = 0;
  for (const pid of patientIds) {
    totalFiles += selectedPatients[pid].files.length;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
        {totalFiles} archivo{totalFiles !== 1 ? 's' : ''} adjunto{totalFiles !== 1 ? 's' : ''} de {patientIds.length} paciente{patientIds.length !== 1 ? 's' : ''}
      </p>

      {patientIds.map((patientId) => {
        const entry = selectedPatients[patientId];
        const fileNames = entry.files.map(
          (fileId) => patientFileLookup[patientId]?.[fileId] || fileId,
        );

        return (
          <div key={patientId} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-sm font-medium text-slate-700 mb-2">{entry.patientName}</p>
            <div className="flex flex-wrap gap-1.5">
              {fileNames.map((fileName) => (
                <span
                  key={fileName}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(fileName)}`}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  {fileName}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
