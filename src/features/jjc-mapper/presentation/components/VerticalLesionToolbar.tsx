'use client';

import type { LesionType } from '@/types/jjc';
import type { ActiveTool } from '@/features/jjc-mapper/presentation/hooks/useJjcEvaluacion';

type ToolDef = { type: LesionType; label: string; swatch: string; activeRing: string };
const TOOLS: ToolDef[] = [
  { type: 'P', label: 'Pecas (P)', swatch: 'bg-orange-300 border-orange-500', activeRing: 'ring-orange-400' },
  { type: 'L', label: 'Lunar (L)', swatch: 'bg-blue-300 border-blue-500', activeRing: 'ring-blue-400' },
  { type: 'M', label: 'Mancha (M)', swatch: 'bg-green-300 border-green-500', activeRing: 'ring-green-400' },
  { type: 'C', label: 'Cicatriz (C)', swatch: 'bg-purple-300 border-purple-500', activeRing: 'ring-purple-400' },
];

interface VerticalLesionToolbarProps {
  activeTool: ActiveTool;
  onToolChange: (tool: ActiveTool) => void;
}

export function VerticalLesionToolbar({ activeTool, onToolChange }: VerticalLesionToolbarProps) {
  return (
    <div role="toolbar" aria-orientation="vertical" className="flex flex-col gap-2 items-center">
      {TOOLS.map((tool) => {
        const active = activeTool === tool.type;
        return (
          <button
            key={tool.type}
            type="button"
            aria-label={tool.label}
            aria-pressed={active}
            onClick={() => onToolChange(tool.type)}
            className={`w-10 h-10 rounded-lg border-2 text-sm font-bold ${tool.swatch} ${
              active ? `ring-2 ring-offset-1 ${tool.activeRing}` : 'opacity-60 hover:opacity-100'
            } transition-all`}
          >
            {tool.type}
          </button>
        );
      })}
      <div className="w-8 h-px bg-slate-200" role="separator" />
      <button
        type="button"
        aria-label="Eliminar lesión"
        aria-pressed={activeTool === 'delete'}
        onClick={() => onToolChange('delete')}
        className={`w-10 h-10 rounded-lg border-2 text-sm ${
          activeTool === 'delete'
            ? 'border-red-400 bg-red-100 text-red-600 ring-2 ring-red-300 ring-offset-1'
            : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
        } transition-all`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 mx-auto" aria-hidden="true">
          <path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
        </svg>
      </button>
    </div>
  );
}
