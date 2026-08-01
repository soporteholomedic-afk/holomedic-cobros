'use client';

import type { DxIxBool, DolorMovimientoProximal, DolorPresionPalpacionProximal, ParestesiaNerviosa, SintomatologiaParestesica } from '@/types/evaluacion-osteomuscular';
import { useEvaluacionContext } from '@/features/evaluacion-osteomuscular/presentation/context/EvaluacionOsteomuscularContext';

const BASE = 'evaluacionClinicaOsteomuscular.miembrosSuperiores.munecaMano';
const SPX = `${BASE}.sintomatologiaParestesica`;
type Lado = 'dx' | 'ix';

function CheckSimple({ path, checked, label }: { path: string; checked: boolean; label: string }) {
  const { setField } = useEvaluacionContext();
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-600 cursor-pointer">
      <input type="checkbox" className="rounded text-sky-600 w-4 h-4" checked={checked} onChange={(e) => setField(path, e.target.checked)} />
      {label}
    </label>
  );
}

function CheckDxIx({ basePath, checked, lado }: { basePath: string; checked: DxIxBool; lado: Lado }) {
  const { setDxIx } = useEvaluacionContext();
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" className="rounded text-sky-600 w-4 h-4" checked={checked[lado]} onChange={(e) => setDxIx(basePath, lado, e.target.checked)} />
      <span className="text-[10px] font-bold uppercase">{lado === 'dx' ? 'Dx' : 'Ix'}</span>
    </label>
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

const PRESION_ITEMS: ReadonlyArray<{ field: keyof DolorPresionPalpacionProximal; label: string }> = [
  { field: 'apofisisEspinosa', label: 'Apófisis Espinosa' },
  { field: 'mTrapecioSuperior', label: 'M. Trapecio Superior' },
  { field: 'mParavertebral', label: 'M. Paravertebral' },
];

const MOVIMIENTO_ITEMS: ReadonlyArray<{ field: keyof DolorMovimientoProximal; label: string }> = [
  { field: 'flexion', label: 'Flexión' },
  { field: 'extension', label: 'Extensión' },
  { field: 'inclinacionDerecha', label: 'Inclinación Derecha' },
  { field: 'inclinacionIzquierda', label: 'Inclinación Izquierda' },
  { field: 'rotacionDerecha', label: 'Rotación Derecha' },
  { field: 'rotacionIzquierda', label: 'Rotación Izquierda' },
];

const NERVIOS: ReadonlyArray<{ field: keyof ParestesiaNerviosa; label: string }> = [
  { field: 'nervioMediano', label: 'Nervio Mediano' },
  { field: 'nervioUlnar', label: 'Nervio Ulnar' },
  { field: 'noTerritorializada', label: 'No Territorializada' },
];
function DistalSection({ title, testKey, parestesia }: { title: string; testKey: 'testPhalen' | 'testPresion'; parestesia: ParestesiaNerviosa }) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">{title}</div>
      <div className="p-4">
        {testKey === 'testPhalen' && <div className="w-full h-20 mb-3 bg-slate-100 rounded flex items-center justify-center"><span className="text-xs text-slate-400 italic">[Imagen Test de Phalen]</span></div>}
        <div className="divide-y divide-slate-200">
          {NERVIOS.map((n) => <div key={n.field} className="flex items-center justify-between py-2"><p className="text-[10px] font-bold uppercase text-slate-600">{n.label}</p><DxIxPair ariaLabel={`${title} — ${n.label}`} basePath={`${SPX}.regionDistal.${testKey}.parestesia.${n.field}`} checked={parestesia[n.field]} /></div>)}
        </div>
      </div>
    </div>
  );
}
interface MunecaParestesiaRegionesBlockProps {
  realizaManiobras: boolean;
  molestiaMunecaDxDesdeMeses: number | null;
  molestiaMunecaIxDesdeMeses: number | null;
  sintomatologiaParestesica: SintomatologiaParestesica;
}
export function MunecaParestesiaRegionesBlock({
  realizaManiobras,
  molestiaMunecaDxDesdeMeses,
  molestiaMunecaIxDesdeMeses,
  sintomatologiaParestesica: s,
}: MunecaParestesiaRegionesBlockProps) {
  const { setField } = useEvaluacionContext();
  const px = s.regionProximal;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-6">
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-pointer">Realiza Maniobras <input type="checkbox" className="w-5 h-5 rounded text-sky-600" checked={realizaManiobras} onChange={(e) => setField(`${BASE}.realizaManiobras`, e.target.checked)} /></label>
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Molestia Muñeca Dx Desde (meses) <input type="number" min={0} value={molestiaMunecaDxDesdeMeses ?? ''} onChange={(e) => setField(`${BASE}.molestiaMunecaDxDesdeMeses`, e.target.value === '' ? null : Number(e.target.value))} className="ml-2 w-24 border border-slate-200 rounded-lg p-2 text-sm" placeholder="0" /></label>
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Molestia Muñeca Ix Desde (meses) <input type="number" min={0} value={molestiaMunecaIxDesdeMeses ?? ''} onChange={(e) => setField(`${BASE}.molestiaMunecaIxDesdeMeses`, e.target.value === '' ? null : Number(e.target.value))} className="ml-2 w-24 border border-slate-200 rounded-lg p-2 text-sm" placeholder="0" /></label>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="bg-slate-50 text-center font-bold text-[10px] py-2 border-b border-slate-200 uppercase tracking-widest text-slate-600">Región Proximal</div>
        <div className="p-4 space-y-4">
          <p className="text-[10px] font-bold uppercase text-slate-500">Dolor a la Presión / Palpación</p>
          <div className="flex flex-wrap gap-6">
            {PRESION_ITEMS.map((i) => <CheckSimple key={i.field} label={i.label} path={`${SPX}.regionProximal.dolorPresionPalpacion.${i.field}`} checked={px.dolorPresionPalpacion[i.field]} />)}
          </div>
          <p className="text-[10px] font-bold uppercase text-slate-500">Dolor al Movimiento</p>
          <div className="flex flex-wrap gap-6">
            {MOVIMIENTO_ITEMS.map((i) => <CheckSimple key={i.field} label={i.label} path={`${SPX}.regionProximal.dolorMovimiento.${i.field}`} checked={px.dolorMovimiento[i.field]} />)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4"><p className="text-[10px] font-bold text-slate-600 uppercase mb-3">Test de Fatiga</p><DxIxPair ariaLabel="Test de Fatiga" basePath={`${SPX}.regionProximal.testFatiga.parestesia`} checked={px.testFatiga.parestesia} /></div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4"><p className="text-[10px] font-bold text-slate-600 uppercase mb-3">Test de Candelero</p><DxIxPair ariaLabel="Test de Candelero" basePath={`${SPX}.regionProximal.testCandelero.parestesia`} checked={px.testCandelero.parestesia} /></div>
      </div>
      <DistalSection title="Región Distal — Test de Phalen" testKey="testPhalen" parestesia={s.regionDistal.testPhalen.parestesia} />
      <DistalSection title="Región Distal — Test de Presión" testKey="testPresion" parestesia={s.regionDistal.testPresion.parestesia} />
    </div>
  );
}
