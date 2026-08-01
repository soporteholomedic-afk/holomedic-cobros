'use client';

import type { DxIxBool, FinkelsteinMuneca, FlexoExtensionMuneca } from '@/types/evaluacion-osteomuscular';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';

type Lado = 'dx' | 'ix';

function CheckDxIx({ basePath, checked, lado }: { basePath: string; checked: DxIxBool; lado: Lado }) {
  const { setDxIx } = useEvaluacionContext();
  const label = lado === 'dx' ? 'Dx' : 'Ix';
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer">
      <input
        type="checkbox"
        className="rounded text-sky-600 w-4 h-4"
        checked={checked[lado]}
        onChange={(e) => setDxIx(basePath, lado, e.target.checked)}
      />
      <span className="text-[10px] font-bold uppercase">{label}</span>
    </label>
  );
}

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="w-full h-32 mb-3 bg-slate-100 rounded flex items-center justify-center">
      <span className="text-xs text-slate-400 italic">[Imagen {label}]</span>
    </div>
  );
}

function DxIxPair({ ariaLabel, basePath, checked }: { ariaLabel: string; basePath: string; checked: DxIxBool }) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-4">
      <CheckDxIx basePath={basePath} checked={checked} lado="dx" />
      <CheckDxIx basePath={basePath} checked={checked} lado="ix" />
    </div>
  );
}

const BASE_MUNECA = 'evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano';

const FLEXO_ITEMS: ReadonlyArray<{ field: keyof FlexoExtensionMuneca; label: string }> = [
  { field: 'dolorFlexionContraResistencia', label: 'Dolor en Flexión C/R' },
  { field: 'dolorFlexionPasiva', label: 'Dolor en Flexión Pasiva' },
  { field: 'dolorExtensionContraResistencia', label: 'Dolor en Extensión C/R' },
  { field: 'dolorExtensionPasiva', label: 'Dolor en Extensión Pasiva' },
];

interface MunecaFinkelsteinFlexoExtensionBlockProps {
  finkelstein: FinkelsteinMuneca;
  flexoExtensionMuneca: FlexoExtensionMuneca;
}

export function MunecaFinkelsteinFlexoExtensionBlock({
  finkelstein,
  flexoExtensionMuneca,
}: MunecaFinkelsteinFlexoExtensionBlockProps) {
  const finkelsteinPath = `${BASE_MUNECA}.finkelstein.dolorTabaqueraAnatomica`;
  const flexoPath = (field: keyof FlexoExtensionMuneca) => `${BASE_MUNECA}.flexoExtensionMuneca.${field}`;

  return (
    <div className="space-y-8">
      {/* Test de Finkelstein */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
          Test de Finkelstein (Desviación Ulnar)
        </div>
        <div className="p-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col items-center">
            <ImagePlaceholder label="Test de Finkelstein" />
            <p className="text-[10px] font-bold text-slate-600 text-center uppercase mb-3">
              Dolor en Tabaquera Anatómica
            </p>
            <DxIxPair
              ariaLabel="Dolor en Tabaquera Anatómica"
              basePath={finkelsteinPath}
              checked={finkelstein.dolorTabaqueraAnatomica}
            />
          </div>
        </div>
      </div>

      {/* Flexo-Extensión de la Muñeca */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">
          Flexo-Extensión de la Muñeca — Motilidad Pasiva y Contra Resistencia (C/R)
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FLEXO_ITEMS.map((item) => (
            <div key={item.field} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col items-center">
              <ImagePlaceholder label={item.label} />
              <p className="text-[10px] font-bold text-slate-600 text-center uppercase mb-3">{item.label}</p>
              <DxIxPair ariaLabel={item.label} basePath={flexoPath(item.field)} checked={flexoExtensionMuneca[item.field]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
