'use client';

import type { Patient } from '../../domain/entities';
import type { AttachmentRenameItem } from '../helpers/buildAttachmentRenameItems';
import { deliveryNameIssueText } from '../helpers/deliveryNameIssueText';
import { useInlineRename } from '@/components/email/useInlineRename';

/**
 * View projection of a rename row rendered by this list (WU-5, REQ-01).
 * Extends the matcher's item with the no-override auto name so the
 * inline input can show it as the placeholder and the chip can keep it
 * as secondary text while an override applies.
 */
export interface AttachmentRenameItemView extends AttachmentRenameItem {
  /** Delivery name with NO override applied (the REQ-01 placeholder). */
  autoName: string;
}

interface AttachmentListProps {
  selectedPatients: {
    [patientId: string]: {
      patientName: string;
      files: string[];
    };
  };
  patients: Patient[];
  /**
   * WU-5 — rename rows produced by `buildAttachmentRenameItems` (plus
   * the autoName view field), consumed POSITIONALLY: the matcher emits
   * one item per display row, iterating `selectedPatients` in the same
   * order this component does. Optional — when absent the list renders
   * exactly as before (legacy callers unchanged, REQ-02 companions).
   */
  renameItems?: ReadonlyArray<AttachmentRenameItemView>;
  /**
   * WU-5 — commit callback for the inline rename affordance
   * (`refKey` of the matched ref, next raw operator input; an empty
   * string clears the override). The affordance renders only when this
   * is provided, so purely presentational callers keep today's chips.
   */
  onRename?: (refKey: string, next: string) => void;
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

/**
 * Chip classes for a rename row. The badge color follows the STORED
 * name (the file's identity), switching to the blocking red palette
 * when the shared validator produced a typed issue (REQ-03).
 */
function chipClassName(item: AttachmentRenameItemView): string {
  const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium';
  if (item.issue) {
    return `${base} border border-red-300 bg-red-50 text-red-700`;
  }
  return `${base} ${getBadgeColor(item.storedName)}`;
}

/**
 * One inline-rename attachment chip (WU-5): shows the EFFECTIVE
 * delivery name, the auto name as secondary text while an override
 * applies, and — when editable — a pencil that swaps the chip for an
 * inline input (placeholder = auto name; Enter/blur commit, Escape
 * cancels). Rows with `refKey: null` never render as chips: the
 * composer passes them through the legacy branch instead.
 *
 * WU-6 — the Enter/Escape/blur state machine now lives in the shared
 * `useInlineRename` hook (same source as the local-file row in
 * `LocalFileDropZone`), so both affordances can never drift.
 */
function RenameAttachmentChip({
  item,
  onRename,
}: {
  item: AttachmentRenameItemView;
  onRename: (refKey: string, next: string) => void;
}) {
  const rename = useInlineRename((next) => onRename(item.refKey as string, next));

  if (rename.editing) {
    return (
      <input
        type="text"
        value={rename.draft}
        onChange={(e) => rename.setDraft(e.target.value)}
        placeholder={item.autoName}
        aria-label={`Renombrar ${item.storedName}`}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') rename.commit();
          else if (e.key === 'Escape') rename.cancel();
        }}
        onBlur={rename.commitIfActive}
        className="w-56 rounded-full border border-sky-300 px-2 py-0.5 text-xs focus:border-sky-500 focus:outline-none"
      />
    );
  }

  return (
    <span
      className={`${chipClassName(item)} gap-1.5`}
      title={item.issue ? `${item.displayName}: ${deliveryNameIssueText(item.issue)}` : undefined}
    >
      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <span>{item.effectiveName}</span>
      {item.overridden && (
        <span className="text-[10px] text-slate-400 line-through decoration-slate-300">
          {item.autoName}
        </span>
      )}
      <button
        type="button"
        aria-label={`Renombrar ${item.storedName}`}
        onClick={() => rename.open(item.overridden ? item.effectiveName : '')}
        className="cursor-pointer text-slate-400 hover:text-sky-600"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
    </span>
  );
}

export function AttachmentList({ selectedPatients, patients, renameItems, onRename }: AttachmentListProps) {
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

  // WU-5 — positional cursor over the rename items: the matcher emits
  // them patient-group by patient-group in this same iteration order,
  // so a slice per group realigns rows without extra matching logic
  // (this component stays presentational).
  let itemCursor = 0;

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

        const groupStart = itemCursor;
        itemCursor += entry.files.length;
        const groupItems = renameItems
          ? renameItems.slice(groupStart, groupStart + entry.files.length)
          : undefined;

        return (
          <div key={patientId} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-sm font-medium text-slate-700 mb-2">{entry.patientName}</p>
            <div className="flex flex-wrap gap-1.5">
              {fileNames.map((fileName, i) => {
                const item = groupItems?.[i];
                // Legacy row (no rename contract, or a display row the
                // matcher could not bind to any ref — never editable).
                if (!onRename || !item || item.refKey === null) {
                  return (
                    <span
                      key={`${fileName}-${i}`}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getBadgeColor(item?.storedName ?? fileName)}`}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      {item?.displayName ?? fileName}
                    </span>
                  );
                }
                return <RenameAttachmentChip key={`${fileName}-${i}`} item={item} onRename={onRename} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
